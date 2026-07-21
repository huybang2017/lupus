import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  parsePaging,
  queryList,
  buildFilters,
  buildOrder,
  escapeLike,
  buildListQuery,
  sendList,
  DEFAULT_LIMIT,
  type FilterSpec,
} from "../modules/infra/list-query"

// Pure unit tests for the shared admin list-query helper. No database needed:
// only the pure builders are exercised here (runList is covered by the
// integration suites that boot the app).

describe("parsePaging", () => {
  it("defaults to limit 50 / offset 0", () => {
    assert.deepEqual(parsePaging({}), { limit: 50, offset: 0 })
    assert.deepEqual(parsePaging(undefined), { limit: 50, offset: 0 })
    assert.deepEqual(parsePaging("nope"), { limit: 50, offset: 0 })
    assert.equal(DEFAULT_LIMIT, 50)
  })

  it("accepts numeric strings", () => {
    assert.deepEqual(parsePaging({ limit: "25", offset: "50" }), { limit: 25, offset: 50 })
  })

  it("clamps limit into 1..100", () => {
    assert.deepEqual(parsePaging({ limit: 0 }), { limit: 1, offset: 0 })
    assert.deepEqual(parsePaging({ limit: -7 }), { limit: 1, offset: 0 })
    assert.deepEqual(parsePaging({ limit: 9999 }), { limit: 100, offset: 0 })
  })

  it("clamps a negative offset to 0", () => {
    assert.deepEqual(parsePaging({ offset: -12 }), { limit: 50, offset: 0 })
  })

  it("falls back to defaults on garbage instead of throwing", () => {
    assert.deepEqual(parsePaging({ limit: "abc", offset: "xyz" }), { limit: 50, offset: 0 })
    assert.deepEqual(parsePaging({ limit: null, offset: {} }), { limit: 50, offset: 0 })
    assert.deepEqual(parsePaging({ limit: ["10"] }), { limit: 10, offset: 0 })
  })

  it("truncates fractional numbers", () => {
    assert.deepEqual(parsePaging({ limit: 9.9, offset: 4.2 }), { limit: 9, offset: 4 })
  })
})

describe("queryList", () => {
  it("splits a comma string", () => {
    assert.deepEqual(queryList("a,b,c"), ["a", "b", "c"])
  })

  it("splits a repeated param array", () => {
    assert.deepEqual(queryList(["a", "b,c"]), ["a", "b", "c"])
  })

  it("trims and drops empty entries", () => {
    assert.deepEqual(queryList([" a ", "", "  ", "b"]), ["a", "b"])
    assert.deepEqual(queryList(" , , "), [])
  })

  it("returns [] for missing values", () => {
    assert.deepEqual(queryList(undefined), [])
    assert.deepEqual(queryList(null), [])
  })

  it("stringifies non-strings", () => {
    assert.deepEqual(queryList(12), ["12"])
    assert.deepEqual(queryList(true), ["true"])
  })
})

describe("escapeLike", () => {
  it("escapes the LIKE metacharacters", () => {
    assert.equal(escapeLike("100%"), "100\\%")
    assert.equal(escapeLike("a_b"), "a\\_b")
    assert.equal(escapeLike("back\\slash"), "back\\\\slash")
    assert.equal(escapeLike("%_\\"), "\\%\\_\\\\")
  })

  it("leaves ordinary text alone", () => {
    assert.equal(escapeLike("plain text"), "plain text")
  })
})

describe("buildFilters", () => {
  const base = "o.deleted_at IS NULL"

  it("always includes the base condition", () => {
    const { where, params } = buildFilters(base, [], {})
    assert.equal(where, "WHERE o.deleted_at IS NULL")
    assert.deepEqual(params, [])
  })

  it("accepts an array of base conditions", () => {
    const { where } = buildFilters(["o.deleted_at IS NULL", "o.is_draft_order=TRUE"], [], {})
    assert.equal(where, "WHERE o.deleted_at IS NULL AND o.is_draft_order=TRUE")
  })

  it("returns an empty where when there is no base and no filters", () => {
    const { where, params } = buildFilters("", [], {})
    assert.equal(where, "")
    assert.deepEqual(params, [])
  })

  it("builds eq and defaults the column to the key", () => {
    const specs: FilterSpec[] = [{ key: "status", op: "eq" }]
    const { where, params } = buildFilters(base, specs, { status: "pending" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND status = $1")
    assert.deepEqual(params, ["pending"])
  })

  it("builds eq against an aliased column", () => {
    const specs: FilterSpec[] = [{ key: "status", column: "o.status", op: "eq" }]
    const { where, params } = buildFilters(base, specs, { status: "completed" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND o.status = $1")
    assert.deepEqual(params, ["completed"])
  })

  it("builds in from a comma list and from a repeated param", () => {
    const specs: FilterSpec[] = [{ key: "id", column: "o.id", op: "in" }]
    assert.deepEqual(buildFilters(base, specs, { id: "a,b" }).params, [["a", "b"]])
    assert.deepEqual(buildFilters(base, specs, { id: ["a", "b"] }).params, [["a", "b"]])
    assert.equal(buildFilters(base, specs, { id: "a,b" }).where, "WHERE o.deleted_at IS NULL AND o.id = ANY($1)")
  })

  it("builds ilike with an escaped pattern and ESCAPE clause", () => {
    const specs: FilterSpec[] = [{ key: "email", column: "o.email", op: "ilike" }]
    const { where, params } = buildFilters(base, specs, { email: "a%b_c" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND o.email ILIKE $1 ESCAPE '\\'")
    assert.deepEqual(params, ["%a\\%b\\_c%"])
  })

  it("can skip LIKE escaping when asked", () => {
    const specs: FilterSpec[] = [{ key: "title", column: "p.title", op: "ilike", escapeLike: false }]
    const { where, params } = buildFilters(base, specs, { title: "50%" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND p.title ILIKE $1 ESCAPE '\\'")
    assert.deepEqual(params, ["%50%%"])
  })

  it("builds ilike_any as an OR over COALESCE-wrapped columns with one param", () => {
    const specs: FilterSpec[] = [{ key: "q", op: "ilike_any", columns: ["o.email", "o.id"] }]
    const { where, params } = buildFilters(base, specs, { q: "bob" })
    assert.equal(
      where,
      "WHERE o.deleted_at IS NULL AND (COALESCE(o.email, '') ILIKE $1 ESCAPE '\\' OR COALESCE(o.id, '') ILIKE $1 ESCAPE '\\')"
    )
    assert.deepEqual(params, ["%bob%"])
  })

  it("builds gte from the _from param and lte from the _to param", () => {
    const specs: FilterSpec[] = [
      { key: "created_at", column: "o.created_at", op: "gte" },
      { key: "created_at", column: "o.created_at", op: "lte" },
    ]
    const { where, params } = buildFilters(base, specs, { created_at_from: "2024-01-01", created_at_to: "2024-02-01" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND o.created_at >= $1 AND o.created_at <= $2")
    assert.deepEqual(params, ["2024-01-01", "2024-02-01"])
  })

  it("ignores a range param that was not sent", () => {
    const specs: FilterSpec[] = [{ key: "total", column: "o.total", op: "gte" }]
    assert.deepEqual(buildFilters(base, specs, {}).params, [])
    assert.equal(buildFilters(base, specs, {}).where, "WHERE o.deleted_at IS NULL")
  })

  it("builds numeric bounds with a ::numeric cast and drops non-numbers", () => {
    const specs: FilterSpec[] = [
      { key: "total", column: "o.total", op: "num_gte" },
      { key: "total", column: "o.total", op: "num_lte" },
    ]
    const ok = buildFilters(base, specs, { total_from: "10", total_to: "20.5" })
    assert.equal(ok.where, "WHERE o.deleted_at IS NULL AND o.total >= $1::numeric AND o.total <= $2::numeric")
    assert.deepEqual(ok.params, [10, 20.5])
    const bad = buildFilters(base, specs, { total_from: "abc", total_to: "20" })
    assert.equal(bad.where, "WHERE o.deleted_at IS NULL AND o.total <= $1::numeric")
    assert.deepEqual(bad.params, [20])
  })

  it("builds bool from true/false/1/0/yes/no/on/off", () => {
    const specs: FilterSpec[] = [{ key: "is_draft_order", column: "o.is_draft_order", op: "bool" }]
    for (const raw of ["true", "TRUE", "1", "yes", "on"]) {
      const built = buildFilters(base, specs, { is_draft_order: raw })
      assert.equal(built.where, "WHERE o.deleted_at IS NULL AND o.is_draft_order = $1::boolean")
      assert.deepEqual(built.params, [true])
    }
    for (const raw of ["false", "0", "no", "off"]) {
      assert.deepEqual(buildFilters(base, specs, { is_draft_order: raw }).params, [false])
    }
    assert.deepEqual(buildFilters(base, specs, { is_draft_order: "maybe" }).params, [])
  })

  it("numbers params sequentially in spec order", () => {
    const specs: FilterSpec[] = [
      { key: "status", column: "o.status", op: "eq" },
      { key: "email", column: "o.email", op: "ilike" },
      { key: "id", column: "o.id", op: "in" },
      { key: "is_draft_order", column: "o.is_draft_order", op: "bool" },
    ]
    const { where, params } = buildFilters(base, specs, {
      status: "pending",
      email: "a@b",
      id: "x,y",
      is_draft_order: "true",
    })
    assert.equal(
      where,
      "WHERE o.deleted_at IS NULL AND o.status = $1 AND o.email ILIKE $2 ESCAPE '\\' AND o.id = ANY($3) AND o.is_draft_order = $4::boolean"
    )
    assert.deepEqual(params, ["pending", "%a@b%", ["x", "y"], true])
  })

  it("never renumbers after a skipped filter", () => {
    const specs: FilterSpec[] = [
      { key: "status", column: "o.status", op: "eq" },
      { key: "handle", column: "p.handle", op: "eq" },
    ]
    const { where, params } = buildFilters(base, specs, { handle: "shirt" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND p.handle = $1")
    assert.deepEqual(params, ["shirt"])
  })

  it("ignores blank values", () => {
    const specs: FilterSpec[] = [{ key: "status", column: "o.status", op: "eq" }]
    assert.deepEqual(buildFilters(base, specs, { status: "" }).params, [])
    assert.deepEqual(buildFilters(base, specs, { status: "   " }).params, [])
    assert.deepEqual(buildFilters(base, specs, {}).params, [])
  })

  it("drops values outside the whitelist without changing the SQL", () => {
    const specs: FilterSpec[] = [{ key: "status", column: "o.status", op: "eq", values: ["pending", "completed"] }]
    const allowedBuild = buildFilters(base, specs, { status: "PENDING" })
    assert.deepEqual(allowedBuild.params, ["PENDING"])
    const rejected = buildFilters(base, specs, { status: "archived" })
    assert.equal(rejected.where, "WHERE o.deleted_at IS NULL")
    assert.deepEqual(rejected.params, [])
  })

  it("drops only the out-of-range members of an in-list", () => {
    const specs: FilterSpec[] = [{ key: "status", column: "o.status", op: "in", values: ["pending", "completed"] }]
    const { where, params } = buildFilters(base, specs, { status: "pending,archived" })
    assert.equal(where, "WHERE o.deleted_at IS NULL AND o.status = ANY($1)")
    assert.deepEqual(params, [["pending"]])
    assert.deepEqual(buildFilters(base, specs, { status: "archived" }).params, [])
  })

  it("applies coerce before binding", () => {
    const specs: FilterSpec[] = [{ key: "currency_code", column: "o.currency_code", op: "eq", coerce: (v) => v.toLowerCase() }]
    const { params } = buildFilters(base, specs, { currency_code: "USD" })
    assert.deepEqual(params, ["usd"])
  })

  it("appends q last, escaped, across all columns with one param", () => {
    const { where, params } = buildFilters(base, [{ key: "status", column: "o.status", op: "eq" }], { status: "pending" }, {
      q: { columns: ["o.email", "o.id"], value: "50%" },
    })
    assert.equal(
      where,
      "WHERE o.deleted_at IS NULL AND o.status = $1 AND (COALESCE(o.email, '') ILIKE $2 ESCAPE '\\' OR COALESCE(o.id, '') ILIKE $2 ESCAPE '\\')"
    )
    assert.deepEqual(params, ["pending", "%50\\%%"])
  })

  it("ignores a blank q and an empty column list", () => {
    assert.deepEqual(buildFilters(base, [], {}, { q: { columns: ["o.email"], value: "   " } }).params, [])
    assert.equal(buildFilters(base, [], {}, { q: { columns: [], value: "x" } }).where, "WHERE o.deleted_at IS NULL")
  })

  it("only ever emits $n placeholders for bound values", () => {
    const specs: FilterSpec[] = [{ key: "email", column: "o.email", op: "ilike" }]
    const { where, params } = buildFilters(base, specs, { email: "'); DROP TABLE \"order\"; --" })
    assert.ok(where.includes("ILIKE $1"))
    assert.ok(!where.includes("DROP TABLE"))
    assert.deepEqual(params, ["%'); DROP TABLE \"order\"; --%"])
  })
})

describe("buildOrder", () => {
  const allowed = { created_at: "o.created_at", total: "o.total" }

  it("passes an ascending key through", () => {
    assert.equal(buildOrder("created_at", allowed), "o.created_at")
  })

  it("turns a leading dash into DESC", () => {
    assert.equal(buildOrder("-created_at", allowed), "o.created_at DESC")
  })

  it("maps a key through the allowlist", () => {
    assert.equal(buildOrder("-total", allowed), "o.total DESC")
    assert.equal(buildOrder("total", allowed), "o.total")
  })

  it("ignores unknown keys", () => {
    assert.equal(buildOrder("nope", allowed), "")
    assert.equal(buildOrder("-nope", allowed), "")
    assert.equal(buildOrder("created_at; DROP TABLE \"order\"", allowed), "")
  })

  it("ignores missing or non-string input", () => {
    assert.equal(buildOrder(undefined, allowed), "")
    assert.equal(buildOrder("", allowed), "")
    assert.equal(buildOrder("   ", allowed), "")
    assert.equal(buildOrder(null, allowed), "")
    assert.equal(buildOrder(7, allowed), "")
    assert.equal(buildOrder(["-total"], allowed), "o.total DESC")
  })
})

describe("buildListQuery", () => {
  const specs: FilterSpec[] = [
    { key: "status", column: "o.status", op: "eq", values: ["pending", "completed"] },
    { key: "id", column: "o.id", op: "in" },
    { key: "email", column: "o.email", op: "ilike" },
  ]

  it("returns the full shape end to end", () => {
    const lq = buildListQuery({
      base: "o.deleted_at IS NULL",
      query: { limit: "10", offset: "20", q: "bob", order: "-total", status: "pending", id: "a,b", email: "b@c" },
      specs,
      q: { columns: ["o.email"] },
      order: { created_at: "o.created_at", total: "o.total" },
      defaultOrder: "o.created_at DESC",
    })
    assert.equal(
      lq.where,
      "WHERE o.deleted_at IS NULL AND o.status = $1 AND o.id = ANY($2) AND o.email ILIKE $3 ESCAPE '\\' AND (COALESCE(o.email, '') ILIKE $4 ESCAPE '\\')"
    )
    assert.deepEqual(lq.params, ["pending", ["a", "b"], "%b@c%", "%bob%"])
    assert.equal(lq.limit, 10)
    assert.equal(lq.offset, 20)
    assert.equal(lq.q, "bob")
    assert.equal(lq.order, "o.total DESC")
    assert.deepEqual(lq.unknown, [])
  })

  it("falls back to defaultOrder and defaultLimit", () => {
    const lq = buildListQuery({
      base: "o.deleted_at IS NULL",
      query: { limit: 9999, order: "bogus", weird: "1" },
      specs,
      order: { created_at: "o.created_at" },
      defaultOrder: "o.created_at DESC",
      defaultLimit: 20,
      maxLimit: 25,
    })
    assert.equal(lq.order, "o.created_at DESC")
    assert.equal(lq.limit, 25)
    assert.deepEqual(lq.unknown, ["weird"])
  })

  it("reports unknown keys but never filters on them", () => {
    const lq = buildListQuery({
      base: "o.deleted_at IS NULL",
      query: { status: "pending", total: "5", nonsense: "x" },
      specs,
    })
    assert.equal(lq.where, "WHERE o.deleted_at IS NULL AND o.status = $1")
    assert.deepEqual(lq.params, ["pending"])
    assert.deepEqual(lq.unknown, ["total", "nonsense"])
  })

  it("does not reserve _from/_to derived keys as unknown", () => {
    const lq = buildListQuery({
      base: "o.deleted_at IS NULL",
      query: { created_at_from: "2024-01-01", created_at_to: "2024-02-01" },
      specs: [
        { key: "created_at", column: "o.created_at", op: "gte" },
        { key: "created_at", column: "o.created_at", op: "lte" },
      ],
    })
    assert.deepEqual(lq.unknown, [])
    assert.deepEqual(lq.params, ["2024-01-01", "2024-02-01"])
  })

  it("tolerates a null or non-object query", () => {
    const lq = buildListQuery({ base: "o.deleted_at IS NULL", query: undefined, specs })
    assert.equal(lq.where, "WHERE o.deleted_at IS NULL")
    assert.deepEqual(lq.params, [])
    assert.equal(lq.limit, 50)
    assert.equal(lq.offset, 0)
    assert.equal(lq.q, "")
    assert.equal(lq.order, "")
  })
})

describe("sendList", () => {
  it("json-sends the body", () => {
    let sent: unknown = null
    sendList(
      {
        json: (body: unknown) => {
          sent = body
          return sent
        },
      },
      { products: [], count: 0, offset: 0, limit: 50 }
    )
    assert.deepEqual(sent, { products: [], count: 0, offset: 0, limit: 50 })
  })
})