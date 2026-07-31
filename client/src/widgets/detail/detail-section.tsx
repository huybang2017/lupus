import { useState, type ReactNode } from "react"
import { EmptyState } from "@/widgets/ui/primitives"
import { CopyButton } from "@/widgets/ui/copy-button"
import { Settings } from "@/widgets/ui/icons"
import { fmtCell } from "@/widgets/ui/surfaces"

export function DetailSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
          {subtitle ? (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "var(--fg-subtle)",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function CollapsibleSection({
  title,
  subtitle,
  count,
  action,
  defaultOpen = false,
  children,
}: {
  title: string
  subtitle?: string
  count?: number
  action?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((o) => !o)
  return (
    <section className="card" style={{ padding: "20px 24px" }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          toggle()
        }}
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: open ? 12 : 0,
          cursor: "pointer",
          borderRadius: 6,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 12,
                flexShrink: 0,
                transform: open ? "rotate(90deg)" : "none",
                transition: "transform .12s",
                color: "var(--fg-muted)",
              }}
            >
              ▸
            </span>
            <span
              style={{
                minWidth: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {title}
              {typeof count === "number" ? (
                <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>
                  {" "}({count} keys)
                </span>
              ) : null}
            </span>
          </h2>
          {subtitle ? (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                color: "var(--fg-subtle)",
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? (
          <span
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {action}
          </span>
        ) : null}
      </div>
      {open ? children : null}
    </section>
  )
}

export function MetadataSection({
  metadata,
  defaultOpen = false,
  onEdit,
}: {
  metadata: Record<string, unknown> | null | undefined
  defaultOpen?: boolean
  onEdit?: () => void
}) {
  const entries = metadata ? Object.entries(metadata) : []
  const action =
    onEdit || entries.length > 0 ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            title="Edit metadata"
            aria-label="Edit metadata"
            style={{
              width: 24,
              height: 24,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: "1px solid transparent",
              borderRadius: 6,
              color: "var(--fg-muted)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <Settings size={13} />
          </button>
        ) : null}
        {entries.length > 0 ? (
          <CopyButton
            value={JSON.stringify(metadata ?? {}, null, 2)}
            title="Copy metadata"
          />
        ) : null}
      </span>
    ) : null
  return (
    <CollapsibleSection
      title="Metadata"
      count={entries.length}
      defaultOpen={defaultOpen}
      action={action}
    >
      {entries.length === 0 ? (
        <EmptyState title="No metadata" />
      ) : (
        <KV
          rows={entries.map(([k, v]) => [k, fmtCell(v)] as [string, ReactNode])}
        />
      )}
    </CollapsibleSection>
  )
}

export function JsonSection({
  data,
  defaultOpen = false,
}: {
  data: unknown
  defaultOpen?: boolean
}) {
  const text = JSON.stringify(data ?? {}, null, 2)
  const count =
    data && typeof data === "object" ? Object.keys(data as object).length : 0
  return (
    <CollapsibleSection
      title="JSON"
      count={count}
      defaultOpen={defaultOpen}
      action={<CopyButton value={text} title="Copy JSON" />}
    >
      <pre
        className="mono"
        style={{
          background: "var(--hover-bg)",
          borderRadius: 8,
          padding: 12,
          overflowX: "auto",
          fontSize: 12,
          maxHeight: 320,
          overflowY: "auto",
          minWidth: 0,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          whiteSpace: "pre-wrap",
          margin: 0,
        }}
      >
        {text}
      </pre>
    </CollapsibleSection>
  )
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (
    <dl style={{ margin: 0 }}>
      {rows.map((row, i) => {
        const k = Array.isArray(row) ? row[0] : undefined;
        const v = Array.isArray(row) && row.length > 1 ? row[1] : null;
        return (
          <div
            key={`${String(k ?? i)}-${i}`}
            style={{
              display: "flex",
              gap: 16,
              padding: "10px 0",
              borderTop: i === 0 ? "none" : "1px solid var(--card-border)",
              fontSize: 13,
            }}
          >
            <dt
              style={{
                width: 180,
                maxWidth: "45%",
                flexShrink: 0,
                overflowWrap: "break-word",
                color: "var(--fg-subtle)",
              }}
            >
              {k}
            </dt>
            <dd
              style={{
                margin: 0,
                flex: 1,
                minWidth: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {v}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
