import { describe, it } from "node:test"
import assert from "node:assert/strict"
import qs from "qs"
import { buildFilters, type FilterSpec } from "../modules/infra/list-query"

// Lupus dashboard filters reach the server as express/qs parses them:
// created_at[$gte]=... -> { created_at: { $gte } } and status[]=a&status[]=b -> { status: [a, b] }.
const specs: FilterSpec[] = [
  { key: "status", column: "o.status", op: "eq", values: ["pending", "completed", "canceled"] },
  { key: "created_at", column: "o.created_at", op: "gte" },
  { key: "created_at", column: "o.created_at", op: "lte" },
]

describe("list query operators", () => {
  it("reads created_at[$gte] and created_at[$lte]", () => {
    const query = qs.parse("created_at[$gte]=2026-01-01&created_at[$lte]=2026-02-01")
    const { where, params } = buildFilters("TRUE", specs, query)
    assert.match(where, /o\.created_at >= \$1/)
    assert.match(where, /o\.created_at <= \$2/)
    assert.deepEqual(params, ["2026-01-01", "2026-02-01"])
  })

  it("still reads the older created_at_from / created_at_to params", () => {
    const { params } = buildFilters("TRUE", specs, { created_at_from: "2026-01-01", created_at_to: "2026-02-01" })
    assert.deepEqual(params, ["2026-01-01", "2026-02-01"])
  })

  it("uses every value of a repeated eq filter", () => {
    const { where, params } = buildFilters("TRUE", specs, qs.parse("status[]=pending&status[]=canceled"))
    assert.match(where, /o\.status = ANY\(\$1\)/)
    assert.deepEqual(params, [["pending", "canceled"]])
  })

  it("keeps a single eq value as plain equality and ignores values outside the whitelist", () => {
    const one = buildFilters("TRUE", specs, { status: "pending" })
    assert.match(one.where, /o\.status = \$1/)
    const bad = buildFilters("TRUE", specs, qs.parse("status[]=nope&status[]=bogus"))
    assert.equal(bad.params.length, 0)
  })
})
