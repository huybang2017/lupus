import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Search, Store as StoreIcon } from "lucide-react";
import { getResource } from "@/entities/resources";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/providers/theme-provider";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";

interface NavChild {
  slug: string;
  label: string;
}
interface NavEntry {
  label: string;
  to: string;
  children?: NavChild[];
}

// Core domains only — exactly Lupus's six (main-layout.tsx useCoreRoutes).
// Everything else lives in the Settings sidebar.
const NAV: NavEntry[] = [
  { label: "Dashboard", to: "/" },
  {
    label: "Orders",
    to: "/r/orders",
    children: [{ slug: "draft-orders", label: "Drafts" }],
  },
  {
    label: "Products",
    to: "/r/products",
    children: [
      { slug: "collections", label: "Collections" },
      { slug: "categories", label: "Categories" },
      { slug: "product-options", label: "Options" },
    ],
  },
  {
    label: "Inventory",
    to: "/r/inventory-items",
    children: [{ slug: "reservations", label: "Reservations" }],
  },
  {
    label: "Customers",
    to: "/r/customers",
    children: [{ slug: "customer-groups", label: "Customer Groups" }],
  },
  {
    label: "Promotions",
    to: "/r/promotions",
    children: [{ slug: "campaigns", label: "Campaigns" }],
  },
  { label: "Price Lists", to: "/r/price-lists" },
];

// Segment-aware active check (same rule as Lupus isPathActive).
function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(to + "/");
}

function entryOpen(entry: NavEntry, pathname: string) {
  const paths = [
    entry.to,
    ...(entry.children ?? []).map((c) => `/r/${c.slug}`),
  ];
  return paths.some((p) => isPathActive(pathname, p));
}

function itemStyle(active: boolean, nested = false): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: nested ? "5px 10px 5px 22px" : "7px 10px",
    borderRadius: 8,
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 600,
    color: active ? "var(--nav-active-fg)" : "var(--shell-sidebar-fg)",
    background: active ? "var(--nav-active-bg)" : "transparent",
    boxShadow: active ? "0 1px 3px rgba(0,0,0,0.18)" : "none",
    marginBottom: 1,
    boxSizing: "border-box",
  };
}

// ---------- Store switcher header (name + dropdown: store settings, logout) ----------
function StoreHeader() {
  const [name, setName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    let alive = true;
    api("/admin/stores?limit=1&offset=0")
      .then((d) => {
        const first = parseList(d).items[0];
        if (alive) setName(first?.name ?? "Default Store");
      })
      .catch(() => {
        if (alive) setName("Default Store");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const initial = (name ?? "S").charAt(0).toUpperCase();
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr 15px",
          alignItems: "center",
          gap: 12,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "2px 8px 2px 2px",
          borderRadius: 8,
          color: "var(--fg-base)",
        }}
      >
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "#6366f1",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          {initial}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
        >
          {name ?? "…"}
        </span>
        <span
          style={{ color: "var(--fg-muted)", fontSize: 14, letterSpacing: 1 }}
        >
          ···
        </span>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 4px)",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            zIndex: 50,
            padding: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 8px",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "#6366f1",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              {initial}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </div>
              <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                Store
              </div>
            </div>
          </div>
          <div
            style={{
              borderTop: "1px dashed var(--card-border)",
              margin: "4px 0",
            }}
          />
          <Link
            to="/settings/stores"
            onClick={() => setOpen(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px",
              fontSize: 13,
              borderRadius: 6,
              color: "var(--fg-base)",
              textDecoration: "none",
            }}
          >
            <StoreIcon size={15} color="var(--fg-subtle)" /> Store settings
          </Link>
          <div
            style={{
              borderTop: "1px dashed var(--card-border)",
              margin: "4px 0",
            }}
          />
          <button
            onClick={() => {
              setOpen(false);
              logout();
              navigate("/login", { replace: true });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 8,
              fontSize: 13,
              borderRadius: 6,
              color: "var(--fg-base)",
            }}
          >
            <LogOut size={15} color="var(--fg-subtle)" /> Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- User section (dashed divider + user row w/ menu) ----------
export function UserSection() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 8px",
          borderRadius: 8,
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "#6366f1",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {(user?.email?.charAt(0) ?? "U").toUpperCase()}
        </span>
        <span
          style={{
            fontSize: 13,
            color: "var(--fg-subtle)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
        >
          {user?.email}
        </span>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(100% + 4px)",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            zIndex: 50,
            padding: 6,
          }}
        >
          <button
            onClick={() => {
              setOpen(false);
              navigate("/settings/profile");
            }}
            style={menuBtn}
          >
            Profile
          </button>
          <button onClick={toggle} style={menuBtn}>
            {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </button>
          <button
            onClick={() => {
              setOpen(false);
              logout();
              navigate("/login", { replace: true });
            }}
            style={menuBtn}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

const menuBtn: React.CSSProperties = {
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

// ---------- Core sidebar ----------
export function Sidebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { pathname } = useLocation();

  return (
    <aside
      style={{
        width: 248,
        background: "var(--shell-sidebar)",
        color: "var(--shell-sidebar-fg)",
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--card-border)",
      }}
    >
      <div
        style={{
          padding: 12,
          position: "sticky",
          top: 0,
          background: "var(--shell-sidebar)",
          zIndex: 1,
        }}
      >
        <StoreHeader />
        <div
          style={{
            borderTop: "1px dashed var(--card-border)",
            margin: "10px 0 0",
          }}
        />
      </div>
      <nav style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "4px 12px 12px" }}>
        <button
          onClick={onOpenPalette}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "5px 8px 5px 2px",
            borderRadius: 8,
            color: "var(--fg-subtle)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Search size={16} />{" "}
          <span style={{ flex: 1, textAlign: "left" }}>Search</span>{" "}
          <span className="kbd">⌘K</span>
        </button>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            marginTop: 4,
          }}
        >
          {NAV.map((entry) => {
            const open = entryOpen(entry, pathname);
            return (
              <div key={entry.label}>
                <NavLink
                  to={entry.to}
                  style={() => itemStyle(isPathActive(pathname, entry.to))}
                >
                  {entry.label}
                </NavLink>
                {entry.children && open
                  ? entry.children.map((c) => {
                      if (!getResource(c.slug)) return null;
                      return (
                        <NavLink
                          key={c.slug}
                          to={c.slug === "product-options" ? `/r/${c.slug}?is_exclusive=false` : `/r/${c.slug}`}
                          end
                          style={({ isActive }) => itemStyle(isActive, true)}
                        >
                          {c.label}
                        </NavLink>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      </nav>
      <div
        style={{
          padding: "12px",
          position: "sticky",
          bottom: 0,
          background: "var(--shell-sidebar)",
        }}
      >
        <NavLink
          to="/settings"
          state={{ from: pathname }}
          style={() => itemStyle(isPathActive(pathname, "/settings"))}
        >
          Settings
        </NavLink>
        <div
          style={{
            borderTop: "1px dashed var(--card-border)",
            margin: "10px 0",
          }}
        />
        <UserSection />
      </div>
    </aside>
  );
}
