import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Undo2 } from "lucide-react";
import { api } from "@/shared/api/client";
import { UserSection } from "@/widgets/shell/sidebar";
// Mirrors Lupus SettingsSidebar (settings-layout.tsx): a ← back header,
// grouped plain links (no icons), own user section. It REPLACES the core
// sidebar — settings pages never render both.
interface Entry {
  label: string;
  to: string;
}
interface Group {
  name: string;
  entries: Entry[];
}

interface Flags {
  rbac: boolean;
  translation: boolean;
  view_configurations: boolean;
}

// Lupus's three groups (General, Developer, My Account). The areas Lupus keeps behind a feature
// flag join General when the flag is on; everything else this app offers sits under "Advanced".
function buildGroups(flags: Flags): Group[] {
  const gated: Entry[] = [
    { label: "Roles", to: "/settings/rbac-roles" },
    { label: "Policies", to: "/settings/rbac-policies" },
    { label: "Property Labels", to: "/settings/property-labels" },
    { label: "Translations", to: "/settings/translations" },
  ];
  const on = (e: Entry) =>
    e.to.includes("rbac") ? flags.rbac : e.to.includes("property-labels") ? flags.view_configurations : flags.translation;
  const shown = gated.filter(on);
  const hidden = gated.filter((e) => !on(e));
  const pick = (to: string) => shown.filter((e) => e.to.endsWith(to));
  return [
    {
      name: "General",
      entries: [
        { label: "Store", to: "/settings/stores" },
        { label: "Users", to: "/settings/users" },
        ...pick("rbac-roles"),
        ...pick("rbac-policies"),
        { label: "Regions", to: "/settings/regions" },
        { label: "Tax Regions", to: "/settings/tax-regions" },
        { label: "Return Reasons", to: "/settings/return-reasons" },
        { label: "Refund Reasons", to: "/settings/refund-reasons" },
        { label: "Sales Channels", to: "/settings/sales-channels" },
        { label: "Product Types", to: "/settings/product-types" },
        { label: "Product Tags", to: "/settings/product-tags" },
        { label: "Locations & Shipping", to: "/settings/stock-locations" },
        ...pick("property-labels"),
        ...pick("translations"),
      ],
    },
    {
      name: "Developer",
      entries: [
        { label: "Publishable API Keys", to: "/settings/publishable-api-keys" },
        { label: "Secret API Keys", to: "/settings/secret-api-keys" },
        { label: "Workflows", to: "/settings/workflows" },
      ],
    },
    {
      name: "My Account",
      entries: [{ label: "Profile", to: "/settings/profile" }],
    },
    {
      name: "Advanced",
      entries: [
        { label: "Tax Rates", to: "/settings/tax-rates" },
        { label: "Currencies", to: "/settings/currencies" },
        { label: "Locales", to: "/settings/locales" },
        ...hidden,
        { label: "Views", to: "/settings/views" },
        { label: "Files", to: "/settings/uploads" },
        { label: "Claims", to: "/settings/claims" },
        { label: "Exchanges", to: "/settings/exchanges" },
        { label: "Returns", to: "/settings/returns" },
        { label: "Fulfillment Sets", to: "/settings/fulfillment-sets" },
        { label: "Shipping Options", to: "/settings/shipping-options" },
        { label: "Shipping Profiles", to: "/settings/shipping-profiles" },
        { label: "Shipping Option Types", to: "/settings/shipping-option-types" },
        { label: "Payment Collections", to: "/settings/payment-collections" },
        { label: "Payments", to: "/settings/payments" },
        { label: "Events", to: "/settings/events" },
        { label: "Notifications", to: "/settings/notifications" },
      ],
    },
  ];
}

const OFF: Flags = { rbac: false, translation: false, view_configurations: false };
// Groups Lupus shows open by default
const OPEN_BY_DEFAULT = ["General", "Developer", "My Account"];

// Same guard as Lupus getSafeFromValue: never loop back into /settings.
function safeFrom(from: unknown): string {
  return typeof from === "string" && from && !from.startsWith("/settings")
    ? from
    : "/r/orders";
}

function BackHeader() {
  const location = useLocation();
  const [from, setFrom] = useState("/r/orders");
  useEffect(() => {
    const state = location.state as { from?: unknown } | null;
    if (state?.from) setFrom(safeFrom(state.from));
  }, [location]);
  return (
    <div style={{ padding: 12 }}>
      <Link
        to={from}
        replace
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "5px 8px 5px 2px",
          borderRadius: 8,
          textDecoration: "none",
          color: "var(--fg-base)",
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <Undo2 size={16} color="var(--fg-subtle)" /> Settings
      </Link>
    </div>
  );
}

export function SettingsSidebar() {
  const { pathname } = useLocation();
  const [flags, setFlags] = useState<Flags>(OFF);
  useEffect(() => {
    api<{ feature_flags?: Partial<Flags> }>("/admin/feature-flags")
      .then((d) => setFlags({ ...OFF, ...(d.feature_flags ?? {}) }))
      .catch(() => undefined);
  }, []);
  const GROUPS = useMemo(() => buildGroups(flags), [flags]);
  // The three Lupus groups start open, "Advanced" only when it holds the active route.
  const groupOf = (p: string) =>
    GROUPS.find((g) =>
      g.entries.some((e) => p === e.to || p.startsWith(e.to + "/")),
    )?.name;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of buildGroups(OFF)) init[g.name] = !OPEN_BY_DEFAULT.includes(g.name);
    const active = buildGroups(OFF).find((g) => g.entries.some((e) => window.location.pathname.includes(e.to)))?.name;
    if (active) init[active] = false;
    return init;
  });
  function toggle(name: string) {
    setCollapsed((s) => ({ ...s, [name]: !s[name] }));
  }
  useEffect(() => {
    const active = groupOf(pathname);
    if (active)
      setCollapsed((s) =>
        s[active] === false ? s : { ...s, [active]: false },
      );
  }, [pathname]);

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
          position: "sticky",
          top: 0,
          background: "var(--shell-sidebar)",
          zIndex: 1,
        }}
      >
        <BackHeader />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "0 12px",
          }}
        >
          <div
            style={{
              borderTop: "1px dashed var(--card-border)",
              width: "100%",
            }}
          />
        </div>
      </div>
      <nav style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "8px 12px 12px" }}>
        {GROUPS.map((g, gi) => (
          <div key={g.name} style={{ marginBottom: 4 }}>
            <button
              onClick={() => toggle(g.name)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "6px 8px",
                fontSize: 12,
                color: "var(--fg-subtle)",
              }}
            >
              {g.name}
              <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                {collapsed[g.name] ? "+" : "—"}
              </span>
            </button>
            {!collapsed[g.name]
              ? g.entries.map((e) => (
                  <NavLink
                    key={e.to}
                    to={e.to}
                    style={({ isActive }) => ({
                      display: "block",
                      padding: "5px 8px",
                      borderRadius: 8,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: 600,
                      marginBottom: 1,
                      color: isActive
                        ? "var(--nav-active-fg)"
                        : "var(--fg-subtle)",
                      background: isActive
                        ? "var(--nav-active-bg)"
                        : "transparent",
                    })}
                  >
                    {e.label}
                  </NavLink>
                ))
              : null}
            {gi < GROUPS.length - 1 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "8px 0 4px",
                }}
              >
                <div
                  style={{
                    borderTop: "1px dashed var(--card-border)",
                    width: "100%",
                  }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <div
        style={{
          padding: "12px",
          position: "sticky",
          bottom: 0,
          background: "var(--shell-sidebar)",
        }}
      >
        <div
          style={{
            borderTop: "1px dashed var(--card-border)",
            margin: "0 0 10px",
          }}
        />
        <UserSection />
      </div>
    </aside>
  );
}
