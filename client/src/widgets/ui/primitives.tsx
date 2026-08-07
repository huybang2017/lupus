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
      {label}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderTop: "1px solid var(--card-border)",
        fontSize: 13,
        color: "var(--fg-subtle)",
      }}
    >
      <div>
        {count === null
          ? `Page ${page}`
          : `${from} – ${to} of ${count} results`}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>
          {totalPages === null
            ? `Page ${page}`
            : `${page} of ${totalPages} pages`}
        </span>
        {btn("Prev", !canPrev, () => onPage(page - 1))}
        {btn("Next", !canNext, () => onPage(page + 1))}
      </div>
    </div>
  );
}

// ---------- RowMenu ("..." dropdown) ----------
export interface RowMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
  divider?: boolean;
  /** Shown greyed out and not clickable; `hint` explains why. */
  disabled?: boolean;
  hint?: string;
}

export function RowMenu({ items }: { items: RowMenuItem[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="listbox"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClose = () => setOpen(false);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose, { capture: true });
    return () => {
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose, { capture: true });
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const mH = menuRef.current.offsetHeight;
    const mW = menuRef.current.offsetWidth;
    const gap = 4;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + gap;
    let left = rect.right - mW;
    left = Math.max(margin, Math.min(left, vw - mW - margin));
    const spaceBelow = vh - rect.bottom - gap;
    if (mH > spaceBelow) {
      top = rect.top - gap - mH;
    }
    top = Math.max(margin, top);
    setPlacement({ top, left });
    const first = menuRef.current.querySelector(
      '[role="menuitem"]',
    ) as HTMLElement;
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open && wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Forget the last position so the next open measures the menu again.
  useEffect(() => {
    if (!open) setPlacement(null);
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ display: "inline-block" }}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--fg-subtle)",
          fontSize: 16,
          padding: "2px 8px",
          borderRadius: 6,
          letterSpacing: 1,
        }}
        aria-label="Row actions"
      >
        ···
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: placement?.top ?? 0,
                left: placement?.left ?? 0,
                visibility: placement ? "visible" : "hidden",
                minWidth: 140,
                maxHeight: "80vh",
                overflowY: "auto",
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                zIndex: 50,
                padding: 4,
              }}
            >
              {items.map((it, idx) => (
                <Fragment key={`${idx}-${it.label}`}>
                  {it.divider && idx > 0 ? (
                    <div
                      aria-hidden="true"
                      style={{
                        height: 1,
                        background: "var(--card-border)",
                        margin: "4px 0",
                        width: "100%",
                      }}
                    />
                  ) : null}
                  <button
                    role="menuitem"
                    disabled={it.disabled}
                    aria-disabled={it.disabled || undefined}
                    title={it.disabled ? it.hint : undefined}
                    onClick={() => {
                      if (it.disabled) return;
                      it.onClick();
                      close();
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: it.disabled ? "not-allowed" : "pointer",
                      opacity: it.disabled ? 0.45 : 1,
                      padding: "8px 12px",
                      fontSize: 13,
                      borderRadius: 6,
                      color: it.danger ? "#ef4444" : "var(--fg-base)",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background = it.disabled ? "none" : "var(--hover-bg)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
                  >
                    {it.label}
                  </button>
                </Fragment>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
