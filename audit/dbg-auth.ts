import { pool } from "../server/src/db"
import { readFile } from "fs/promises"

async function main() {
  await pool.query(await readFile("server/src/db/schema-p10-lupus-auth.sql", "utf8")).catch((e: any) => {
    console.log("MIGRATE ERR:", e.message)
  })
  const { buildApp } = await import("../server/src/app")
  const app = buildApp()
  const server = app.listen(0)
  await new Promise<void>((r) => server.once("listening", () => r()))
  const port = (server.address() as any).port
  const base = `http://127.0.0.1:${port}`
  const email = `dbg-${Date.now()}@example.com`
  let r = await fetch(`${base}/auth/user/emailpass/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "supersecret-1" }),
  })
  console.log("register:", r.status, await r.text())
  r = await fetch(`${base}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "supersecret-1" }),
  })
  const loginText = await r.text()
  console.log("login:", r.status, loginText)
  let token = ""
  try {
    token = JSON.parse(loginText).token
  } catch { /* ignore */ }
  r = await fetch(`${base}/auth/mfa/factors`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ provider: "totp", label: "x" }),
  })
  console.log("mfa-start:", r.status, await r.text())
  server.close()
  await pool.end()
}
main().catch((e) => {
  console.log("FATAL", e)
  process.exit(1)
})
