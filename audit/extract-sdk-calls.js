const fs = require("fs")
const path = require("path")

// The upstream checkout stays behind in the old monorepo and is not part of this project;
// point LUPUS_UPSTREAM_ROOT at it (the directory holding packages/), e.g.
//   LUPUS_UPSTREAM_ROOT=C:/Users/ndhba/Documents/lupus node audit/extract-sdk-calls.js
const upstreamRoot = process.env.LUPUS_UPSTREAM_ROOT
if (!upstreamRoot) {
  console.error("LUPUS_UPSTREAM_ROOT is not set. It must point at the upstream checkout (the directory holding packages/).")
  process.exit(1)
}

const root = path.join(upstreamRoot, "packages/admin/dashboard/src/hooks/api")
const calls = new Map()
;(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p)
    else {
      const s = fs.readFileSync(p, "utf8")
      for (const m of s.matchAll(/sdk\.(admin|auth|client)\.([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*)/g)) {
        const k = m[1] + "." + m[2]
        calls.set(k, (calls.get(k) || 0) + 1)
      }
      for (const m of s.matchAll(/sdk\.client\.fetch\(\s*["'`](\w+)["'`]\s*,\s*["'`]([^"'`]+)["'`]/g)) {
        const k = "RAW " + m[1] + " " + m[2]
        calls.set(k, (calls.get(k) || 0) + 1)
      }
    }
  }
})(root)
const sorted = [...calls.entries()].sort((a, b) => a[0].localeCompare(b[0]))
fs.writeFileSync("audit/dashboard-sdk-calls.txt", sorted.map(([k, v]) => k + " x" + v).join("\n"))
console.log("sdk methods used: " + sorted.length)
