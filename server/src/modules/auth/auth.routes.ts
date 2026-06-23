import { Router } from "express"
import { z } from "zod"
import { pool } from "../../db"
import { AuthedRequest, requireAuth } from "../../middleware/require-auth"
import { authService } from "./auth.service"

// Port of Lupus auth endpoints (upstream/src/api/auth/* + store/customer account flow).
// Lupus: multi-provider + session + workflows. Here: emailpass only, JWT stateless.
export const authRouter = Router()

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
})

authRouter.post("/auth/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body)
    const result = await authService.register(input.email, input.password, input.first_name, input.last_name)
    res.status(201).json(result)
  } catch (e) {
    next(e)
  }
})

authRouter.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body)
    res.json(await authService.login(email, password))
  } catch (e) {
    next(e)
  }
})

authRouter.post("/auth/password-reset/request", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body)
    const out = await authService.requestPasswordReset(email)
    if ((out as any).token) {
      // deliver token through the notification pipeline (log provider fallback included)
      await pool.query(`INSERT INTO notification (to_address, channel, template, data, status) VALUES ($1,'email','password-reset',$2,'sent')`, [
        email.toLowerCase().trim(),
        JSON.stringify({ token: (out as any).token }),
      ]).catch(() => undefined)
    }
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

authRouter.post("/auth/password-reset/confirm", async (req, res, next) => {
  try {
    const { token, password } = z.object({ token: z.string(), password: z.string().min(8) }).parse(req.body)
    res.json(await authService.resetPassword(token, password))
  } catch (e) {
    next(e)
  }
})

authRouter.get("/auth/sessions", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json({ sessions: await authService.listSessions(req.auth!.actor_id) })
  } catch (e) {
    next(e)
  }
})

authRouter.post("/auth/sessions/:id/revoke", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    await authService.revokeSession(req.auth!.actor_id, req.params.id)
    res.json({ id: req.params.id, revoked: true })
  } catch (e) {
    next(e)
  }
})
