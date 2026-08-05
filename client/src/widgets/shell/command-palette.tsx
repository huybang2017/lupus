import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RESOURCES } from "@/entities/resources";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";

interface Entry {
  kind: "page" | "action";
  label: string;
  hint?: string;
  run: () => void;
}

// Lupus-style command palette: "Jump to or find anything...", grouped results,
// keyboard navigation, ⌘K / Ctrl+K to open, esc to close.
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { toggle } = useTheme();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries: Entry[] = useMemo(() => {
    const pages: Entry[] = [
      {
        kind: "page",
        label: "Dashboard",
        hint: "Overview",
        run: () => navigate("/"),
      },
      ...RESOURCES.map((r) => ({
        kind: "page" as const,
        label: r.label,
        hint: r.group,
        run: () => navigate(`/r/${r.slug}`),
      })),
      {
        kind: "page",
        label: "Settings",
        hint: "System",
        run: () => navigate("/settings"),
      },
      {
        kind: "page",
        label: "Organize Categories",
        hint: "Catalog",
        run: () => navigate("/r/categories/organize"),
      },
    ];
    const actions: Entry[] = [
      {
        kind: "action",
        label: "Toggle dark / light mode",
        hint: "Theme",
        run: toggle,
      },
      {
        kind: "action",
        label: "Log out",
        hint: "Account",
        run: () => {
          logout();
          navigate("/login", { replace: true });
        },
      },
    ];
    return [...pages, ...actions];
  }, [navigate, logout, toggle]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries.slice(0, 12);
    return entries
      .filter((e) =>
        `${e.label} ${e.hint ?? ""}`.toLowerCase().includes(needle),
      )
      .slice(0, 14);
  }, [entries, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter" && filtered[cursor]) {
        onClose();
        filtered[cursor].run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, cursor, onClose]);

  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 48px))",
          margin: "12vh auto 0",
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
        role="dialog"
        aria-label="Command palette"
      >
        <div
          style={{
            padding: "4px 8px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Jump to or find anything..."
            style={{
              width: "100%",
              background: "none",
              border: "none",
              outline: "none",
              color: "var(--fg-base)",
              fontSize: 14,
              padding: "12px 10px",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--fg-muted)",
              padding: "8px 10px 4px",
            }}
          >
            Jump to
          </div>
          {filtered.length === 0 ? (
            <div
              style={{
                padding: "16px 10px",
                fontSize: 13,
                color: "var(--fg-subtle)",
                textAlign: "center",
              }}
            >
              No results
            </div>
          ) : null}
          {filtered.map((e, i) => (
            <button
              key={`${e.kind}-${e.label}`}
              onClick={() => {
                onClose();
                e.run();
              }}
              onMouseOver={() => setCursor(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                textAlign: "left",
                background: i === cursor ? "var(--hover-bg)" : "none",
                border: "none",
                cursor: "pointer",
                padding: "9px 10px",
                fontSize: 13,
                borderRadius: 8,
                color: "var(--fg-base)",
              }}
            >
              <span style={{ flex: 1 }}>{e.label}</span>
              {e.hint ? (
                <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  {e.hint}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            padding: "10px 16px",
            borderTop: "1px solid var(--card-border)",
            fontSize: 12,
            color: "var(--fg-subtle)",
          }}
        >
          <span>
            Navigation <span className="kbd">↓</span>{" "}
            <span className="kbd">↑</span>
          </span>
          <span>
            Open result <span className="kbd">↵</span>
          </span>
        </div>
      </div>
    </div>
  );
}
