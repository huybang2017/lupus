import { useNavigate } from "react-router-dom";
import { Drawer } from "@/widgets/ui/primitives";

export interface WizardTab {
  id: string;
  label: string;
}

export function WizardShell({
  title,
  tabs,
  tab,
  onTab,
  closeTo,
  footer,
  children,
  modal,
  onClose,
  onRequestClose,
  disabledTabs,
  wide,
}: {
  title?: string;
  tabs: WizardTab[];
  tab: string;
  onTab: (id: string) => void;
  closeTo: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  modal?: boolean;
  onClose?: () => void;
  onRequestClose?: () => void;
  disabledTabs?: string[];
  wide?: boolean;
}) {
  const navigate = useNavigate();
  const noRail = tabs.length === 0;
  if (modal) {
    return (
      <Drawer
        title={title ?? tabs[0]?.label ?? "Create"}
        onClose={onClose ?? (() => navigate(closeTo))}
        footer={footer}
        style={{
          width: "100vw",
          maxWidth: "100vw",
          borderLeft: "none",
          boxShadow: "none",
        }}
      >
        {children}
      </Drawer>
    );
  }
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {noRail ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 20px",
            borderBottom: "1px solid var(--card-border)",
          }}
        >
          <button
            onClick={() => (onRequestClose ? onRequestClose() : navigate(closeTo))}
            title="Close (esc)"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-subtle)",
              fontSize: 13,
              padding: "6px 8px",
              borderRadius: 8,
            }}
          >
            ✕
          </button>
          <span className="kbd">esc</span>
        </div>
      ) : null}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {noRail ? null : (
          <div
            style={{
              width: 220,
              flexShrink: 0,
              borderRight: "1px solid var(--card-border)",
              padding: "16px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <button
              onClick={() => (onRequestClose ? onRequestClose() : navigate(closeTo))}
              title="Close (esc)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-subtle)",
                fontSize: 13,
                padding: "6px 8px",
                borderRadius: 8,
              }}
            >
              ✕ <span className="kbd">esc</span>
            </button>
            <div style={{ marginTop: 8 }} />
            {tabs.map((t) => {
              const tabDisabled = disabledTabs?.includes(t.id) ?? false;
              return (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                disabled={tabDisabled}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  cursor: tabDisabled ? "not-allowed" : "pointer",
                  opacity: tabDisabled ? 0.45 : 1,
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: "none",
                  background: tab === t.id ? "var(--hover-bg)" : "none",
                  color: tab === t.id ? "var(--fg-base)" : "var(--fg-subtle)",
                }}
              >
                {t.label}
              </button>
              );
            })}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, minWidth: 0 }}>
          <div
            style={{
              maxWidth: wide ? undefined : noRail ? 720 : 640,
              margin: "0 auto",
              padding: wide ? 0 : "28px 24px 72px",
            }}
          >
            {children}
          </div>
        </div>
      </div>
      {footer ? (
        <div
          className="form-actions"
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--card-border)",
            background: "var(--card-bg)",
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
