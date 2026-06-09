const fs = require("fs")

function normPath(p) {
  return (
    p
      .replace(/\[([^\]]+)\]/g, ":p")
      .replace(/:[a-zA-Z0-9_]+/g, ":p")
      .replace(/\/$/, "") || "/"
  )
}

const up = fs.readFileSync("audit/upstream-routes.txt", "utf8").split("\n").filter(Boolean)
const lup = fs.readFileSync("audit/lupus-routes.txt", "utf8").split("\n").filter(Boolean)

const upSet = new Set()
const upFiles = new Map() // method+path -> upstream route file path
for (const line of up) {
  const m = line.match(/^(\S+)\s+\[([^\]]*)\]/)
  if (!m) continue
  const p = normPath(m[1])
  for (const meth of m[2].split(",").map((x) => x.trim()).filter(Boolean)) {
    upSet.add(meth + " " + p)
  }
}
const lupSet = new Set()
for (const line of lup) {
  const m = line.match(/^(\S+)\s+(\S+)/)
  if (m) lupSet.add(m[1] + " " + normPath(m[2]))
}

const missing = [...upSet].filter((x) => !lupSet.has(x)).sort()
const extra = [...lupSet].filter((x) => !upSet.has(x)).sort()

function bucket(list) {
  const b = {}
  for (const x of list) {
    const seg = x.split(" ")[1].split("/").slice(0, 3).join("/")
    ;(b[seg] = b[seg] || []).push(x)
  }
  return b
}
const mb = bucket(missing)
const report = []
report.push("UPSTREAM total method-routes (normalized): " + upSet.size)
report.push("LUPUS total method-routes (normalized): " + lupSet.size)
report.push("MISSING: " + missing.length)
report.push("")
for (const [seg, items] of Object.entries(mb).sort((a, b) => b[1].length - a[1].length)) {
  report.push("## " + seg + " (" + items.length + ")")
  for (const i of items) report.push("  " + i)
}
report.push("")
report.push("LUPUS-ONLY: " + extra.length)
for (const x of extra) report.push("  " + x)
fs.writeFileSync("audit/route-diff-report.txt", report.join("\n"))
fs.writeFileSync("audit/missing-routes.txt", missing.join("\n"))
console.log("missing=" + missing.length + " lupus-only=" + extra.length)
