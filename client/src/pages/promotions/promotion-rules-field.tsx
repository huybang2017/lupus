import { RemoteSelect } from "@/widgets/form/remote-select";

export interface RuleOperator {
  value: string;
  label: string;
}
export interface RuleAttribute {
  id: string;
  value: string;
  label: string;
  required: boolean;
  field_type: "select" | "multiselect" | "number" | "text";
  operators: RuleOperator[];
  disguised?: boolean;
}
export interface RuleRow {
  /** Server id of an existing condition (new rows have none). */
  id?: string;
  key: string;
  attribute: string;
  operator: string;
  values: string[];
  labels: Record<string, string>;
  required?: boolean;
  disguised?: boolean;
  field_type?: string;
}
export type RuleType = "rules" | "target-rules" | "buy-rules";

let rowSeq = 0;
export const newRow = (patch: Partial<RuleRow> = {}): RuleRow => ({
  key: `row-${rowSeq++}`,
  attribute: "",
  operator: "",
  values: [],
  labels: {},
  ...patch,
});

/** The row Lupus pre-adds for a required (disguised or product) condition. */
export const requiredRow = (a: RuleAttribute): RuleRow =>
  newRow({
    attribute: a.value,
    operator: a.operators[0]?.value ?? "eq",
    required: true,
    disguised: !!a.disguised,
    field_type: a.field_type,
  });

export function rowError(row: RuleRow): string | undefined {
  if (!row.attribute) return "Required field";
  if (!row.operator) return "Required field";
  if (row.values.length === 0 || row.values.some((v) => v.trim() === "")) return "Required field";
  if (row.field_type === "number" && !(Number.isInteger(Number(row.values[0])) && Number(row.values[0]) >= 1)) {
    return "Must be a whole number of at least 1";
  }
  return undefined;
}

const selectStyle = { width: "100%" } as const;

// Lupus's "conditions" editor: rows of  attribute | operator | value(s)  joined by AND,
// with "Add condition" / "Clear all". Required rows (currency, minimum quantity, ...) are
// pre-added, cannot be removed and have their attribute locked.
export function PromotionRulesField(props: {
  title: string;
  description: string;
  ruleType: RuleType;
  rows: RuleRow[];
  onChange: (rows: RuleRow[]) => void;
  attributes: RuleAttribute[];
  showErrors: boolean;
}) {
  const { title, description, ruleType, rows, onChange, attributes, showErrors } = props;
  const update = (key: string, patch: Partial<RuleRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const attr = (value: string) => attributes.find((a) => a.value === value);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600, color: "var(--fg-base)" }}>{title}</h2>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--fg-subtle)" }}>{description}</p>

      {rows.map((row, i) => {
        const a = attr(row.attribute);
        const used = rows.map((r) => r.attribute);
        const options = attributes.filter((x) => x.value === row.attribute || !used.includes(x.value));
        const err = showErrors ? rowError(row) : undefined;
        const operatorLocked = !!a && a.operators.length <= 1;
        const single = row.operator === "eq" || a?.field_type === "select";
        return (
          <div key={row.key}>
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: 8,
                background: "var(--hover-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {row.required ? <span style={{ padding: "0 8px", fontSize: 12, color: "var(--fg-muted)" }}>Required</span> : null}
                {row.required ? (
                  <div style={{ padding: "7px 10px", fontSize: 13, borderRadius: 8, background: "var(--field-bg)", border: "1px solid var(--field-border)", color: "var(--fg-base)" }}>
                    {a?.label ?? row.attribute}
                  </div>
                ) : (
                  <select
                    className="input"
                    style={selectStyle}
                    aria-label="Attribute"
                    value={row.attribute}
                    onChange={(e) => {
                      const next = attr(e.target.value);
                      update(row.key, {
                        attribute: e.target.value,
                        operator: next?.operators.length === 1 ? next.operators[0].value : (next?.operators[0]?.value ?? ""),
                        values: [],
                        labels: {},
                        disguised: !!next?.disguised,
                        field_type: next?.field_type,
                      });
                    }}
                  >
                    <option value="">Select Attribute</option>
                    {options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: "0 0 40%" }}>
                    {operatorLocked ? (
                      <div style={{ padding: "7px 10px", fontSize: 13, borderRadius: 8, background: "var(--field-bg)", border: "1px solid var(--field-border)", color: "var(--fg-base)" }}>
                        {a?.operators[0]?.label}
                      </div>
                    ) : (
                      <select
                        className="input"
                        style={selectStyle}
                        aria-label="Operator"
                        disabled={!row.attribute}
                        value={row.operator}
                        onChange={(e) => {
                          const op = e.target.value;
                          // switching between single and multiple value modes drops the old picks
                          const wasSingle = row.operator === "eq";
                          update(row.key, { operator: op, ...(wasSingle !== (op === "eq") ? { values: [], labels: {} } : {}) });
                        }}
                      >
                        <option value="">Select Operator</option>
                        {(a?.operators ?? []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {a?.field_type === "number" ? (
                      <input
                        className="input"
                        type="number"
                        min={1}
                        step={1}
                        aria-label={a.label}
                        style={{ ...selectStyle, borderColor: err ? "#ef4444" : undefined }}
                        value={row.values[0] ?? ""}
                        onChange={(e) => update(row.key, { values: e.target.value === "" ? [] : [e.target.value] })}
                      />
                    ) : a?.field_type === "text" ? (
                      <input
                        className="input"
                        style={{ ...selectStyle, borderColor: err ? "#ef4444" : undefined }}
                        value={row.values[0] ?? ""}
                        onChange={(e) => update(row.key, { values: e.target.value === "" ? [] : [e.target.value] })}
                      />
                    ) : (
                      <RemoteSelect
                        path={`/admin/promotions/rule-value-options/${ruleType}/${a?.id ?? "none"}`}
                        multiple={!single}
                        disabled={!row.attribute || !row.operator}
                        invalid={!!err}
                        value={row.values}
                        labels={row.labels}
                        placeholder={single ? "Select Value" : "Select Values"}
                        onChange={(values, labels) => update(row.key, { values, labels })}
                      />
                    )}
                  </div>
                </div>
                {err ? (
                  <div role="alert" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ef4444" }}>
                    <span aria-hidden>⚠</span> {err}
                  </div>
                ) : null}
              </div>
              <div style={{ width: 28, flex: "none", alignSelf: "center" }}>
                {!row.required ? (
                  <button
                    type="button"
                    aria-label="Remove condition"
                    onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                    style={{ width: 28, height: 28, border: "none", background: "transparent", cursor: "pointer", color: "var(--fg-muted)", fontSize: 12 }}
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
            {i < rows.length - 1 ? (
              <div style={{ position: "relative", padding: "10px 24px" }}>
                <span style={{ position: "absolute", top: 0, bottom: 0, left: 40, borderLeft: "1px dashed var(--card-border)" }} />
                <span className="badge" style={{ position: "relative", fontSize: 11 }}>
                  AND
                </span>
              </div>
            ) : null}
          </div>
        );
      })}

      <div style={{ marginTop: rows.length ? 24 : 0, display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={attributes.filter((x) => !x.disguised || !rows.some((r) => r.attribute === x.value)).length === 0}
          onClick={() => onChange([...rows, newRow()])}
        >
          Add condition
        </button>
        {rows.some((r) => !r.required) ? (
          <button
            type="button"
            className="btn"
            style={{ background: "transparent", color: "var(--fg-muted)" }}
            onClick={() => onChange(rows.filter((r) => r.required))}
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}
