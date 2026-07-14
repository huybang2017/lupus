import { Router } from "express"
import { z } from "zod"
import { handleStripeWebhook, oauthGitHub, oauthGoogle, posthogCapture, sendEmail } from "./external-providers"

// Store OAuth callback endpoints (mirror Lupus auth provider callback routes).
export const oauthRouter = Router()

oauthRouter.post("/auth/github", async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body)
    res.json(await oauthGitHub(code))
  } catch (e) {
    next(e)
  }
})

oauthRouter.post("/auth/google", async (req, res, next) => {
  try {
    const { code, redirect_uri } = z.object({ code: z.string(), redirect_uri: z.string() }).parse(req.body)
    res.json(await oauthGoogle(code, redirect_uri))
  } catch (e) {
    next(e)
  }
})

oauthRouter.post("/auth/notify", async (req, res, next) => {
  try {
    const { to, subject, html, event, actor } = z
      .object({ to: z.string().email(), subject: z.string(), html: z.string(), event: z.string().optional(), actor: z.string().optional() })
      .parse(req.body)
    await sendEmail(to, subject, html)
    if (event) {
      await posthogCapture(event, actor ?? to, { subject })
    }
    res.json({ sent: true })
  } catch (e) {
    next(e)
  }
})

// Stripe webhook (no auth: verified by re-fetching the event from Stripe).
oauthRouter.post("/webhooks/stripe", async (req, res, next) => {
  try {
    const { id } = z.object({ id: z.string() }).passthrough().parse(req.body)
    res.json(await handleStripeWebhook(id))
  } catch (e) {
    next(e)
  }
})
