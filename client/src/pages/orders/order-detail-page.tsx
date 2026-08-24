import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { COUNTRIES } from "@/shared/i18n/countries";
import { Badge } from "@/widgets/ui/surfaces";
import {
  Alert,
  EmptyState,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import {
  FormDrawer,
  FormGrid,
  NumberField,
  SelectField,
  TextField,
} from "@/widgets/form";
import {
  DetailSection,
  JsonSection,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import { Timeline, type TimelineEvent } from "@/widgets/detail/timeline";
import { CopyButton, CopyText } from "@/widgets/ui/copy-button";
import { useConfirm } from "@/widgets/confirm";

function fmtMoney(v: unknown, currency?: string) {
  if (v === null || v === undefined || v === "") return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const code = String(currency || "EUR").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${code}`;
  }
}

function fmtDateTime(iso: unknown) {
  if (iso === null || iso === undefined || iso === "") return "–";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${date} ${time}`;
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function payDerivedStatus(p: any) {
  const s = String(p?.status ?? "").toLowerCase();
  if (s === "captured") return "captured";
  if (s === "refunded" || s === "partially_refunded") return "refunded";
  if (s === "canceled" || s === "cancelled") return "canceled";
  if (s === "authorized") return "authorized";
  return "pending";
}

function fulfillmentStatus(f: any) {
  if (f?.canceled_at) return "canceled";
  if (f?.delivered_at) return "delivered";
  if (f?.shipped_at) return "shipped";
  return "pending";
}

function addrLines(a: any): string[] {
  if (!a) return [];
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const cityLine = [a.city, a.postal_code].filter(Boolean).join(", ");
  const country = a.country_code ? String(a.country_code).toUpperCase() : "";
  return [
    name,
    a.company,
    a.address_1,
    a.address_2,
    cityLine,
    a.province,
    country,
    a.phone,
  ]
    .filter(Boolean)
    .map((l) => String(l));
}

function sameAddress(a: any, b: any) {
  if (!a || !b) return false;
  const keys = [
    "first_name",
    "last_name",
    "company",
    "address_1",
    "address_2",
    "city",
    "province",
    "postal_code",
    "country_code",
    "phone",
  ];
  return keys.every((k) => String(a[k] ?? "") === String(b[k] ?? ""));
}

function initialsOf(name: string, fallback: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0)
    return fallback ? String(fallback)[0].toUpperCase() : "?";
  if (parts.length === 1) return String(parts[0])[0].toUpperCase();
  return `${String(parts[0])[0]}${String(parts[parts.length - 1])[0]}`.toUpperCase();
}

export function OrderDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fulfillOpen, setFulfillOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [addrKind, setAddrKind] = useState<null | "shipping" | "billing">(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [refund, setRefund] = useState<null | {
    collectionId: string;
    maxMinor: number;
  }>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);

  function load() {
    setErr(null);
    api<{ order: any }>(`/admin/orders/${id}`)
      .then((d) => setOrder(d.order))
      .catch((e) => setErr(errMsg(e)));
  }
  useEffect(() => {
    load();
  }, [id]);

  function onFulfillDone() {
    setFulfillOpen(false);
    load();
  }
  function onEmailDone() {
    setEmailOpen(false);
    load();
  }
  function onAddrDone() {
    setAddrKind(null);
    load();
  }
  function onTransferDone() {
    setTransferOpen(false);
    load();
  }
  function onRefundDone() {
    setRefund(null);
    load();
  }
  async function post(path: string, body?: any) {
    setBusy(true);
    setErr(null);
    try {
      await api(path, { method: "POST", body });
      load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder() {
    const disp = order?.display_id ?? id;
    if (
      !(await confirm({
        description: `You are about to cancel the order #${disp}. This action cannot be undone.`,
      }))
    )
      return;
    await post(`/admin/orders/${id}/cancel`);
  }

  async function markPaid() {
    if (!pc) return;
    const amount = fmtMoney(pending, currency);
    if (
      !(await confirm({
        title: "Mark as paid",
        description: `Payment of ${amount} will be marked as paid.`,
        confirmLabel: "Confirm",
        variant: "primary",
      }))
    )
      return;
    await post(`/admin/payment-collections/${pc.id}/mark-as-paid`, {
      order_id: order.id,
    });
  }

  async function shipFulfillment(f: any) {
    await post(`/admin/fulfillments/${f.id}/ship`);
  }

  async function deliverFulfillment(f: any) {
    if (
      !(await confirm({
        description:
          "You are about to mark fulfillment as delivered. This action cannot be undone.",
      }))
    )
      return;
    await post(`/admin/fulfillments/${f.id}/deliver`);
  }

  async function cancelFulfillment(f: any) {
    if (
      !(await confirm({
        description:
          "You are about to cancel a fulfillment. This action cannot be undone.",
      }))
    )
      return;
    await post(`/admin/fulfillments/${f.id}/cancel`);
  }

  const currency = order?.currency_code;
  const pc =
    order?.payment_collection ?? (order?.payment_collections ?? [])[0] ?? null;
  const payments: any[] = order?.payments ?? [];
  const fulfillments: any[] = order?.fulfillments ?? [];
  const items: any[] = order?.items ?? [];
  const displayId = order?.display_id ?? id;
  const canceled = Boolean(order?.canceled_at) || order?.status === "canceled";

  const pending = Number(order?.pending_difference ?? 0);
  const itemSub = Number(
    order?.item_subtotal ?? order?.item_total ?? order?.subtotal ?? 0,
  );
  const shipSub = Number(
    order?.shipping_subtotal ?? order?.shipping_total ?? 0,
  );
  const taxTotal = Number(order?.tax_total ?? 0);
  const discountTotal = Number(order?.discount_total ?? 0);
  const orderTotalPre = itemSub + shipSub + taxTotal;
  const totalAfterDiscount = orderTotalPre + discountTotal;
  const paidTotal = Number(pc?.captured_amount ?? 0);
  const creditTotal = Number(order?.credit_line_total ?? 0);
  const outstanding = Math.max(0, pending);
  const refundOwed = pending < 0 ? -pending : 0;
  const shippingMethods: any[] = order?.shipping_methods ?? [];

  const fulfilledQty: Record<string, number> = {};
  for (const f of fulfillments) {
    if (f?.canceled_at) continue;
    for (const fi of f?.items ?? []) {
      const lid = fi?.line_item_id ?? fi?.id;
      if (lid)
        fulfilledQty[lid] =
          (fulfilledQty[lid] ?? 0) + Number(fi?.quantity ?? 0);
    }
  }
  const unfulfilled = items
    .map((li: any) => ({
      li,
      remaining: Number(li?.quantity ?? 0) - (fulfilledQty[li?.id] ?? 0),
    }))
    .filter((x) => x.remaining > 0);

  const customer = order?.customer ?? null;
  const customerId = order?.customer_id ?? customer?.id ?? "";
  const nameParts = [customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .join(" ");
  const displayName = nameParts || customer?.email || order?.email || "–";
  const orderPhone =
    order?.shipping_address?.phone ?? order?.billing_address?.phone ?? "";
  const company =
    order?.shipping_address?.company ?? order?.billing_address?.company ?? "";
  const shipLines = addrLines(order?.shipping_address);
  const billLines = addrLines(order?.billing_address);
  const billingSame =
    !order?.billing_address ||
    sameAddress(order?.shipping_address, order?.billing_address);

  const events = buildTimeline(order, payments, fulfillments, pc, currency);

  function openRefundForPayment(p: any) {
    if (!pc) return;
    if (payDerivedStatus(p) !== "captured") {
      setErr("Only captured payments can be refunded.");
      return;
    }
    const already = Number(pc?.refunded_amount ?? 0);
    if (already >= Number(p?.amount ?? 0)) {
      setErr("This payment has already been fully refunded.");
      return;
    }
    setRefund({
      collectionId: pc.id,
      maxMinor: Number(p?.amount ?? 0) - already,
    });
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Link
          to="/r/orders"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          ← Orders
        </Link>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {busy ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
          <Spinner />
        </div>
      ) : null}
      {!order && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {order ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <section className="card" style={{ padding: "20px 24px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <h1
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      #{displayId}
                    </h1>
                    <CopyButton
                      value={String(displayId)}
                      title="Copy order id"
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--fg-subtle)",
                      marginTop: 4,
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {fmtDateTime(order.created_at)}
                    {order.sales_channel?.name
                      ? ` from ${order.sales_channel.name}`
                      : ""}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {order.status === "canceled" ? (
                    <Badge value="Canceled" />
                  ) : null}
                  <Badge value={order.payment_status} />
                  <Badge value={order.fulfillment_status} />
                  <span
                    style={
                      canceled
                        ? { opacity: 0.5, pointerEvents: "none" }
                        : undefined
                    }
                    aria-disabled={canceled ? true : undefined}
                    title={canceled ? "Order is canceled" : undefined}
                  >
                    <RowMenu
                      items={[
                        { label: "Cancel", danger: true, onClick: cancelOrder },
                      ]}
                    />
                  </span>
                </div>
              </div>
            </section>

            <DetailSection title="Summary">
              <div>
                {items.map((li: any, idx: number) => (
                  <div
                    key={li.id ?? idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "12px 0",
                      borderTop:
                        idx === 0 ? "none" : "1px solid var(--card-border)",
                      minWidth: 0,
                    }}
                  >
                    {li.thumbnail ? (
                      <img
                        src={String(li.thumbnail)}
                        alt=""
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    ) : null}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          minWidth: 0,
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {String(li.title ?? "–")}
                      </div>
                      {li.variant_sku ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 2,
                            minWidth: 0,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              minWidth: 0,
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {String(li.variant_sku)}
                          </span>
                          <CopyButton
                            value={String(li.variant_sku)}
                            title="Copy SKU"
                          />
                        </div>
                      ) : null}
                      {li.variant_title ? (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--fg-subtle)",
                            marginTop: 2,
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {String(li.variant_title)}
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 16,
                        flexShrink: 0,
                        textAlign: "right",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ minWidth: 70 }}>
                        {fmtMoney(li.unit_price, currency)}
                      </div>
                      <div
                        style={{ minWidth: 40, color: "var(--fg-subtle)" }}
                      >{`${Number(li.quantity ?? 0)} x`}</div>
                      <div style={{ minWidth: 80, fontWeight: 700 }}>
                        {fmtMoney(
                          li.subtotal ??
                            li.total ??
                            Number(li.quantity ?? 0) *
                              Number(li.unit_price ?? 0),
                          currency,
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--card-border)",
                  marginTop: 8,
                  paddingTop: 4,
                }}
              >
                <CostRow
                  label="Item Subtotal"
                  value={fmtMoney(itemSub, currency)}
                />
                <CollapseRow
                  label="Shipping Subtotal"
                  value={fmtMoney(shipSub, currency)}
                  collapsible
                  open={shipOpen}
                  onToggle={() => setShipOpen((o) => !o)}
                >
                  {shippingMethods.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
                      –
                    </div>
                  ) : (
                    shippingMethods.map((m: any, i: number) => (
                      <div
                        key={m?.id ?? i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          fontSize: 13,
                          padding: "4px 0",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--fg-subtle)",
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {String(m?.name ?? "Shipping")}
                        </span>
                        <span>{fmtMoney(m?.amount, currency)}</span>
                      </div>
                    ))
                  )}
                </CollapseRow>
                {taxTotal !== 0 ? (
                  <CollapseRow
                    label="Tax Total"
                    value={fmtMoney(taxTotal, currency)}
                    collapsible
                    open={taxOpen}
                    onToggle={() => setTaxOpen((o) => !o)}
                  >
                    <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
                      –
                    </div>
                  </CollapseRow>
                ) : (
                  <CostRow
                    label="Tax Total"
                    value={fmtMoney(taxTotal, currency)}
                  />
                )}
                <CostRow
                  label="Order Total"
                  value={fmtMoney(orderTotalPre, currency)}
                  bold
                />
              </div>

              <div
                style={{
                  borderTop: "1px solid var(--card-border)",
                  marginTop: 4,
                  paddingTop: 4,
                }}
              >
                {discountTotal !== 0 ? (
                  <CollapseRow
                    label="Discount Total"
                    value={fmtMoney(discountTotal, currency)}
                    collapsible
                    open={discOpen}
                    onToggle={() => setDiscOpen((o) => !o)}
                  >
                    <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
                      –
                    </div>
                  </CollapseRow>
                ) : (
                  <CostRow
                    label="Discount Total"
                    value={fmtMoney(discountTotal, currency)}
                  />
                )}
                <CostRow
                  label="Total After Discount"
                  value={fmtMoney(totalAfterDiscount, currency)}
                  bold
                />
              </div>

              <div
                style={{
                  borderTop: "1px dashed var(--card-border)",
                  marginTop: 4,
                  paddingTop: 4,
                }}
              >
                <CostRow
                  label="Paid Total"
                  value={fmtMoney(paidTotal, currency)}
                />
                {creditTotal > 0 ? (
                  <CostRow
                    label="Credit Lines Total"
                    value={fmtMoney(creditTotal, currency)}
                  />
                ) : null}
                <CostRow
                  label="Outstanding amount"
                  value={fmtMoney(outstanding, currency)}
                  semibold
                />
              </div>

              {((pending > 0 && pc) || pending < 0) && pc ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  {pending > 0 && pc ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={markPaid}
                    >
                      Mark as paid
                    </button>
                  ) : null}
                  {pending < 0 ? (
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        setRefund({ collectionId: pc.id, maxMinor: refundOwed })
                      }
                    >
                      Refund {fmtMoney(refundOwed, currency)}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </DetailSection>

            <DetailSection
              title="Payments"
              action={<Badge value={order.payment_status} />}
            >
              {!pc ? (
                <EmptyState title="No payment collection" hint="" />
              ) : (
                <div>
                  {payments.map((p: any, idx: number) => (
                    <div
                      key={p.id ?? idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 0",
                        borderTop:
                          idx === 0 ? "none" : "1px solid var(--card-border)",
                        minWidth: 0,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              minWidth: 0,
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {String(p.id)}
                          </span>
                          <CopyButton
                            value={String(p.id)}
                            title="Copy payment id"
                          />
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--fg-subtle)",
                            marginTop: 2,
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {fmtDateTime(p.created_at)}
                          {p.provider_id ? ` · ${p.provider_id}` : ""}
                        </div>
                      </div>
                      <Badge value={payDerivedStatus(p)} />
                      <div
                        style={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}
                      >
                        {fmtMoney(p.amount, currency)}
                      </div>
                      <RowMenu
                        items={[
                          {
                            label: "Refund",
                            onClick: () => openRefundForPayment(p),
                          },
                        ]}
                      />
                    </div>
                  ))}
                  {payments.length === 0 ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--fg-subtle)",
                        padding: "8px 0",
                      }}
                    >
                      <span className="mono">{String(pc.id)}</span>
                      {pc.status ? ` · ${pc.status}` : ""}
                    </div>
                  ) : null}
                  <div
                    style={{
                      borderTop: "1px solid var(--card-border)",
                      marginTop: 4,
                      paddingTop: 4,
                    }}
                  >
                    <CostRow
                      label="Total paid by customer"
                      value={fmtMoney(paidTotal, currency)}
                    />
                    {pending > 0 ? (
                      <CostRow
                        label="Total pending"
                        value={fmtMoney(pending, currency)}
                      />
                    ) : null}
                  </div>
                </div>
              )}
            </DetailSection>

            <DetailSection title="Fulfillment">
              {unfulfilled.length > 0 ? (
                <div style={{ marginBottom: fulfillments.length > 0 ? 12 : 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      Unfulfilled items
                    </div>
                    <RowMenu
                      items={[
                        {
                          label: "Fulfill items",
                          onClick: () => setFulfillOpen(true),
                        },
                      ]}
                    />
                  </div>
                  {unfulfilled.map((u) => (
                    <div
                      key={u.li.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        fontSize: 13,
                        padding: "6px 0",
                        borderTop: "1px solid var(--card-border)",
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 0,
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {String(u.li.title ?? "–")}
                      </span>
                      <span
                        style={{ color: "var(--fg-subtle)", flexShrink: 0 }}
                      >
                        x {u.remaining}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
