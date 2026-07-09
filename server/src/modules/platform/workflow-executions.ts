import { Router } from "express"
import { pool } from "../../db"
import { requireAuth } from "../../middleware/require-auth"
import type { FilterSpec } from "../infra/list-query"
import { buildListQuery, queryList, sendList } from "../infra/list-query"

// Lupus "Workflows" (Settings): the workflow engine's executions. Lupus runs workflows inside the
// request and logs every run, so an execution is already finished (or failed) when it is listed;
// the shape below is Lupus's so the dashboard reads state, progress and the step history the same way.
export const workflowExecutionsRouter = Router()

// lupus status -> Lupus transaction state
const STATE_OF: Record<string, string> = { running: "invoking", succeeded: "done", failed: "failed", compensated: "reverted" }
const STATUS_OF: Record<string, string> = { invoking: "running", not_started: "running", done: "succeeded", failed: "failed", reverted: "compensated", compensating: "compensated", waiting_to_compensate: "failed" }

export function toWorkflowExecution(row: any) {
  const state = STATE_OF[row.status] ?? "invoking"
  const stepStatus = row.status === "failed" ? "failed" : "ok"
  const steps: Record<string, unknown> = {
    _root: { id: "_root", invoke: { state: state === "invoking" ? "invoking" : "done", status: "idle" }, definition: {} },
  }
  for (const step of row.steps ?? []) {
    steps[`_root.${step.name}`] = {
      id: `_root.${step.name}`,
      invoke: { state: "done", status: stepStatus },
      definition: { action: step.name },
      started_at: step.at,
      data: step.data ?? null,
    }
  }
  const failed = row.status === "failed" && row.error ? [{ action: "workflow", handlerType: "invoke", error: { message: row.error } }] : []
  return {
    id: row.id,
    workflow_id: row.workflow_id,
    transaction_id: row.transaction_id ?? row.id,
    run_id: row.id,
    state,
    status: row.status,
    execution: { steps, hasAsyncSteps: false, hasFailedSteps: row.status === "failed", hasSkippedSteps: false, hasWaitingSteps: false, hasRevertedSteps: row.status === "compensated" },
    context: { data: { payload: row.input ?? {}, invoke: { result: row.output ?? null }, compensate: {} }, errors: failed },
    input: row.input ?? {},
    output: row.output ?? null,
    steps: row.steps ?? [],
    error: row.error ?? null,
    retention_time: null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.finished_at ?? row.created_at,
    finished_at: row.finished_at ?? null,
    deleted_at: null,
  }
}

const FILTERS: FilterSpec[] = [
  { key: "id", column: "w.id", op: "in" },
  { key: "workflow_id", column: "w.workflow_id", op: "in" },
  { key: "transaction_id", column: "w.transaction_id", op: "in" },
  { key: "created_at", column: "w.created_at", op: "gte" },
  { key: "created_at", column: "w.created_at", op: "lte" },
  { key: "updated_at", column: "w.updated_at", op: "gte" },
  { key: "updated_at", column: "w.updated_at", op: "lte" },
]
const SORT = { created_at: "w.created_at", updated_at: "w.updated_at", workflow_id: "w.workflow_id", transaction_id: "w.transaction_id" }

workflowExecutionsRouter.get("/admin/workflows-executions", requireAuth, async (req, res, next) => {
  try {
    const lq = buildListQuery({
      base: "TRUE",
      query: req.query,
      specs: FILTERS,
      q: { columns: ["w.workflow_id", "w.transaction_id"] },
      order: SORT,
      defaultOrder: "w.created_at DESC",
    })
    // state=done&state=failed ... is translated to the status column
    const states = queryList(req.query.state).map((s) => STATUS_OF[s]).filter(Boolean)
    const params = [...lq.params]
    const conditions = [lq.where.replace(/^WHERE\s+/i, "")]
    if (states.length > 0) {
      params.push([...new Set(states)])
      conditions.push(`w.status = ANY($${params.length})`)
    }
    const where = `WHERE ${conditions.filter((c) => c.length > 0).join(" AND ")}`
    const order = lq.order ? `ORDER BY ${lq.order}` : ""
    const total = await pool.query(`SELECT COUNT(*)::int AS c FROM workflow_execution w ${where}`, params)
    const { rows } = await pool.query(`SELECT w.* FROM workflow_execution w ${where} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, lq.limit, lq.offset])
    sendList(res, { workflow_executions: rows.map(toWorkflowExecution), count: Number(total.rows[0].c), offset: lq.offset, limit: lq.limit })
  } catch (e) {
    next(e)
  }
})

workflowExecutionsRouter.get("/admin/workflows-executions/:id", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM workflow_execution WHERE id = $1`, [req.params.id])
    if (!rows[0]) throw Object.assign(new Error(`Workflow execution with id: ${req.params.id} was not found`), { statusCode: 404 })
    res.json({ workflow_execution: toWorkflowExecution(rows[0]) })
  } catch (e) {
    next(e)
  }
})
