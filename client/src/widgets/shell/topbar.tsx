import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { getResource } from "@/entities/resources";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";

export function Topbar({
  onOpenPalette,
  onOpenNotifications,
}: {
  onOpenPalette: () => void;
  onOpenNotifications: () => void;
}) {
  const { pathname } = useLocation();
  const params = useParams<{ slug?: string; id?: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [unread, setUnread] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    api("/admin/notifications?limit=1&offset=0")
      .then((d) => {
        if (alive) setUnread(parseList(d).count ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  // The last breadcrumb names the record (#1001, a product title, ...) instead of showing its raw id.
  const resourceForLabel = params.slug ? getResource(params.slug) : undefined;
  const [recordLabel, setRecordLabel] = useState<{ key: string; label: string } | null>(null);
  const recordKey = resourceForLabel && params.id && params.id !== "new" ? `${resourceForLabel.slug}/${params.id}` : "";
  useEffect(() => {
    if (!recordKey || !resourceForLabel?.detailPath || !params.id) return;
    let alive = true;
    api<Record<string, any>>(resourceForLabel.detailPath(params.id))
      .then((d) => {
        const row = d?.[resourceForLabel.detailKey ?? ""] ?? d;
        const text = row?.display_id !== undefined && row?.display_id !== null ? `#${row.display_id}` : (row?.title ?? row?.name ?? row?.code ?? row?.label ?? row?.value ?? row?.email ?? row?.sku ?? row?.workflow_id ?? row?.country_code);
        if (alive && text) setRecordLabel({ key: recordKey, label: String(text) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [recordKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelFor = (id: string) => (recordLabel?.key === recordKey ? recordLabel.label : id);

  const crumbs: { label: string; to?: string }[] = [
    { label: "Admin", to: "/" },
  ];
  const resource = params.slug ? getResource(params.slug) : undefined;
  if (pathname.startsWith("/settings")) {
    crumbs.push({ label: "Settings", to: "/settings" });
    if (resource) crumbs.push({ label: resource.label, ...(params.id ? { to: `/settings/${resource.slug}` } : {}) });
    if (resource && params.id) crumbs.push({ label: labelFor(params.id) });
  } else if (resource) {
    crumbs.push({ label: resource.label, to: `/r/${resource.slug}` });
    if (params.id)
      crumbs.push({ label: params.id === "new" ? "New" : labelFor(params.id) });
  } else if (pathname === "/") {
    crumbs.push({ label: "Dashboard" });
  }

  return (
    <div
      style={{
        height: 52,
        background: "var(--card-bg)",
        borderBottom: "1px solid var(--card-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--fg-subtle)",
          minWidth: 0,
        }}
      >
        {crumbs.map((c, i) => (
          <span
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            {i > 0 ? <span style={{ color: "var(--fg-muted)" }}>/</span> : null}
            {c.to && i < crumbs.length - 1 ? (
              <Link
                to={c.to}
                style={{ color: "inherit", textDecoration: "none" }}
              >
                {c.label}
              </Link>
            ) : (
              <span
                style={
                  i === crumbs.length - 1
                    ? { fontWeight: 600, color: "var(--fg-base)" }
                    : undefined
                }
              >
                {c.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button onClick={onOpenPalette} title="Search (⌘K)" style={iconBtn}>
          ⌕
        </button>
        <button onClick={toggle} title="Toggle theme" style={iconBtn}>
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button
          onClick={onOpenNotifications}
          title="Notifications"
          style={{ ...iconBtn, position: "relative" }}
        >
          🔔
          {unread !== null && unread > 0 ? (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                minWidth: 14,
                height: 14,
                borderRadius: 7,
                background: "#ef4444",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title={user?.email ?? "Account"}
            style={{
              ...iconBtn,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#6366f1",
              color: "#fff",
              borderRadius: "50%",
              width: 28,
              height: 28,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {(user?.email?.charAt(0) ?? "U").toUpperCase()}
          </button>
          {menuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                width: 220,
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: 10,
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                zIndex: 40,
                padding: 6,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-subtle)",
                  padding: "8px 10px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.email}
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings/profile");
                }}
                style={menuItem}
              >
                Profile
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  navigate("/login", { replace: true });
                }}
                style={menuItem}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
  padding: "6px 8px",
  borderRadius: 8,
  color: "var(--fg-subtle)",
};
const menuItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "8px 10px",
  fontSize: 13,
  borderRadius: 6,
  color: "var(--fg-base)",
};
