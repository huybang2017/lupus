import { useState, type CSSProperties, type JSX } from "react"
import { FormDrawer, TextField } from "@/widgets/form"

const TABLE: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13,
  tableLayout: "fixed",
}

const TH: CSSProperties = {
  textAlign: "left",
  padding: "0 12px 8px 0",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--fg-subtle)",
  borderBottom: "1px solid var(--card-border)",
  whiteSpace: "nowrap",
}

const TD: CSSProperties = {
  padding: "12px 12px 0 0",
  verticalAlign: "top",
  minWidth: 0,
  overflowWrap: "anywhere",
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
}

export interface MetadataDrawerProps {
  metadata: Record<string, unknown> | null | undefined
  title?: string
  onClose: () => void
  onSaved: () => void
  save: (metadata: Record<string, string>) => Promise<void>
}

interface MetadataRow {
  key: string
  value: string
}

function blankRow(): MetadataRow {
  return { key: "", value: "" }
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "object") {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

export function MetadataDrawer(props: MetadataDrawerProps): JSX.Element {
  const { metadata, title = "Metadata", onClose, onSaved, save } = props
  const [rows, setRows] = useState<MetadataRow[]>(() => [
    ...Object.entries(metadata ?? {}).map(([k, v]) => ({
      key: k,
      value: stringifyValue(v),
    })),
    blankRow(),
  ])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function setCell(index: number, patch: Partial<MetadataRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    )
  }

  function removeRow(index: number) {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [blankRow()] : next
    })
  }

  function addRow() {
    setRows((prev) => [...prev, blankRow()])
  }

  function buildPayload(): Record<string, string> {
    const next: Record<string, string> = {}
    const seen = new Set<string>()
    rows.forEach((r, i) => {
      const k = r.key.trim()
      const v = r.value.trim()
      if (k === "" && v === "") return
      if (k === "")
        throw new Error(`Enter a key for row ${i + 1}, or remove the row.`)
      if (v === "")
        throw new Error(
          `Enter a value for "${k}", or remove the row to delete the key.`,
        )
      if (seen.has(k)) throw new Error(`Duplicate key "${k}".`)
      seen.add(k)
      next[k] = v
    })
    return next
  }

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await save(buildPayload())
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDrawer
      title={title}
      subtitle="Add or remove key/value pairs. Values are stored as strings."
      onClose={onClose}
      onSubmit={() => {
        void submit()
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
      extraActions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={addRow}
          disabled={busy}
        >
          Add row
        </button>
      }
    >
      <table style={TABLE}>
        <thead>
          <tr>
            <th scope="col" style={TH}>
              Key
            </th>
            <th scope="col" style={TH}>
              Value
            </th>
            <th scope="col" style={{ ...TH, width: 44, paddingRight: 0 }}>
              <span style={VISUALLY_HIDDEN}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`row-${i}`}>
              <td style={{ ...TD, paddingLeft: 0 }}>
                <TextField
                  value={r.key}
                  onChange={(v) => setCell(i, { key: v })}
                  placeholder="key"
                />
              </td>
              <td style={TD}>
                <TextField
                  value={r.value}
                  onChange={(v) => setCell(i, { value: v })}
                  placeholder="value"
                />
              </td>
              <td style={{ ...TD, width: 44, paddingRight: 0, verticalAlign: "top" }}>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={busy}
                  title="Remove row"
                  aria-label="Remove row"
                  style={{
                    width: 24,
                    height: 24,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--hover-bg)",
                    border: "1px solid var(--card-border)",
                    borderRadius: 6,
                    color: "var(--fg-subtle)",
                    cursor: busy ? "default" : "pointer",
                    padding: 0,
                    fontSize: 13,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">
        Remove a row to delete its key. The last row stays blank so you can
        always add another pair.
      </div>
    </FormDrawer>
  )
}
