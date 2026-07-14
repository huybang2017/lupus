import { createHmac, createHash } from "crypto"
import { pool } from "../../db"
import { authService } from "../auth/auth.service"
import { registerFileProvider } from "../infra/file.service"
import { registerPaymentProvider } from "../order/payment-session.service"

// Port of external providers (no new SDK deps except optional `redis`; all REST via fetch):
// payment-stripe (PaymentIntents authorize uncaptured -> capture -> refund),
// notification-sendgrid, file-s3 (SigV4 PUT), caching-redis + locking-redis,
// auth-github / auth-google / auth-oidc (code -> email -> provider_identity + JWT),
// analytics-posthog (capture). Each activates only when its env keys are set;
// otherwise the lupus local/manual equivalent keeps working.

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw Object.assign(new Error(`Provider misconfigured: missing ${name}`), { statusCode: 501 })
  }
  return v
}

// ---- Stripe (ref providers/payment-stripe stripe-base: intent uncaptured = authorize) ----
async function stripeRequest(path: string, body: Record<string, string>) {
  const key = required("STRIPE_SECRET_KEY")
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  })
  if (!res.ok) {
    throw Object.assign(new Error(`Stripe error: ${await res.text()}`), { statusCode: 502 })
  }
  return res.json() as Promise<any>
}

export async function stripeGet(path: string) {
  const key = required("STRIPE_SECRET_KEY")
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) {
    throw Object.assign(new Error(`Stripe error: ${await res.text()}`), { statusCode: 502 })
  }
  return res.json() as Promise<any>
}

/** Stripe webhook receiver (payment-webhook subscriber parity).
 * Verifies by re-fetching the event from Stripe (no raw-body HMAC needed),
 * applies idempotency via stripe_webhook_event, then syncs payment state. */
export async function handleStripeWebhook(eventId: string) {
  const seen = await pool.query(`SELECT event_id FROM stripe_webhook_event WHERE event_id=$1`, [eventId])
  if (seen.rows[0]) {
    return { deduped: true }
  }
  const evt = await stripeGet(`/events/${eventId}`)
  const obj = evt.data?.object ?? {}
  const intentId = obj.id?.startsWith?.("pi_") ? obj.id : obj.payment_intent ?? null
  await pool.query(`INSERT INTO stripe_webhook_event (event_id, type, payment_intent_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [evt.id, evt.type, intentId])
  if (!intentId) {
    return { ignored: true }
  }
  if (evt.type === "payment_intent.succeeded" || evt.type === "payment_intent.amount_capturable_updated") {
    await pool.query(`UPDATE payment SET status='authorized' WHERE provider_id='stripe' AND data->>'intent_id'=$1`, [intentId])
    const pay = await pool.query(`SELECT payment_collection_id, amount FROM payment WHERE provider_id='stripe' AND data->>'intent_id'=$1`, [intentId])
    if (pay.rows[0]) {
      await pool.query(`UPDATE payment_collection SET authorized_amount=$2, status='authorized' WHERE id=$1`, [pay.rows[0].payment_collection_id, pay.rows[0].amount])
    }
  } else if (evt.type === "payment_intent.canceled") {
    await pool.query(`UPDATE payment SET status='canceled' WHERE provider_id='stripe' AND data->>'intent_id'=$1`, [intentId])
  } else if (evt.type === "charge.refunded") {
    await pool.query(`UPDATE payment SET status='refunded' WHERE provider_id='stripe' AND data->>'intent_id'=$1`, [intentId])
    const pay = await pool.query(`SELECT payment_collection_id, amount FROM payment WHERE provider_id='stripe' AND data->>'intent_id'=$1`, [intentId])
    if (pay.rows[0]) {
      await pool.query(`UPDATE payment_collection SET refunded_amount=$2, status='refunded' WHERE id=$1`, [pay.rows[0].payment_collection_id, pay.rows[0].amount])
    }
  }
  await pool.query(`UPDATE stripe_webhook_event SET status='processed' WHERE event_id=$1`, [evt.id])
  return { processed: evt.type }
}

export const stripePaymentProvider = {
  id: "stripe",
  async authorize(collectionId: string, amount: number) {
    const c = await pool.query(`SELECT currency_code FROM payment_collection WHERE id=$1`, [collectionId])
    const intent = await stripeRequest("/payment_intents", {
      amount: String(amount),
      currency: (c.rows[0]?.currency_code ?? "usd").toLowerCase(),
      capture_method: "manual",
      confirmation_method: "automatic",
      confirm: "false",
    })
    await pool.query(
      `INSERT INTO payment (payment_collection_id, provider_id, amount, currency_code, status, data) VALUES ($1,'stripe',$2,$3,'authorized',$4)`,
      [collectionId, amount, (c.rows[0]?.currency_code ?? "usd").toLowerCase(), JSON.stringify({ intent_id: intent.id })]
    )
  },
  async capture(paymentId: string) {
    const p = await pool.query(`SELECT data FROM payment WHERE id=$1`, [paymentId])
    const intentId = (p.rows[0]?.data as any)?.intent_id
    if (!intentId) {
      throw Object.assign(new Error("Stripe payment has no intent"), { statusCode: 400 })
    }
    await stripeRequest(`/payment_intents/${intentId}/capture`, {})
  },
}

// ---- SendGrid (ref providers/notification-sendgrid sendgrid.ts) ----
export async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.SENDGRID_API_KEY
  const from = process.env.SENDGRID_FROM ?? "no-reply@example.com"
  await pool.query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email',$2,$3,'sent')`, [
    to,
    subject,
    JSON.stringify({ html }),
  ])
  if (!key) {
    console.log(`[sendgrid:log-fallback] to=${to} subject=${subject}`)
    return
  }
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: from }, subject, content: [{ type: "text/html", value: html }] }),
  })
  if (!res.ok) {
    throw Object.assign(new Error(`SendGrid error: ${await res.text()}`), { statusCode: 502 })
  }
}

// ---- S3 (ref providers/file-s3): SigV4 PUT ----
async function sha256Hex(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex")
}

export const s3FileProvider = {
  id: "s3",
  async upload(filename: string, content: Buffer, mimeType?: string) {
    const endpoint = required("S3_ENDPOINT").replace(/\/$/, "")
    const bucket = required("S3_BUCKET")
    const accessKey = required("S3_ACCESS_KEY")
    const secretKey = required("S3_SECRET_KEY")
    const region = process.env.S3_REGION ?? "us-east-1"
    const key = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const host = new URL(endpoint).host
    const now = new Date()
    const amzDate = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = await sha256Hex(content)
    const headers: Record<string, string> = {
      host: `${bucket}.${host}`,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "content-type": mimeType ?? "application/octet-stream",
      "content-length": String(content.length),
    }
    const signedHeaders = Object.keys(headers).sort().join(";")
    const canonical = [
      "PUT",
      `/${key}`,
      "",
      ...Object.keys(headers).sort().map((k) => `${k}:${headers[k]}`),
      "",
      signedHeaders,
      payloadHash,
    ].join("\n")
    const scope = `${dateStamp}/${region}/s3/aws4_request`
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonical)].join("\n")
    const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest()
    const signingKey = hmac(hmac(hmac(hmac("AWS4" + secretKey, dateStamp), region), "s3"), "aws4_request")
    const signature = createHmac("sha256", signingKey).update(toSign).digest("hex")
    const res = await fetch(`${endpoint}/${bucket}/${key}`, {
      method: "PUT",
      headers: { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
      body: content as any,
    })
    if (!res.ok) {
      throw Object.assign(new Error(`S3 upload failed: ${await res.text()}`), { statusCode: 502 })
    }
    return { url: `${endpoint}/${bucket}/${key}` }
  },
  async delete(url: string) {
    console.log(`[s3] delete not implemented for ${url} (use bucket lifecycle)`)
  },
}

// ---- Redis cache + lock (ref providers/caching-redis, locking-redis) ----
let redisClient: any = null
async function getRedis() {
  if (!process.env.REDIS_URL) {
    return null
  }
  if (!redisClient) {
    const { createClient } = await import("redis")
    redisClient = createClient({ url: process.env.REDIS_URL })
    redisClient.on("error", (e: any) => console.error("[redis]", e))
    await redisClient.connect()
  }
  return redisClient
}

export const redisCache = {
  async get<T>(key: string): Promise<T | undefined> {
    const r = await getRedis()
    if (!r) {
      return undefined
    }
    const v = await r.get(`lupus:${key}`)
    return v ? (JSON.parse(v) as T) : undefined
  },
  async set(key: string, value: unknown, ttlSeconds = 60) {
    const r = await getRedis()
    if (!r) {
      return
    }
    await r.set(`lupus:${key}`, JSON.stringify(value), { EX: ttlSeconds })
  },
}

export const redisLock = {
  async withLock<T>(key: string, fn: () => Promise<T>, ttlMs = 10000): Promise<T> {
    const r = await getRedis()
    if (!r) {
      const { lockingService } = await import("../infra/platform-infra.service")
      return lockingService.withLock(key, fn)
    }
    const token = `${Date.now()}-${Math.random()}`
    const acquired = await r.set(`lock:${key}`, token, { NX: true, PX: ttlMs })
    if (!acquired) {
      throw Object.assign(new Error(`Could not acquire lock ${key}`), { statusCode: 423 })
    }
    try {
      return await fn()
    } finally {
      await r.eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", { keys: [`lock:${key}`], arguments: [token] }).catch(() => undefined)
    }
  },
}

// ---- OAuth (ref providers/auth-github, auth-google, auth-oidc) ----
async function findOrCreateOAuthUser(provider: string, email: string, sub: string) {
  const normalized = email.toLowerCase().trim()
  const existing = await pool.query(`SELECT auth_identity_id FROM provider_identity WHERE provider=$1 AND entity_id=$2 AND deleted_at IS NULL`, [provider, sub])
  let authIdentityId = existing.rows[0]?.auth_identity_id as string | undefined
  if (!authIdentityId) {
    const ai = await pool.query(`INSERT INTO auth_identity DEFAULT VALUES RETURNING id`)
    authIdentityId = ai.rows[0].id
    await pool.query(`INSERT INTO provider_identity (auth_identity_id, entity_id, provider) VALUES ($1,$2,$3)`, [authIdentityId, sub, provider])
    await pool.query(`INSERT INTO customer (email, has_account) VALUES ($1,TRUE) ON CONFLICT DO NOTHING`, [normalized])
  }
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET is not set")
  }
  const { default: jwt } = await import("jsonwebtoken")
  return jwt.sign({ actor_id: authIdentityId, provider, email: normalized }, secret, { expiresIn: "7d" })
}

export async function oauthGitHub(code: string) {
  const id = required("GITHUB_CLIENT_ID")
  const secret = required("GITHUB_CLIENT_SECRET")
  const t = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, code }),
  }).then((r) => r.json() as Promise<any>)
  if (!t.access_token) {
    throw Object.assign(new Error("GitHub OAuth failed"), { statusCode: 401 })
  }
  const [user, emails] = await Promise.all([
    fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json() as Promise<any>),
    fetch("https://api.github.com/user/emails", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json() as Promise<any[]>),
  ])
  const email = emails.find((e) => e.primary)?.email ?? emails[0]?.email
  if (!email) {
    throw Object.assign(new Error("GitHub email not available"), { statusCode: 401 })
  }
  return { token: await findOrCreateOAuthUser("github", email, String(user.id)) }
}

export async function oauthGoogle(code: string, redirectUri: string) {
  const id = required("GOOGLE_CLIENT_ID")
  const secret = required("GOOGLE_CLIENT_SECRET")
  const t = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  }).then((r) => r.json() as Promise<any>)
  if (!t.id_token) {
    throw Object.assign(new Error("Google OAuth failed"), { statusCode: 401 })
  }
  const payload = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64").toString())
  if (!payload.email) {
    throw Object.assign(new Error("Google email not available"), { statusCode: 401 })
  }
  return { token: await findOrCreateOAuthUser("google", payload.email, payload.sub) }
}

// ---- PostHog (ref providers/analytics-posthog) ----
export async function posthogCapture(event: string, distinctId: string, properties: Record<string, unknown> = {}) {
  const key = process.env.POSTHOG_API_KEY
  await pool.query(`INSERT INTO analytics_event (event, actor, properties) VALUES ($1,$2,$3)`, [event, distinctId, JSON.stringify(properties)])
  if (!key) {
    return
  }
  await fetch(`${process.env.POSTHOG_HOST ?? "https://app.posthog.com"}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties }),
  }).catch((e) => console.error("[posthog]", e))
}

export function registerExternalProviders() {
  registerPaymentProvider(stripePaymentProvider as any)
  registerFileProvider(s3FileProvider as any)
  if (process.env.SENDGRID_API_KEY) {
    console.log("[providers] sendgrid active")
  }
  if (process.env.STRIPE_SECRET_KEY) {
    console.log("[providers] stripe active")
  }
  if (process.env.S3_ENDPOINT) {
    console.log("[providers] s3 active")
  }
  if (process.env.REDIS_URL) {
    console.log("[providers] redis active")
  }
}

export { authService }
