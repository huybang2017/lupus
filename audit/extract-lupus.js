const fs = require("fs")
const path = require("path")
const root = "server/src"
const out = []
;(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) {
      if (f.name !== "tests") walk(p)
    } else if (/\.(routes|route)\.ts$/.test(f.name)) {
      const s = fs.readFileSync(p, "utf8")
      const base = p.split(path.sep).join("/")
      const methods = [...s.matchAll(/(?:router|app)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi)]
      for (const m of methods) out.push(m[1].toUpperCase() + " " + m[2] + "  <= " + base.replace("server/src/", ""))
    }
  }
})(root)
fs.writeFileSync("audit/lupus-routes.txt", out.sort().join("\n"))
console.log("lupus-routes.txt: " + out.length)
