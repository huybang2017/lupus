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
