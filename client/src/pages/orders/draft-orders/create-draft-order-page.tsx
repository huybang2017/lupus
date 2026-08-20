import { useEffect, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { COUNTRIES } from "@/shared/i18n/countries";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import {
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextField,
  ToggleField,
  requiredText,
  useFormState,
} from "@/widgets/form";
import type { CheckOption } from "@/widgets/form";
import { useConfirm } from "@/widgets/confirm";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

interface Addr {
  country_code: string;
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  postal_code: string;
  province: string;
  phone: string;
}

const EMPTY_ADDR: Addr = {
  country_code: "",
  first_name: "",
  last_name: "",
  company: "",
  address_1: "",
  address_2: "",
  city: "",
  postal_code: "",
  province: "",
  phone: "",
};

const REQUIRED_ADDR_KEYS: (keyof Addr)[] = [
  "country_code",
  "first_name",
  "last_name",
  "address_1",
  "city",
  "postal_code",
];

function addrComplete(a: Addr): boolean {
  return REQUIRED_ADDR_KEYS.every((k) => a[k].trim() !== "");
}

function cleanAddr(a: Addr): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(a) as (keyof Addr)[]) {
    const v = a[k].trim();
    if (v !== "") out[k] = v;
  }
  return out;
}

function savedLabel(a: any, index: number): string {
  const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const label = [name, a.address_1, a.city].filter(Boolean).join(", ");
  return label || `Saved address ${index + 1}`;
}

export function CreateDraftOrderPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [regions, setRegions] = useState<CheckOption[]>([]);
  const [channels, setChannels] = useState<CheckOption[]>([]);
  const [customers, setCustomers] = useState<CheckOption[]>([]);
  const [customersRaw, setCustomersRaw] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [shipPick, setShipPick] = useState("");
  const [billPick, setBillPick] = useState("");

  const {
    values,
    set,
    error: serverErr,
    setError: setServerErr,
    busy,
    setBusy,
    validate,
    fieldErrors,
    dirty,
  } = useFormState({
    regionId: "",
    channelId: "",
    customerId: "",
    email: "",
    ship: { ...EMPTY_ADDR },
    bill: { ...EMPTY_ADDR },
    sameAsShipping: true,
  });

  const regionId = values.regionId;
  const channelId = values.channelId;
  const customerId = values.customerId;
  const email = values.email;
  const ship = values.ship;
  const bill = values.bill;
  const sameAsShipping = values.sameAsShipping;
  const setCustomerId = (v: string) => set("customerId", v);
  const setEmail = (v: string) => set("email", v);
  const setShip = (v: Addr) => set("ship", v);
  const setBill = (v: Addr) => set("bill", v);
  const setSameAsShipping = (v: boolean) => {
    set("sameAsShipping", v)
    setBill({ ...EMPTY_ADDR })
    setBillPick("")
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [rg, ch, cu] = await Promise.all([
          api("/admin/regions?limit=100&offset=0").catch(() => null),
          api("/admin/sales-channels?limit=100&offset=0").catch(() => null),
          api("/admin/customers?limit=100&offset=0").catch(() => null),
        ]);
        if (!alive) return;
        if (rg)
          setRegions(
            parseList(rg, 100).items.map((r: any) => ({
              id: r.id,
              label: r.name ?? r.id,
              sub: r.currency_code,
            })),
          );
        if (ch)
          setChannels(
            parseList(ch, 100).items.map((c: any) => ({
              id: c.id,
              label: c.name ?? c.id,
            })),
          );
        if (cu) {
          const rows = parseList(cu, 100).items;
          setCustomersRaw(rows);
          setCustomers(
            rows.map((c: any) => {
              const name = [c.first_name, c.last_name]
                .filter(Boolean)
                .join(" ");
              return {
                id: c.id,
                label: name ? `${name} (${c.email})` : c.email,
                sub: c.email,
              };
            }),
          );
        }
      } catch (e) {
        if (alive) setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!customerId) {
      setSavedAddresses([]);
      setShipPick("");
      setBillPick("");
      return;
    }
    let alive = true;
    api(`/admin/customers/${customerId}/addresses`)
      .then((d: any) => {
