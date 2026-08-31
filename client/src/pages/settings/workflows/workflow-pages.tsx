import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { StatusBadge, StatusCell } from "@/widgets/cells/status-pill";
import type { StatusColor } from "@/shared/pricing/price-list";
import { DetailSection, JsonSection, KV } from "@/widgets/detail/detail-section";
import { CopyButton } from "@/widgets/ui/copy-button";

const LIST = "/settings/workflows";

const STATE: Record<string, { label: string; color: StatusColor }> = {
  done: { label: "Done", color: "green" },
  failed: { label: "Failed", color: "red" },
  reverted: { label: "Reverted", color: "orange" },
  compensating: { label: "Compensating", color: "orange" },
  waiting_to_compensate: { label: "Waiting to compensate", color: "orange" },
  invoking: { label: "Invoking", color: "grey" },
  not_started: { label: "Not started", color: "grey" },
};

const stateOf = (s: string) => STATE[s] ?? { label: s, color: "grey" as StatusColor };

/** The steps an execution went through (the root entry is the workflow itself). */
export function executionSteps(ex: any): any[] {
  return Object.entries(ex?.execution?.steps ?? {})
    .filter(([id]) => id !== "_root")
    .map(([, step]) => step as any);
}

export function progressOf(ex: any): { done: number; total: number } {
  const steps = executionSteps(ex);
  return { done: steps.filter((s) => s.invoke?.state === "done").length, total: steps.length };
}

export function WorkflowStateCell({ row, badge }: { row: any; badge?: boolean }) {
  const s = stateOf(row.state);
  return badge ? <StatusBadge color={s.color}>{s.label}</StatusBadge> : <StatusCell color={s.color}>{s.label}</StatusCell>;
}

export function IdBadge({ value }: { value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span className="badge badge-gray" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}>
        {value}
      </span>
    </span>
  );
}

export function ProgressCell({ row }: { row: any }) {
  const { done, total } = progressOf(row);
  return total === 0 ? <span style={{ color: "var(--fg-muted)" }}>-</span> : <span>{done} of {total} steps</span>;
}

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-");

// Lupus workflow execution detail: general, timeline of steps, history, payload.
export function WorkflowDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [ex, setEx] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ workflow_execution: any }>(`/admin/workflows-executions/${id}`)
      .then((d) => setEx(d.workflow_execution))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const steps = ex ? executionSteps(ex) : [];
  const { done, total } = ex ? progressOf(ex) : { done: 0, total: 0 };
  const pct = total === 0 ? (ex?.state === "done" ? 100 : 0) : Math.round((done / total) * 100);
  const errors: any[] = ex?.context?.errors ?? [];

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, fontSize: 13 }}>
        <Link to={LIST} style={{ color: "var(--fg-subtle)", textDecoration: "none" }}>
          Workflows
        </Link>
        <span style={{ color: "var(--fg-muted)" }}>›</span>
        <span style={{ fontWeight: 600 }}>{ex?.workflow_id ?? id}</span>
      </div>
      {err ? <Alert>{err}</Alert> : null}
      {!ex && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {ex ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DetailSection title={ex.workflow_id} action={<WorkflowStateCell row={ex} badge />}>
            <KV
              rows={[
                ["Workflow ID", <IdBadge key="w" value={ex.workflow_id} />],
                [
                  "Transaction ID",
                  <span key="t" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IdBadge value={ex.transaction_id} />
                    <CopyButton value={ex.transaction_id} title="Copy transaction ID" />
                  </span>,
                ],
                ["State", <WorkflowStateCell key="s" row={ex} />],
                [
                  "Progress",
                  <span key="p" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 120, height: 6, borderRadius: 3, background: "var(--card-border)", overflow: "hidden" }}>
                      <span style={{ display: "block", width: `${pct}%`, height: "100%", background: ex.state === "failed" ? "#ef4444" : "#22c55e" }} />
                    </span>
                    {total === 0 ? `${pct}%` : `${done} of ${total} steps`}
                  </span>,
                ],
                ["Started", when(ex.created_at)],
                ["Finished", when(ex.finished_at)],
              ]}
            />
          </DetailSection>

          <DetailSection title="Timeline" subtitle="The steps this workflow went through, in order.">
            {steps.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>This execution did not record any steps.</div>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {steps.map((s) => (
                  <li key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                    <StatusCell color={s.invoke?.status === "failed" ? "red" : "green"}>{s.definition?.action ?? s.id}</StatusCell>
                    <span style={{ color: "var(--fg-subtle)" }}>{when(s.started_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </DetailSection>

          <DetailSection title="History" subtitle="What happened during the execution.">
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <li style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Workflow started</span>
                <span style={{ color: "var(--fg-subtle)" }}>{when(ex.created_at)}</span>
              </li>
              {steps.map((s) => (
                <li key={s.id} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Step {s.definition?.action ?? s.id} {s.invoke?.status === "failed" ? "failed" : "completed"}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{when(s.started_at)}</span>
                </li>
              ))}
              {ex.finished_at ? (
                <li style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Workflow {ex.state === "failed" ? "failed" : ex.state === "reverted" ? "was reverted" : "finished"}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{when(ex.finished_at)}</span>
                </li>
              ) : null}
            </ul>
            {errors.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <Alert>{errors.map((e) => e.error?.message ?? "Unknown error").join("; ")}</Alert>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection title="Payload" subtitle="The input the workflow was started with.">
            <pre className="json-pre" style={{ margin: 0, fontSize: 12, overflow: "auto", maxHeight: 280 }}>
              {JSON.stringify(ex.context?.data?.payload ?? {}, null, 2)}
            </pre>
          </DetailSection>

          <JsonSection data={ex} />
        </div>
      ) : null}
    </div>
  );
}
