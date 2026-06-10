const fs = require("fs")
const files = [
  "server/src/tests/checkout.integration.test.ts",
  "server/src/tests/regression.test.ts",
  "server/src/tests/regression-p2.test.ts",
]
for (const f of files) {
  let s = fs.readFileSync(f, "utf8")
  if (s.includes("schema-p10-lupus-auth.sql")) {
    console.log("already " + f)
    continue
  }
  const needle = '"src/db/schema-p9-platform.sql",'
  if (!s.includes(needle)) {
    console.log("NEEDLE MISSING in " + f)
    continue
  }
  s = s.replace(needle, needle + '\n    "src/db/schema-p10-lupus-auth.sql",')
  fs.writeFileSync(f, s)
  console.log("updated " + f)
}
