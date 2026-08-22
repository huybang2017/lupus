import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  RadioCardField,
  SelectField,
  TextField,
} from "@/widgets/form";
import { DataTable, TableSearch, type TableColumn } from "@/widgets/table";
import {
  DetailSection,
  JsonSection,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";
import { Timeline, type TimelineEvent } from "@/widgets/detail/timeline";
import { CopyButton, CopyText } from "@/widgets/ui/copy-button";
import { useConfirm } from "@/widgets/confirm";

const SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  JPY: "¥",
  VND: "₫",
};
function money(minor: unknown, currency?: string) {
  const code = String(currency ?? "").toUpperCase();
  const n = Number(minor);
  if (!Number.isFinite(n)) return "–";
  const sym = SYMBOLS[code] ?? "";
  return `${sym}${(n / 100).toFixed(2)}${sym ? "" : code ? ` ${code}` : ""}`;
}

function fmtAddr(a: any): string[] {
  if (!a) return [];
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const lines = [
    a.address_1,
    a.address_2,
    a.city,
    a.province,
    a.postal_code,
    a.country_code ? String(a.country_code).toUpperCase() : "",
  ].filter(Boolean);
  return [...(name ? [name] : []), ...lines];
}

function sameAddress(a: any, b: any): boolean {
  if (!a && !b) return true;
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
  return keys.every(
    (k) => String(a[k] ?? "").trim() === String(b[k] ?? "").trim(),
  );
}

type DrawerKind =
  | null
  | "items"
  | "promotions"
  | "shipping"
  | "shipping-method"
  | "metadata"
  | "billing"
  | "transfer"
  | "email"
  | "sales-channel";

const CUSTOM_SHIPPING_OPTION = "__custom__";

export function DraftOrderDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<any>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [shippingMethod, setShippingMethod] = useState<any>(null);

  function load() {
    setErr(null);
    api<{ draft_order: any }>(`/admin/draft-orders/${id}`)
      .then((d) => setDraft(d.draft_order))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const embedded = draft?.sales_channel?.name;
    if (embedded) {
      setChannelName(embedded);
      return;
    }
    const cid = draft?.sales_channel_id;
    if (!cid) {
      setChannelName(null);
      return;
    }
    let alive = true;
    api<{ sales_channel: any }>(`/admin/sales-channels/${cid}`)
      .then((d) => {
        if (alive) setChannelName(d.sales_channel?.name ?? null);
      })
      .catch(() => {
        if (alive) setChannelName(null);
      });
    return () => {
      alive = false;
    };
  }, [draft?.sales_channel_id, draft?.sales_channel?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function convert() {
    const ok = await confirm({
      title: "Are you sure?",
      description:
        "You are about to convert this draft order to an order. This action cannot be undone.",
      variant: "primary",
      confirmLabel: "Continue",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ order: any }>(
        `/admin/draft-orders/${id}/convert-to-order`,
        { method: "POST", body: {} },
      );
      navigate(`/r/orders/${res.order?.id ?? id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    const ok = await confirm({
      title: "Are you sure?",
      description:
        "You are about to delete this draft order. This action cannot be undone.",
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/draft-orders/${id}`, { method: "DELETE" });
      navigate("/r/draft-orders");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function removeShippingMethod(method: any) {
    const ok = await confirm({
      title: "Are you sure?",
      description: `You are about to remove the shipping method "${
        method?.name ?? "shipping"
      }" from this draft order.`,
      variant: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/draft-orders/${id}/shipping-methods/${method.id}`, {
        method: "DELETE",
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = draft?.summary ?? {};
  const cur = draft?.currency_code;
  const items: any[] = draft?.items ?? [];
  const shippingMethods: any[] = Array.isArray(draft?.shipping_methods)
    ? draft.shipping_methods
    : [];
  const hasItems = items.length > 0;
  const promos: string[] = Array.isArray(draft?.promo_codes)
    ? draft.promo_codes
    : [];
  const subtotal =
    s.subtotal ?? draft?.subtotal ?? draft?.item_subtotal ?? null;
  const shippingTotal =
    s.shipping_total ??
    draft?.shipping_total ??
    draft?.shipping_subtotal ??
    (shippingMethods.length > 0
      ? shippingMethods.reduce(
          (acc: number, m: any) => acc + (Number(m?.amount) || 0),
          0,
        )
      : null);
  const discountTotal = s.discount_total ?? draft?.discount_total ?? null;
  const taxTotal = s.tax_total ?? draft?.tax_total ?? null;
  const total = s.total ?? draft?.total ?? null;
  const itemCount = items.reduce(
    (acc, li) => acc + (Number(li.quantity) || 0),
    0,
  );
  const customer = draft?.customer ?? null;
  const customerId = customer?.id ?? draft?.customer_id ?? "";
  const customerEmail = customer?.email ?? draft?.email ?? "";
  const customerPhone =
    customer?.phone ??
    draft?.shipping_address?.phone ??
    draft?.billing_address?.phone ??
    "";
  const nameParts = [customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .map((p) => String(p));
  const displayName = nameParts.join(" ") || customerEmail || "–";
  const initials = nameParts.length
    ? nameParts
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : customerEmail
      ? String(customerEmail)[0].toUpperCase()
      : "?";
  const custShip = fmtAddr(draft?.shipping_address);
  const billingSame = sameAddress(
    draft?.shipping_address,
    draft?.billing_address,
  );
  const custBill = billingSame ? [] : fmtAddr(draft?.billing_address);
  const created = draft?.created_at ? new Date(draft.created_at) : null;
  const events: TimelineEvent[] = [];
  if (draft?.created_at)
    events.push({
      id: "created",
      title: "Draft order created",
      description: "Draft order created",
      at: draft.created_at,
    });
  if (draft?.payment_collection?.created_at)
    events.push({
      id: "payment",
      title: "Payment collection created",
      at: draft.payment_collection.created_at,
    });
  const shippingColumns: TableColumn<any>[] = [
    {
      key: "method",
      label: "Method",
      render: (m: any) => (
        <div
          style={{
            minWidth: 0,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {m?.name ?? "–"}
        </div>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      mono: true,
      render: (m: any) => (
        <span style={{ whiteSpace: "nowrap" }}>{money(m?.amount, cur)}</span>
      ),
    },
  ];
  function openShippingMethod(method: any | null) {
    setShippingMethod(method);
    setDrawer("shipping-method");
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <Link
          to="/r/draft-orders"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Draft Orders
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          #{draft?.display_id ?? id}
        </span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!draft && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {draft ? (
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
            <DetailSection
              title={`Draft Order #${draft.display_id ?? id}`}
              action={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {draft.region?.name ? (
                    <Badge value={draft.region.name} />
                  ) : null}
                  <CopyButton
                    value={`#${draft.display_id ?? id}`}
                    title="Copy draft order number"
                  />
                  <RowMenu
                    items={[
                      {
                        label: "Edit sales channel",
                        onClick: () => setDrawer("sales-channel"),
                      },
                      {
                        label: "Delete draft order",
                        danger: true,
                        onClick: () => {
                          void del();
                        },
                      },
                    ]}
                  />
                </div>
              }
            >
              <div
                style={{
                  fontSize: 13,
                  color: "var(--fg-subtle)",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                  wordBreak: "break-word",
                }}
              >
                {created
                  ? created.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "–"}
                {channelName ? ` from ${channelName}` : ""}
              </div>
            </DetailSection>

            <DetailSection
              title="Summary"
              action={
                <RowMenu
                  items={[
                    { label: "Edit items", onClick: () => setDrawer("items") },
                    {
                      label: "Edit promotions",
                      onClick: () => setDrawer("promotions"),
                    },
                  ]}
                />
              }
            >
              {items.length === 0 ? (
                <EmptyState
                  title="There are no items in this order"
                  hint="Add items to the order to get started."
                />
              ) : (
                <div>
                  {items.map((li: any) => (
                    <div
                      key={li.id ?? `${li.title}-${li.variant_id}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "12px 0",
                        borderTop: "1px solid var(--card-border)",
                        fontSize: 13,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>
                            {li.title ?? li.product_title ?? "Draft item"}
                          </span>
                          {li.variant_title ? (
                            <span style={{ color: "var(--fg-subtle)" }}>
                              {" "}
                              ({li.variant_title})
                            </span>
                          ) : null}
                        </div>
                        {li.variant_sku ? (
                          <div
                            className="mono"
                            style={{
                              fontSize: 12,
                              color: "var(--fg-subtle)",
                              minWidth: 0,
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {li.variant_sku}
                          </div>
                        ) : null}
                      </div>
                      <div
                        style={{
                          color: "var(--fg-subtle)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {money(li.unit_price, cur)}
                      </div>
                      <div
                        style={{
                          color: "var(--fg-subtle)",
                          whiteSpace: "nowrap",
                        }}
                      >{`${Number(li.quantity) || 0}x`}</div>
                      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {money(
                          li.subtotal ??
                            (Number(li.quantity) || 0) *
                              (Number(li.unit_price) || 0),
                          cur,
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "12px 0",
                  borderTop: "1px solid var(--card-border)",
                  fontSize: 13,
                }}
              >
                {subtotal !== null && subtotal !== undefined ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      gap: 12,
                      color: "var(--fg-subtle)",
                    }}
                  >
                    <span>Subtotal</span>
                    <span>{`${itemCount} item(s)`}</span>
                    <span style={{ textAlign: "right" }}>
                      {money(subtotal, cur)}
                    </span>
                  </div>
                ) : null}
                {shippingTotal !== null && shippingTotal !== undefined ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      color: "var(--fg-subtle)",
                    }}
                  >
                    <span>Shipping</span>
                    <span>{money(shippingTotal, cur)}</span>
                  </div>
                ) : null}
                {discountTotal !== null && discountTotal !== undefined ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, auto) minmax(0, 1fr) auto",
                      gap: 12,
                      color: "var(--fg-subtle)",
                    }}
                  >
                    <span>Discount</span>
                    <span
                      style={{
                        textAlign: "right",
                        minWidth: 0,
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {promos.join(", ")}
                    </span>
                    <span style={{ textAlign: "right" }}>
                      {money(discountTotal, cur)}
                    </span>
                  </div>
                ) : null}
                {taxTotal !== null && taxTotal !== undefined ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      color: "var(--fg-subtle)",
                    }}
                  >
                    <span>Tax</span>
                    <span>
                      {Number(taxTotal) > 0 ? money(taxTotal, cur) : "-"}
                    </span>
                  </div>
                ) : null}
                {total !== null && total !== undefined ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      fontWeight: 700,
                    }}
                  >
                    <span>Total</span>
                    <span>{money(total, cur)}</span>
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  paddingTop: 12,
                  borderTop: "1px solid var(--card-border)",
                }}
              >
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    void convert();
                  }}
                >
                  {busy ? "Converting…" : "Convert to order"}
                </button>
              </div>
            </DetailSection>

            <DetailSection
              title="Shipping"
              action={
                !hasItems || shippingMethods.length === 0 ? null : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => openShippingMethod(null)}
                  >
                    Edit
                  </button>
                )
              }
            >
              {!hasItems ? (
                <EmptyState
                  title="No items"
                  hint="Add items to the order before adding shipping"
                />
              ) : shippingMethods.length === 0 ? (
                <>
                  <EmptyState
                    title="No shipping method"
                    hint="Add a shipping method for this draft order"
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                    }}
                  >
                    <button
                      className="btn btn-secondary"
                      onClick={() => openShippingMethod(null)}
                    >
                      Add shipping
                    </button>
                  </div>
                </>
              ) : (
                <DataTable
                  columns={shippingColumns}
                  rows={shippingMethods}
                  rowKey={(m: any) => String(m?.id ?? "")}
                  rowActions={(m: any) => [
                    {
                      label: "Edit",
                      onClick: () => openShippingMethod(m),
                    },
                    {
                      label: "Delete",
                      danger: true,
                      onClick: () => {
                        void removeShippingMethod(m);
                      },
                    },
                  ]}
                />
              )}
            </DetailSection>

            <MetadataSection
              metadata={draft.metadata}
              onEdit={() => setDrawer("metadata")}
            />

            <JsonSection data={draft} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection
              title="Customer"
              action={
                <RowMenu
                  items={[
                    {
                      label: "Transfer ownership",
                      onClick: () => setDrawer("transfer"),
                    },
                    {
                      label: "Edit shipping address",
                      divider: true,
                      onClick: () => setDrawer("shipping"),
                    },
                    {
                      label: "Edit billing address",
                      onClick: () => setDrawer("billing"),
                    },
                    {
                      label: "Edit email",
                      divider: true,
                      onClick: () => setDrawer("email"),
                    },
                  ]}
                />
              }
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  minWidth: 0,
                  fontSize: 13,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--fg-subtle)",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    ID
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: "var(--hover-bg)",
                        border: "1px solid var(--card-border)",
                        color: "var(--fg-subtle)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {customerId ? (
                        <Link
                          to={`/r/customers/${customerId}`}
                          style={{
                            fontWeight: 600,
                            color: "var(--fg-base)",
                            textDecoration: "none",
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                            display: "block",
                          }}
                        >
                          {displayName}
                        </Link>
                      ) : (
                        <div
                          style={{
                            fontWeight: 600,
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            wordBreak: "break-word",
                          }}
                        >
                          {displayName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--fg-subtle)",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    Contact
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    {customerEmail ? (
                      <CopyText value={customerEmail} />
                    ) : (
                      <span>–</span>
                    )}
                    {customerPhone ? <CopyText value={customerPhone} /> : null}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--fg-subtle)",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    Shipping address
                  </div>
                  {custShip.length ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {custShip.map((l, i) => (
                          <div
                            key={i}
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {l}
                          </div>
                        ))}
                      </div>
                      <CopyButton
                        value={custShip.join("\n")}
                        title="Copy shipping address"
                      />
                    </div>
                  ) : (
                    <span>–</span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--fg-subtle)",
                      fontSize: 12,
                      marginBottom: 4,
                    }}
                  >
                    Billing address
                  </div>
                  {billingSame ? (
                    <span style={{ color: "var(--fg-subtle)" }}>
                      Same as shipping address
                    </span>
                  ) : custBill.length ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {custBill.map((l, i) => (
                          <div
                            key={i}
                            style={{
                              overflowWrap: "anywhere",
                              wordBreak: "break-word",
                            }}
                          >
                            {l}
                          </div>
                        ))}
                      </div>
                      <CopyButton
                        value={custBill.join("\n")}
                        title="Copy billing address"
                      />
                    </div>
                  ) : (
                    <span>–</span>
                  )}
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Activity">
              <Timeline events={events} />
            </DetailSection>
          </div>
        </div>
      ) : null}

      {drawer === "items" ? (
        <EditItemsDrawer
          draft={draft}
          currency={cur}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "promotions" ? (
        <EditPromotionsDrawer
          draft={draft}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "shipping" ? (
        <AddressDrawer
          draft={draft}
          kind="shipping"
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "billing" ? (
        <AddressDrawer
          draft={draft}
          kind="billing"
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "shipping-method" ? (
        <ShippingMethodDrawer
          draft={draft}
          method={shippingMethod}
          currency={cur}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            setShippingMethod(null);
            load();
          }}
        />
      ) : null}
      {drawer === "metadata" ? (
        <MetadataDrawer
          metadata={draft?.metadata}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
          save={async (m: Record<string, string>) => {
            await api(`/admin/draft-orders/${draft?.id ?? id}`, {
              method: "POST",
              body: { metadata: m },
            });
          }}
        />
      ) : null}
      {drawer === "transfer" ? (
        <TransferDrawer
          draft={draft}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "email" ? (
        <EmailDrawer
          draft={draft}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
      {drawer === "sales-channel" ? (
        <SalesChannelDrawer
          draft={draft}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

interface EditLine {
  key: string;
  variant_id?: string;
  title: string;
  variant_title?: string;
  variant_sku?: string;
  quantity: number;
  unit_price: number;
}

function EditItemsDrawer({
  draft,
  currency,
  onClose,
  onSaved,
}: {
  draft: any;
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lines, setLines] = useState<EditLine[]>(() =>
    (draft.items ?? []).map((li: any, i: number) => ({
      key: li.id ?? `line-${i}`,
      variant_id: li.variant_id,
      title: li.title ?? li.product_title ?? "Draft item",
      variant_title: li.variant_title,
      variant_sku: li.variant_sku,
      quantity: Number(li.quantity) || 1,
      unit_price: Number(li.unit_price) || 0,
    })),
  );
  const [variants, setVariants] = useState<any[]>([]);
  const [variantPick, setVariantPick] = useState("");
  const [query, setQuery] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/product-variants?limit=100&offset=0")
      .then((d: any) => setVariants(parseList(d, 100).items))
      .catch(() => {});
  }, []);

  function addVariant() {
    if (!variantPick) return;
    if (lines.some((l) => l.variant_id === variantPick)) {
      setVariantPick("");
      return;
    }
    const v = variants.find((x: any) => x.id === variantPick);
    if (!v) return;
    const price = Number(v.unit_price ?? v.prices?.[0]?.amount ?? 0) || 0;
    setLines((s) => [
      ...s,
      {
        key: `new-${Date.now()}`,
        variant_id: v.id,
        title: v.title ?? v.sku ?? v.id,
        variant_sku: v.sku,
        quantity: 1,
        unit_price: price,
      },
    ]);
    setVariantPick("");
  }

  function addCustom() {
    if (!customTitle.trim()) {
      setErr("Enter a title for the custom item.");
      return;
    }
    setErr(null);
    setLines((s) => [
      ...s,
      {
        key: `custom-${Date.now()}`,
        title: customTitle.trim(),
        quantity: Math.max(1, parseInt(customQty, 10) || 1),
        unit_price: Number(customPrice) || 0,
      },
    ]);
    setCustomTitle("");
    setCustomPrice("");
    setCustomQty("1");
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const items = lines
        .map((l) => {
          const quantity = Math.max(1, Math.round(Number(l.quantity) || 1));
          const unit_price = Math.max(0, Math.round(Number(l.unit_price) || 0));
          if (l.variant_id) {
            return { variant_id: l.variant_id, quantity, unit_price };
          }
          if (!l.title.trim()) return null;
          return { title: l.title.trim(), quantity, unit_price };
        })
        .filter((l) => l !== null) as Record<string, any>[];
      await api(`/admin/draft-orders/${draft.id}`, {
        method: "POST",
        body: { items },
      });
      onSaved();
    } catch (e) {
