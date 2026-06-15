import { NextFunction, Request, Response } from "express"
import { pool } from "../db"
import { AuthTokenPayload, authService } from "../modules/auth/auth.service"

// Replaces the upstream authenticate middleware (framework auth core plus its HTTP auth guard).
// Reads `Authorization: Bearer <jwt>` issued by auth.service, attaches payload to req.auth.
// Tokens carrying a session id (sid) are checked against auth_session revocation;
// legacy sid-less tokens keep working (backward compatible).
export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" })
    return
  }
  let payload
  try {
    payload = authService.verifyToken(header.slice(7))
  } catch {
    res.status(401).json({ message: "Invalid or expired token" })
    return
  }
  if (!payload.sid) {
    req.auth = payload
    next()
    return
  }
  pool.query(`SELECT revoked, expires_at FROM auth_session WHERE id=$1`, [payload.sid]).then((r) => {
    const s = r.rows[0]
    if (!s || s.revoked || new Date(s.expires_at) < new Date()) {
      res.status(401).json({ message: "Session revoked" })
      return
    }
    req.auth = payload
    next()
  }).catch(() => {
    res.status(401).json({ message: "Session check failed" })
  })
}
