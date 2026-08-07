import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// ---------- Spinner ----------
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid var(--field-border)`,
        borderTopColor: "var(--fg-interactive)",
        animation: "spin 0.7s linear infinite",
        verticalAlign: "middle",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

// ---------- Alert ----------
export function Alert({
  variant = "error",
  children,
}: {
  variant?: "error" | "success" | "info";
  children: ReactNode;
}) {
  const colors =
    variant === "error"
      ? {
          bg: "rgba(239,68,68,0.1)",
          border: "rgba(239,68,68,0.4)",
          fg: "#ef4444",
        }
      : variant === "success"
        ? {
            bg: "rgba(16,185,129,0.1)",
            border: "rgba(16,185,129,0.4)",
            fg: "#10b981",
          }
        : {
            bg: "rgba(99,102,241,0.1)",
            border: "rgba(99,102,241,0.4)",
            fg: "#818cf8",
          };
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        padding: "8px 12px",
        borderRadius: 8,
        marginBottom: 12,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

// ---------- EmptyState ----------
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      style={{
        padding: "48px 20px",
        textAlign: "center",
        color: "var(--fg-subtle)",
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--fg-base)",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {hint ? <div style={{ fontSize: 13 }}>{hint}</div> : null}
    </div>
  );
}

// ---------- Drawer (right slide-over, Lupus style) ----------
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  style,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  style?: React.CSSProperties;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="listbox"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onClick={onClose}>
      <div
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        style={{
          width: "min(560px, 100vw)",
          maxWidth: "min(560px, 100vw)",
          borderLeft: "1px solid var(--card-border)",
          boxShadow: "-8px 0 32px rgba(0, 0, 0, 0.25)",
          ...style,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            {subtitle ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-subtle)",
                  marginTop: 2,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            title="Close (esc)"
            style={{
              background: "var(--hover-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: 6,
              color: "var(--fg-subtle)",
              cursor: "pointer",
              fontSize: 12,
              padding: "3px 8px",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span className="kbd">esc</span> ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {children}
        </div>
        {footer ? (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--card-border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Pagination footer (Lupus: "1 – 4 of 4 results" + "1 of 1 pages Prev Next") ----------
export function PaginationFooter({
  page,
  limit,
  count,
  onPage,
}: {
  page: number;
  limit: number;
  count: number | null;
  onPage: (p: number) => void;
}) {
  const totalPages =
    count === null ? null : Math.max(1, Math.ceil(count / limit));
  const from = count === 0 ? 0 : (page - 1) * limit + 1;
  const to = count === null ? page * limit : Math.min(page * limit, count);
  const canPrev = page > 1;
  const canNext = totalPages === null ? true : page < totalPages;
  const btn = (label: string, disabled: boolean, onClick: () => void) => (
    <button
      key={label}
      className="btn btn-secondary"
      disabled={disabled}
      onClick={onClick}
      style={{ padding: "5px 12px", fontWeight: 500 }}
    >
