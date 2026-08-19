import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { fmtMoney } from "@/shared/formatting/money";
import { useAuth } from "@/providers/auth-provider";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FulfillmentStatusCell, PaymentStatusCell } from "@/widgets/cells/order-status";

interface Dashboard {
  days: number;
  currency: string;
  currencies: string[];
  low_stock_at: number;
  kpis: Record<"revenue" | "orders" | "aov" | "customers" | "refunds", { value: number; previous: number; change: number | null }>;
  series: { day: string; revenue: number; orders: number }[];
  top_products: { product_id: string | null; title: string; thumbnail: string | null; units: number; revenue: number }[];
  channels: { name: string; revenue: number; orders: number }[];
  recent_orders: any[];
  attention: Record<"awaiting_payment" | "to_fulfill" | "open_returns" | "draft_orders" | "low_stock" | "draft_products", number>;
  totals: { products: number; customers: number; orders: number };
  payment_breakdown: { key: string; count: number }[];
  fulfillment_breakdown: { key: string; count: number }[];
  weekdays: { dow: number; orders: number; revenue: number }[];
  countries: { country: string; orders: number; revenue: number }[];
  customers: { buyers: number; returning: number; repeat_rate: number };
  carts: { created: number; completed: number; abandoned: number; conversion_rate: number };
  discounts: { total: number; orders: number; share: number };
  low_stock_items: { id: string; title: string; sku: string | null; available: number }[];
}

const RANGES = [7, 30, 90];
const card: React.CSSProperties = { padding: "18px 20px" };
const muted: React.CSSProperties = { color: "var(--fg-subtle)", fontSize: 12 };
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

// "▲ 12.5%" against the previous period of the same length (green up, red down; a refund going up is not good news).
function Delta({ change, inverse }: { change: number | null; inverse?: boolean }) {
  if (change === null) return <span style={muted}>new</span>;
  if (change === 0) return <span style={muted}>no change</span>;
  const good = inverse ? change < 0 : change > 0;
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: good ? "#22c55e" : "#ef4444" }}>
      {change > 0 ? "▲" : "▼"} {Math.abs(change)}%
    </span>
  );
}

function Kpi({ label, value, change, inverse, hint }: { label: string; value: string; change: number | null; inverse?: boolean; hint: string }) {
  return (
    <div className="card" style={card}>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 4px" }}>{value}</div>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        <Delta change={change} inverse={inverse} />
        <span style={muted}>{hint}</span>
      </div>
    </div>
  );
}

// Revenue per day as an area chart; hovering a day shows its figures.
function SalesChart({ series, currency, metric }: { series: Dashboard["series"]; currency: string; metric: "revenue" | "orders" }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 8, r: 8, t: 12, b: 24 };
  const values = series.map((s) => s[metric]);
  const max = Math.max(1, ...values);
  const x = (i: number) => pad.l + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;
  const ticks = [0, Math.floor((series.length - 1) / 2), series.length - 1].filter((v, i, a) => a.indexOf(v) === i && series[v]);
  const fmt = (v: number) => (metric === "revenue" ? fmtMoney(v, currency) : String(v));

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${metric} per day`} style={{ display: "block" }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="var(--card-border)" strokeDasharray="3 4" />
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--card-border)" />
        <path d={area} fill="rgba(99,102,241,0.14)" />
        <path d={line} fill="none" stroke="#818cf8" strokeWidth={2} strokeLinejoin="round" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize={11} fill="var(--fg-subtle)" textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"}>
            {day(series[i].day)}
          </text>
        ))}
        {series.map((s, i) => (
          <rect key={s.day} x={x(i) - (W / series.length) / 2} y={0} width={W / series.length} height={H - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--fg-muted)" strokeDasharray="2 3" />
            <circle cx={x(hover)} cy={y(values[hover])} r={4} fill="#818cf8" />
          </>
        ) : null}
      </svg>
      {hover !== null ? (
        <div
          style={{
            position: "absolute",
            top: 4,
            left: `${Math.min(Math.max((x(hover) / W) * 100, 12), 78)}%`,
            transform: "translateX(-50%)",
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600 }}>{day(series[hover].day)}</div>
          <div>{fmt(values[hover])}</div>
          <div style={muted}>{metric === "revenue" ? `${series[hover].orders} orders` : fmtMoney(series[hover].revenue, currency)}</div>
        </div>
      ) : null}
    </div>
  );
}


const COLORS = ["#818cf8", "#22c55e", "#f59e0b", "#ef4444", "#38bdf8", "#a78bfa", "#9ca3af"];
const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

// Ring chart with its legend; the centre shows the total.
function Donut({ parts, center }: { parts: { key: string; value: number; color?: string }[]; center?: string }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label="Breakdown">
        <circle cx={60} cy={60} r={R} fill="none" stroke="var(--hover-bg)" strokeWidth={16} />
        {total > 0
          ? parts.map((p, i) => {
              const len = (p.value / total) * C;
              const el = (
                <circle key={p.key} cx={60} cy={60} r={R} fill="none" stroke={p.color ?? COLORS[i % COLORS.length]} strokeWidth={16} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
              );
              offset += len;
              return el;
            })
          : null}
        <text x={60} y={64} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--fg-base)">
          {center ?? total}
        </text>
      </svg>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, fontSize: 13, minWidth: 130 }}>
        {parts.map((p, i) => (
          <li key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: p.color ?? COLORS[i % COLORS.length] }} />
              {label(p.key)}
            </span>
            <span style={{ fontWeight: 600 }}>
              {p.value}
              {total > 0 ? <span style={{ ...muted, marginLeft: 6 }}>{Math.round((p.value / total) * 100)}%</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ ...muted, padding: "20px 0" }}>{children}</div>;
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={card}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
      {hint ? <p style={{ ...muted, margin: "2px 0 0" }}>{hint}</p> : null}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Stat({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={muted}>{l}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      {sub ? <div style={muted}>{sub}</div> : null}
    </div>
  );
}

function WeekdayBars({ days }: { days: Dashboard["weekdays"] }) {
  const max = Math.max(1, ...days.map((d) => d.orders));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130 }}>
      {days.map((d) => (
        <div key={d.dow} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }} title={`${d.orders} orders`}>
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{d.orders}</span>
          <div style={{ width: "100%", maxWidth: 34, height: `${Math.max(3, (d.orders / max) * 90)}px`, background: d.orders === max && max > 1 ? "#818cf8" : "rgba(129,140,248,0.45)", borderRadius: 4 }} />
          <span style={{ fontSize: 11, color: "var(--fg-subtle)" }}>{WEEKDAYS[d.dow]}</span>
        </div>
      ))}
    </div>
  );
}

const ATTENTION: { key: keyof Dashboard["attention"]; label: string; to: string; tone: "warn" | "info" }[] = [
  { key: "awaiting_payment", label: "Orders awaiting payment", to: "/r/orders?payment_status=not_paid", tone: "warn" },
  { key: "to_fulfill", label: "Orders to fulfill", to: "/r/orders?fulfillment_status=not_fulfilled", tone: "warn" },
  { key: "open_returns", label: "Open returns", to: "/settings/returns", tone: "warn" },
  { key: "low_stock", label: "Items low on stock", to: "/r/inventory-items", tone: "warn" },
  { key: "draft_orders", label: "Open draft orders", to: "/r/draft-orders", tone: "info" },
  { key: "draft_products", label: "Products still in draft", to: "/r/products?status=draft", tone: "info" },
];

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [currency, setCurrency] = useState("");
  const [metric, setMetric] = useState<"revenue" | "orders">("revenue");
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    api<Dashboard>(`/admin/dashboard?days=${days}${currency ? `&currency=${currency}` : ""}`)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [days, currency]);

  const maxChannel = useMemo(() => Math.max(1, ...(data?.channels ?? []).map((c) => c.revenue)), [data]);
  const money = (v: number) => fmtMoney(v, data?.currency);
  const name = user?.email ? user.email.split("@")[0] : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>Dashboard</h1>
          <p style={{ color: "var(--fg-subtle)", margin: 0, fontSize: 13 }}>Welcome back{name ? `, ${name}` : ""}. Here is how your store is doing.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {data && data.currencies.length > 1 ? (
            <select className="input" aria-label="Currency" value={data.currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 96 }}>
              {data.currencies.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          ) : null}
          <div role="group" aria-label="Period" style={{ display: "inline-flex", border: "1px solid var(--card-border)", borderRadius: 8, overflow: "hidden" }}>
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                aria-pressed={days === r}
                style={{ padding: "6px 12px", fontSize: 13, border: "none", cursor: "pointer", background: days === r ? "var(--hover-bg)" : "transparent", color: days === r ? "var(--fg-base)" : "var(--fg-subtle)", fontWeight: days === r ? 600 : 400 }}
              >
                {r}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!data && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
          <Spinner size={24} />
        </div>
      ) : null}

      {data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 16 }}>
            <Kpi label="Revenue" value={money(data.kpis.revenue.value)} change={data.kpis.revenue.change} hint={`vs previous ${data.days} days`} />
            <Kpi label="Orders" value={String(data.kpis.orders.value)} change={data.kpis.orders.change} hint={`vs previous ${data.days} days`} />
            <Kpi label="Average order value" value={money(data.kpis.aov.value)} change={data.kpis.aov.change} hint={`vs previous ${data.days} days`} />
            <Kpi label="New customers" value={String(data.kpis.customers.value)} change={data.kpis.customers.change} hint={`vs previous ${data.days} days`} />
            <Kpi label="Refunded" value={money(data.kpis.refunds.value)} change={data.kpis.refunds.change} inverse hint={`vs previous ${data.days} days`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(260px,1fr)", gap: 16 }} className="dash-split">
            <section className="card" style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Sales</h2>
                <div role="group" aria-label="Chart metric" style={{ display: "inline-flex", gap: 4 }}>
                  {(["revenue", "orders"] as const).map((m) => (
                    <button key={m} className="btn btn-secondary" aria-pressed={metric === m} onClick={() => setMetric(m)} style={{ padding: "3px 10px", fontSize: 12, opacity: metric === m ? 1 : 0.6 }}>
                      {m === "revenue" ? "Revenue" : "Orders"}
                    </button>
                  ))}
                </div>
              </div>
              {data.kpis.orders.value === 0 ? (
                <div style={{ padding: "48px 0", textAlign: "center", color: "var(--fg-subtle)", fontSize: 13 }}>No orders in the last {data.days} days.</div>
              ) : (
                <SalesChart series={data.series} currency={data.currency} metric={metric} />
              )}
            </section>

            <section className="card" style={card}>
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>Needs attention</h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {ATTENTION.map((a) => {
                  const n = data.attention[a.key];
                  return (
                    <li key={a.key} style={{ borderTop: "1px solid var(--card-border)" }}>
                      <Link to={a.to} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 0", textDecoration: "none", color: "var(--fg-base)", fontSize: 13 }}>
                        <span>{a.label}</span>
                        <span className={`badge ${n > 0 ? (a.tone === "warn" ? "badge-amber" : "badge-blue") : "badge-gray"}`} style={{ minWidth: 28, justifyContent: "center" }}>
                          {n}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div style={{ ...muted, marginTop: 6 }}>Low stock means {data.low_stock_at} or fewer available.</div>
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <section className="card" style={card}>
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>Top products</h2>
              {data.top_products.length === 0 ? (
                <div style={{ ...muted, padding: "16px 0" }}>No sales in this period yet.</div>
              ) : (
                <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.top_products.map((p, i) => (
                    <li key={`${p.product_id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--card-border)" }}>
                      <span style={{ width: 36, height: 44, borderRadius: 4, overflow: "hidden", background: "var(--hover-bg)", border: "1px solid var(--card-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--fg-muted)", flexShrink: 0 }}>
                        {p.thumbnail ? <img src={p.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "▣"}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {p.product_id ? (
                          <Link to={`/r/products/${p.product_id}`} style={{ color: "var(--fg-base)", textDecoration: "none", fontWeight: 600, fontSize: 13, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.title}
                          </Link>
                        ) : (
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</span>
                        )}
                        <div style={muted}>{p.units} sold</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{money(p.revenue)}</div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="card" style={card}>
              <h2 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 700 }}>Sales by channel</h2>
              {data.channels.length === 0 ? (
                <div style={{ ...muted, padding: "16px 0" }}>No sales in this period yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.channels.map((c) => (
                    <div key={c.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span>
                          {money(c.revenue)} <span style={muted}>· {c.orders} orders</span>
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--hover-bg)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(3, (c.revenue / maxChannel) * 100)}%`, height: "100%", background: "#818cf8" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <Card title="Payments" hint={`Orders in the last ${data.days} days by payment status`}>
              {data.payment_breakdown.length === 0 ? <Empty>No orders in this period.</Empty> : <Donut parts={data.payment_breakdown.map((p) => ({ key: p.key, value: p.count }))} />}
            </Card>
            <Card title="Fulfillment" hint="Orders by delivery progress">
              {data.fulfillment_breakdown.length === 0 ? <Empty>No orders in this period.</Empty> : <Donut parts={data.fulfillment_breakdown.map((p) => ({ key: p.key, value: p.count }))} />}
            </Card>
            <Card title="Customers" hint="Buyers in this period">
              {data.customers.buyers === 0 ? (
                <Empty>No customer orders in this period.</Empty>
              ) : (
                <Donut
                  center={`${data.customers.repeat_rate}%`}
                  parts={[
                    { key: "returning", value: data.customers.returning, color: "#22c55e" },
                    { key: "new", value: data.customers.buyers - data.customers.returning, color: "#818cf8" },
                  ]}
                />
              )}
              <div style={{ ...muted, marginTop: 8 }}>The ring shows the repeat purchase rate: buyers who had ordered before this period.</div>
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <Card title="Busiest days" hint="Orders by day of the week">
              {data.kpis.orders.value === 0 ? <Empty>No orders in this period.</Empty> : <WeekdayBars days={data.weekdays} />}
            </Card>
            <Card title="Checkout" hint="Carts started in this period">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
                <Stat label="Carts" value={String(data.carts.created)} />
                <Stat label="Completed" value={String(data.carts.completed)} />
                <Stat label="Abandoned" value={String(data.carts.abandoned)} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>Conversion rate</span>
                <span style={{ fontWeight: 700 }}>{data.carts.conversion_rate}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "var(--hover-bg)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, data.carts.conversion_rate)}%`, height: "100%", background: "#22c55e" }} />
              </div>
            </Card>
            <Card title="Discounts" hint="What promotions gave away">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                <Stat label="Discounted" value={money(data.discounts.total)} />
                <Stat label="Orders" value={String(data.discounts.orders)} sub="with a discount" />
                <Stat label="Share" value={`${data.discounts.share}%`} sub="of gross sales" />
              </div>
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16 }}>
            <Card title="Top countries" hint="Where orders ship to">
              {data.countries.length === 0 ? (
                <Empty>No shipping addresses in this period.</Empty>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data.countries.map((c) => (
                    <div key={c.country}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{countryName(c.country)}</span>
                        <span>
                          {money(c.revenue)} <span style={muted}>· {c.orders} orders</span>
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--hover-bg)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(3, (c.revenue / Math.max(1, data.countries[0].revenue)) * 100)}%`, height: "100%", background: "#38bdf8" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Low stock" hint={`Items with ${data.low_stock_at} or fewer available`}>
              {data.low_stock_items.length === 0 ? (
                <Empty>Every item has enough stock.</Empty>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.low_stock_items.map((i, n) => (
                    <li key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 0", borderTop: n === 0 ? "none" : "1px solid var(--card-border)", fontSize: 13 }}>
                      <Link to={`/r/inventory-items/${i.id}`} style={{ color: "var(--fg-base)", textDecoration: "none", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600 }}>{i.title}</span>
                        {i.sku ? <span style={{ ...muted, marginLeft: 8 }}>{i.sku}</span> : null}
                      </Link>
                      <span className={`badge ${i.available <= 0 ? "badge-red" : "badge-amber"}`}>{i.available} left</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <section className="card" style={{ ...card, padding: "18px 0 6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px 10px" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent orders</h2>
              <Link to="/r/orders" style={{ fontSize: 13, color: "var(--fg-interactive)", textDecoration: "none" }}>
                View all
              </Link>
            </div>
            {data.recent_orders.length === 0 ? (
              <div style={{ ...muted, padding: "16px 20px 24px" }}>No orders yet. They appear here as soon as customers check out.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="dtable" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      {["Order", "Date", "Customer", "Payment", "Fulfillment", "Total"].map((h) => (
                        <th key={h} scope="col" style={{ textAlign: h === "Total" ? "right" : "left" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_orders.map((o) => (
                      <tr key={o.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a")) navigate(`/r/orders/${o.id}`); }}>
                        <td>
                          <Link to={`/r/orders/${o.id}`} style={{ color: "var(--fg-interactive)", textDecoration: "none", fontWeight: 600 }}>
                            #{o.display_id}
                          </Link>
                        </td>
                        <td>{new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                        <td>{o.customer_name || o.email || "-"}</td>
                        <td>
                          <PaymentStatusCell value={o.payment_status} />
                        </td>
                        <td>
                          <FulfillmentStatusCell value={o.fulfillment_status} />
                        </td>
                        <td style={{ textAlign: "right" }}>{fmtMoney(o.total, o.currency_code)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div style={{ ...muted, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>{data.totals.orders} orders in total</span>
            <span>{data.totals.products} products</span>
            <span>{data.totals.customers} customers</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
