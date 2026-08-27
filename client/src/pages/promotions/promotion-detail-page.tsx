import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert, EmptyState, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DetailSection, JsonSection, KV, MetadataSection } from "@/widgets/detail/detail-section";
import { CopyButton } from "@/widgets/ui/copy-button";
import { useConfirm } from "@/widgets/confirm";
import { CampaignDrawer, EditConditionsDrawer, EditPromotionDrawer } from "@/pages/promotions/promotion-drawers";
import type { RuleType } from "@/pages/promotions/promotion-rules-field";

const DOT: Record<string, string> = { green: "#22c55e", red: "#ef4444", grey: "#9ca3af", orange: "#f59e0b" };

// Lupus getPromotionStatus: a campaign can schedule or expire an otherwise active promotion.
function promotionStatus(p: any): [string, string] {
  const c = p.campaign;
  const now = new Date();
  if (c) {
    if (c.starts_at && new Date(c.starts_at) > now) return ["orange", "Campaign scheduled"];
    const b = c.budget;
    const over = b && b.limit && Number(b.used) > Number(b.limit);
    if ((c.ends_at && new Date(c.ends_at) < now) || over) return ["red", "Campaign expired"];
  }
  if (p.status === "active") return ["green", "Active"];
  if (p.status === "inactive") return ["red", "Inactive"];
  return ["grey", "Draft"];
}

function StatusBadge({ color, text }: { color: string; text: string }) {
  return (
    <span className="badge" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: DOT[color] }} />
      {text}
    </span>
  );
}

function money(value: number, currency: string): string {
  try {
    const f = new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() });
    // promotion amounts are stored in minor units, like every other price in the app
    return f.format(value / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2));
  } catch {
    return `${value.toLocaleString()} ${currency.toUpperCase()}`;
  }
}

function displayValue(p: any): string | null {
  const m = p.application_method ?? {};
  if (m.value == null) return null;
  if (m.type === "fixed") return m.currency_code ? money(Number(m.value), m.currency_code) : null;
  if (m.type === "percentage") return `${Number(m.value)}%`;
  return null;
}

const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "-");

function RuleBlock({ rule }: { rule: any }) {
  const values: string[] = (rule.field_type === "number" ? [rule.values] : (rule.values ?? []).map((v: any) => v.label)).filter(
    (v: unknown) => v !== undefined && v !== null && v !== "",
  );
  const shown = values.slice(0, 2);
  const rest = values.length - shown.length;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: 8,
        background: "var(--hover-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: 8,
        fontSize: 12,
      }}
    >
      <span className="badge" style={{ fontWeight: 600 }}>
        {rule.attribute_label}
      </span>
      <span style={{ color: "var(--fg-subtle)" }}>{rule.operator_label}</span>
      {shown.map((v) => (
        <span key={String(v)} className="badge badge-gray">
          {String(v)}
        </span>
      ))}
      {rest > 0 ? <span style={{ color: "var(--fg-subtle)" }}>+{rest} more</span> : null}
    </div>
  );
}

function ConditionsSection({ title, rules, onEdit }: { title: string; rules: any[]; onEdit: () => void }) {
  return (
    <DetailSection title={title} action={<RowMenu items={[{ label: "Edit", onClick: onEdit }]} />}>
      {rules.length === 0 ? (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <EmptyState title="No records" hint="Add a condition to restrict what items the promotion applies to." />
          <button className="btn btn-secondary" onClick={onEdit}>
            Add condition
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rules.map((r) => (
            <RuleBlock key={`${r.id ?? r.attribute}-${r.attribute}`} rule={r} />
          ))}
        </div>
      )}
    </DetailSection>
  );
}

export function PromotionDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [promo, setPromo] = useState<any>(null);
  const [rules, setRules] = useState<Record<RuleType, any[]>>({ rules: [], "target-rules": [], "buy-rules": [] });
  const [err, setErr] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<null | "edit" | "campaign" | RuleType>(null);

  function load() {
    setErr(null);
    api<{ promotion: any }>(`/admin/promotions/${id}`)
      .then((d) => {
        setPromo(d.promotion);
        const types: RuleType[] = d.promotion.type === "buyget" ? ["rules", "target-rules", "buy-rules"] : ["rules", "target-rules"];
        return Promise.all(types.map((t) => api<{ rules: any[] }>(`/admin/promotions/${id}/${t}`).then((r) => [t, r.rules] as const)));
      })
      .then((pairs) => setRules({ rules: [], "target-rules": [], "buy-rules": [], ...Object.fromEntries(pairs) }))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to delete the promotion ${promo?.code}. This action cannot be undone.`,
      confirmLabel: "Delete",
      verifyText: promo?.code,
    });
    if (!ok) return;
    try {
      await api(`/admin/promotions/${id}`, { method: "DELETE" });
      navigate("/r/promotions", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const m = promo?.application_method ?? {};
  const isBuyGet = promo?.type === "buyget";
  const [statusColor, statusText] = promo ? promotionStatus(promo) : ["grey", ""];
  const shipping = m.target_type === "shipping_methods";
  const value = promo ? displayValue(promo) : null;

  const saved = () => {
    setDrawer(null);
    load();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Link to="/r/promotions" style={{ color: "var(--fg-subtle)", textDecoration: "none", fontSize: 13 }}>
          Promotions
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>â€º</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{promo?.code ?? id}</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!promo && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {promo ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 16, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <DetailSection
              title={promo.code}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StatusBadge color={statusColor} text={statusText} />
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setDrawer("edit") },
                      { label: "Delete", danger: true, onClick: del },
                    ]}
                  />
                </div>
              }
            >
              <KV
                rows={[
                  ["Method", promo.is_automatic ? "Automatic" : "Promotion code"],
                  [
                    "Code",
                    <span key="code" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="badge badge-gray">{promo.code}</span>
                      <CopyButton value={promo.code} />
                    </span>,
                  ],
                  ["Type", cap(promo.type)],
                  [
                    "Value",
                    <span key="value" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {value ?? "-"}
                      {m.type === "fixed" && m.currency_code ? <span className="badge badge-gray">{String(m.currency_code).toUpperCase()}</span> : null}
                    </span>,
                  ],
                  ["Allocation", cap(m.allocation)],
                  ...(m.type === "fixed" ? [["Tax Inclusive", promo.is_tax_inclusive ? "True" : "False"] as [string, string]] : []),
                  ...(m.max_quantity != null ? [["Maximum Quantity", String(m.max_quantity)] as [string, string]] : []),
                  ...(typeof promo.usage_limit === "number"
                    ? [["Usage Limit", `${promo.usage_count ?? 0} / ${promo.usage_limit}`] as [string, string]]
                    : []),
                ]}
              />
            </DetailSection>

            <ConditionsSection title="Who can use this code?" rules={rules.rules} onEdit={() => setDrawer("rules")} />
            {!shipping ? (
              <ConditionsSection
                title="What items will the promotion be applied to?"
                rules={rules["target-rules"]}
                onEdit={() => setDrawer("target-rules")}
              />
            ) : null}
            {isBuyGet ? (
              <ConditionsSection
                title="What needs to be in the cart to unlock the promotion?"
                rules={rules["buy-rules"]}
                onEdit={() => setDrawer("buy-rules")}
              />
            ) : null}

            <EditableMetadata metadata={promo.metadata} path={`/admin/promotions/${id}`} onSaved={load} />
            <JsonSection data={promo} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <DetailSection
              title="Campaign"
              action={
                <RowMenu
                  items={[
                    ...(promo.campaign ? [{ label: "Go to campaign", onClick: () => navigate(`/r/campaigns/${promo.campaign.id}`) }] : []),
                    { label: "Edit", onClick: () => setDrawer("campaign") },
                  ]}
                />
              }
            >
              {promo.campaign ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span>{promo.campaign.name}</span>
                    <span style={{ color: "var(--fg-muted)" }}>Â·</span>
                    <span style={{ color: "var(--fg-subtle)", fontWeight: 500 }}>{promo.campaign.campaign_identifier}</span>
                  </div>
                  {[
                    ["Start", promo.campaign.starts_at],
                    ["End", promo.campaign.ends_at],
                  ].map(([label, at]) => (
                    <div key={label} style={{ display: "grid", gridTemplateColumns: "48px 1fr", fontSize: 12, color: "var(--fg-subtle)" }}>
                      <span style={{ fontWeight: 600 }}>{label}</span>
                      <span>{at ? new Date(at).toLocaleString() : "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "8px 0" }}>
                  <EmptyState title="Not part of a campaign" hint="Add this promotion to an existing campaign" />
                  <button className="btn btn-secondary" onClick={() => setDrawer("campaign")}>
                    Add to Campaign
                  </button>
                </div>
              )}
            </DetailSection>
          </div>
        </div>
      ) : null}

      {promo && drawer === "edit" ? <EditPromotionDrawer promotion={promo} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {promo && drawer === "campaign" ? <CampaignDrawer promotion={promo} onClose={() => setDrawer(null)} onSaved={saved} /> : null}
      {promo && (drawer === "rules" || drawer === "target-rules" || drawer === "buy-rules") ? (
        <EditConditionsDrawer promotion={promo} ruleType={drawer} onClose={() => setDrawer(null)} onSaved={saved} />
      ) : null}
    </div>
  );
}
