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
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? lines.filter((l) =>
        `${l.title} ${l.variant_title ?? ""} ${l.variant_sku ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : lines;
  const count = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0);
  const computed = lines.reduce(
    (acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0),
    0,
  );
  const columns: TableColumn<EditLine>[] = [
    {
      key: "item",
      label: "Item",
      render: (l) => (
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              overflowWrap: "anywhere",
              wordBreak: "break-word",
            }}
          >
            {l.title}
          </div>
          {l.variant_sku ? (
            <div
              className="mono"
              style={{ fontSize: 12, color: "var(--fg-subtle)" }}
            >
              {l.variant_sku}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "qty",
      label: "Quantity",
      render: (l) => (
        <NumberField
          min={1}
          value={String(l.quantity)}
          onChange={(v) =>
            setLines((s) =>
              s.map((x) =>
                x.key === l.key
                  ? { ...x, quantity: Math.max(1, Number(v) || 1) }
                  : x,
              ),
            )
          }
          style={{ width: 80 }}
        />
      ),
    },
    {
      key: "price",
      label: "Unit price",
      render: (l) => (
        <NumberField
          min={0}
          value={String(l.unit_price)}
          onChange={(v) =>
            setLines((s) =>
              s.map((x) =>
                x.key === l.key
                  ? { ...x, unit_price: Math.max(0, Number(v) || 0) }
                  : x,
              ),
            )
          }
          style={{ width: 110 }}
        />
      ),
    },
  ];

  return (
    <FormDrawer
      title="Edit Items"
      subtitle="Edit the items in the draft order"
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <div style={{ marginBottom: 12 }}>
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Search items"
          width={240}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          marginBottom: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <SelectField
            label="Variant"
            value={variantPick}
            onChange={setVariantPick}
            options={variants
              .filter((v: any) => !lines.some((l) => l.variant_id === v.id))
              .map((v: any) => ({
                value: v.id,
                label: v.title ?? v.sku ?? v.id,
                sub: v.sku,
              }))}
            placeholder="Select variant"
            searchable
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginBottom: 12 }}
          onClick={addVariant}
          disabled={!variantPick}
        >
          Add
        </button>
      </div>
      {showCustom ? (
        <div
          style={{
            border: "1px solid var(--card-border)",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <TextField
            label="Title"
            hint="Enter the title of the item"
            value={customTitle}
            onChange={setCustomTitle}
          />
          <FormGrid cols={2}>
            <NumberField
              label="Unit price"
              hint="Enter the unit price of the item"
              value={customPrice}
              onChange={setCustomPrice}
              min={0}
            />
            <NumberField
              label="Quantity"
              hint="Enter the quantity of the item"
              value={customQty}
              onChange={setCustomQty}
              min={1}
            />
          </FormGrid>
          <button className="btn btn-secondary" onClick={addCustom}>
            Add item
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowCustom(true)}
          >
            Add custom item
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(l) => l.key}
        rowActions={(l) => [
          {
            label: "Remove",
            danger: true,
            onClick: () => setLines((s) => s.filter((x) => x.key !== l.key)),
          },
        ]}
        emptyTitle={
          lines.length === 0
            ? "There are no items in this order"
            : "No items found"
        }
        emptyHint={
          lines.length === 0 ? "Add items to the order to get started." : ""
        }
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingTop: 12,
          fontSize: 13,
        }}
      >
        <span>Subtotal</span>
        <span style={{ color: "var(--fg-subtle)" }}>{`${count} item(s)`}</span>
        <strong>{money(computed, currency)}</strong>
      </div>
    </FormDrawer>
  );
}

function EditPromotionsDrawer({
  draft,
  onClose,
  onSaved,
}: {
  draft: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [codes, setCodes] = useState(
    ((draft.promo_codes ?? []) as string[]).join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const promo_codes = codes
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c !== "");
      await api(`/admin/draft-orders/${draft.id}`, {
        method: "POST",
        body: { promo_codes },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Apply promotions"
      subtitle="Manage promotions that should be applied to the order."
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <TextField
        label="Promotion codes"
        hint="Comma-separated promotion codes"
        value={codes}
        onChange={setCodes}
        placeholder="SUMMER10, WELCOME5"
      />
    </FormDrawer>
  );
}

function AddressDrawer({
  draft,
  kind,
  onClose,
  onSaved,
}: {
  draft: any;
  kind: "shipping" | "billing";
  onClose: () => void;
  onSaved: () => void;
}) {
  const current =
    kind === "shipping"
      ? (draft.shipping_address ?? {})
      : (draft.billing_address ?? {});
  const [form, setForm] = useState({
    country_code: current.country_code ?? "",
    first_name: current.first_name ?? "",
    last_name: current.last_name ?? "",
    company: current.company ?? "",
    address_1: current.address_1 ?? "",
    address_2: current.address_2 ?? "",
    city: current.city ?? "",
    postal_code: current.postal_code ?? "",
    province: current.province ?? "",
    phone: current.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const hasAddress =
    current && (current.address_1 || current.city || current.first_name);
  const title =
    kind === "shipping"
      ? hasAddress
        ? "Edit shipping address"
        : "Add shipping address"
      : "Edit billing address";

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const address: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        const t = v.trim();
        if (t !== "") address[k] = t;
      }
      const body =
        kind === "shipping"
          ? { shipping_address: address }
          : { billing_address: address };
      await api(`/admin/draft-orders/${draft.id}`, { method: "POST", body });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title={title}
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <SelectField
        label="Country"
        value={form.country_code}
        onChange={(v) => set("country_code", v)}
        options={COUNTRIES.map((c) => ({ value: c.id, label: c.label }))}
        placeholder="Select country"
        searchable
      />
      <FormGrid cols={2}>
        <TextField
          label="First name"
          value={form.first_name}
          onChange={(v) => set("first_name", v)}
        />
        <TextField
          label="Last name"
          value={form.last_name}
          onChange={(v) => set("last_name", v)}
        />
      </FormGrid>
      <TextField
        label="Company"
        optional
        value={form.company}
        onChange={(v) => set("company", v)}
      />
      <TextField
        label="Address"
        value={form.address_1}
        onChange={(v) => set("address_1", v)}
      />
      <TextField
        label="Apartment, suite, etc."
        optional
        value={form.address_2}
        onChange={(v) => set("address_2", v)}
      />
      <FormGrid cols={2}>
        <TextField
          label="Postal code"
          value={form.postal_code}
          onChange={(v) => set("postal_code", v)}
        />
        <TextField
          label="City"
          value={form.city}
          onChange={(v) => set("city", v)}
        />
      </FormGrid>
      <TextField
        label="Province / State"
        optional
        value={form.province}
        onChange={(v) => set("province", v)}
      />
      <TextField
        label="Phone"
        optional
        value={form.phone}
        onChange={(v) => set("phone", v)}
      />
    </FormDrawer>
  );
}

function ShippingMethodDrawer({
  draft,
  method,
  currency,
  onClose,
  onSaved,
}: {
  draft: any;
  method: any | null;
  currency?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!method?.id;
  const hasItems = (draft?.items ?? []).length > 0;
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionsErr, setOptionsErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [customName, setCustomName] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [editName, setEditName] = useState(String(method?.name ?? ""));
  const [amount, setAmount] = useState(
    method?.amount !== null && method?.amount !== undefined
      ? String(method.amount)
      : "",
  );
  const [data, setData] = useState<Record<string, string>>(() => ({
    ...(method?.data && typeof method.data === "object" ? method.data : {}),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<{ shipping_options: any[] }>(
      `/admin/draft-orders/${draft?.id}/shipping-options`,
    )
      .then((d) => {
        if (!alive) return;
        setOptions(Array.isArray(d?.shipping_options) ? d.shipping_options : []);
      })
      .catch((e) => {
        if (!alive) return;
        setOptionsErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [draft?.id]);

  const selected =
    pick === CUSTOM_SHIPPING_OPTION
      ? null
      : options.find((o: any) => o.id === pick) ?? null;
  const isCustom = pick === CUSTOM_SHIPPING_OPTION;
  const isCalculated = !isCustom && selected?.price_type === "calculated";
  const dataKeys = isCustom
    ? []
    : Object.keys((selected?.data as Record<string, unknown>) ?? {});
  const optionLabel = isEdit
    ? (options.find(
        (o: any) => o.id === method?.shipping_option_id,
      )?.name ??
      method?.shipping_option_id ??
      "–")
    : null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      if (isEdit) {
        const name = editName.trim();
        if (!name) {
          setErr("Enter a name for the shipping method.");
          return;
        }
        await api(
          `/admin/draft-orders/${draft.id}/shipping-methods/${method.id}`,
          {
            method: "POST",
            body: {
              name,
              amount: Math.max(0, Math.round(Number(amount) || 0)),
            },
          },
        );
      } else if (isCustom) {
        const name = customName.trim();
        if (!name) {
          setErr("Enter a name for the shipping method.");
          return;
        }
        await api(`/admin/draft-orders/${draft.id}/shipping-methods`, {
          method: "POST",
          body: {
            shipping_option_id: "",
            name,
            custom_amount: Math.max(0, Math.round(Number(customAmount) || 0)),
            data: {},
          },
        });
      } else {
        if (!selected) {
          setErr("Select a shipping option.");
          return;
        }
        await api(`/admin/draft-orders/${draft.id}/shipping-methods`, {
          method: "POST",
          body: isCalculated
            ? { shipping_option_id: selected.id, data }
            : { shipping_option_id: selected.id },
        });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const picker =
    loading && !isEdit ? (
      <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <Spinner size={20} />
      </div>
    ) : optionsErr ? (
      <Alert>{optionsErr}</Alert>
    ) : options.length === 0 ? (
      <div className="hint" style={{ marginTop: 0 }}>
        No shipping options are available for this order. Add a custom shipping
        method instead.
      </div>
    ) : options.length > 8 ? (
      <SelectField
        label="Shipping option"
        value={pick}
        onChange={setPick}
        options={[
          ...options.map((o: any) => ({
            value: o.id,
            label: String(o.name ?? o.id),
            sub: money(o.amount, currency),
          })),
          {
            value: CUSTOM_SHIPPING_OPTION,
            label: "Custom",
            sub: "Enter a name and amount",
          },
        ]}
        placeholder="Select a shipping option"
        searchable
      />
    ) : (
      <div
        role="radiogroup"
        aria-label="Shipping option"
        style={{ display: "flex", flexDirection: "column" }}
      >
        {options.map((o: any) => (
          <RadioCardField
            key={o.id}
            option={{
              id: o.id,
              label: String(o.name ?? o.id),
              hint: money(o.amount, currency),
            }}
            selected={pick === o.id}
            onSelect={() => setPick(o.id)}
          />
        ))}
        <RadioCardField
          option={{
            id: CUSTOM_SHIPPING_OPTION,
            label: "Custom",
            hint: "Enter a name and amount",
          }}
          selected={isCustom}
          onSelect={() => setPick(CUSTOM_SHIPPING_OPTION)}
          style={{ marginBottom: 0 }}
        />
      </div>
    );

  return (
    <FormDrawer
      title={isEdit ? "Edit shipping method" : "Add shipping"}
      subtitle={
        isEdit
          ? "Update the name or price of the shipping method."
          : "Pick a shipping option or add a custom one."
      }
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      disabled={!hasItems || (!isEdit && !isCustom && !selected)}
      error={err}
      submitLabel={isEdit ? "Save" : "Add"}
    >
      {!hasItems ? (
        <EmptyState
          title="No items"
          hint="Add items to the order before adding shipping."
        />
      ) : isEdit ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                color: "var(--fg-subtle)",
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              Shipping option
            </div>
            <div
              style={{
                minWidth: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                fontSize: 13,
              }}
            >
              {optionLabel}
            </div>
          </div>
          <TextField label="Name" value={editName} onChange={setEditName} />
          <NumberField
            label="Amount"
            hint="Amount in the smallest currency unit, e.g. cents"
            value={amount}
            onChange={setAmount}
            min={0}
          />
          {Object.keys(data).map((k) => (
            <TextField
              key={k}
              label={k}
              value={String(data[k] ?? "")}
              onChange={() => {}}
              readOnly
            />
          ))}
        </>
      ) : (
        <>
          {picker}
          {isCustom ? (
            <div
              style={{
                border: "1px solid var(--card-border)",
                borderRadius: 8,
                padding: 12,
                marginTop: 12,
              }}
            >
              <TextField
                label="Name"
                placeholder="Standard shipping"
                value={customName}
                onChange={setCustomName}
              />
              <NumberField
                label="Amount"
                hint="Amount in the smallest currency unit, e.g. cents"
                value={customAmount}
                onChange={setCustomAmount}
                min={0}
              />
            </div>
          ) : null}
          {isCalculated
            ? dataKeys.map((k) => (
                <TextField
                  key={k}
                  label={k}
                  value={data[k] ?? ""}
                  onChange={(v) => setData((s) => ({ ...s, [k]: v }))}
                />
              ))
            : null}
        </>
      )}
    </FormDrawer>
  );
}

function TransferDrawer({
  draft,
  onClose,
  onSaved,
}: {
  draft: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState(draft.customer_id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/customers?limit=100&offset=0")
      .then((d: any) => setCustomers(parseList(d, 100).items))
      .catch(() => {});
  }, []);

  async function save() {
    if (!customerId) {
      setErr("Select a customer.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/draft-orders/${draft.id}`, {
        method: "POST",
        body: { customer_id: customerId },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Transfer ownership"
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <SelectField
        label="Customer"
        hint="The customer to transfer this draft order to."
        value={customerId}
        onChange={setCustomerId}
        options={customers.map((c: any) => ({
          value: c.id,
          label:
            [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email,
          sub: c.email,
        }))}
        placeholder="Select customer"
        searchable
      />
    </FormDrawer>
  );
}

function EmailDrawer({
  draft,
  onClose,
  onSaved,
}: {
  draft: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(
    draft.email ?? draft.customer?.email ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!email.trim()) {
      setErr("Enter an email.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/draft-orders/${draft.id}`, {
        method: "POST",
        body: { email: email.trim() },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Edit email"
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <TextField
        label="Email"
        type="email"
        placeholder="john@doe.com"
        value={email}
        onChange={setEmail}
      />
    </FormDrawer>
  );
}

function SalesChannelDrawer({
  draft,
  onClose,
  onSaved,
}: {
  draft: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [channels, setChannels] = useState<any[]>([]);
  const [channelId, setChannelId] = useState(
    draft.sales_channel_id ?? draft.sales_channel?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api("/admin/sales-channels?limit=100&offset=0")
      .then((d: any) => setChannels(parseList(d, 100).items))
      .catch(() => {});
  }, []);

  async function save() {
    if (!channelId) {
      setErr("Select a sales channel.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/draft-orders/${draft.id}`, {
        method: "POST",
        body: { sales_channel_id: channelId },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Edit sales channel"
      onClose={onClose}
      onSubmit={() => {
        void save();
      }}
      busy={busy}
      error={err}
      submitLabel="Save"
    >
      <SelectField
        label="Sales Channel"
        hint="Choose sales channel"
        value={channelId}
        onChange={setChannelId}
        options={channels.map((c: any) => ({
          value: c.id,
          label: c.name ?? c.id,
        }))}
        placeholder="Select sales channel"
        searchable
      />
    </FormDrawer>
  );
}
