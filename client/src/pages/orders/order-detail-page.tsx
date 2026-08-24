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
