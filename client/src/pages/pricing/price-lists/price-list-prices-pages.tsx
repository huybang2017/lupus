import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { listAll } from "@/shared/api/list-all";
import { diffPrices, priceMapError, tiersFromPrices, type PriceMap } from "@/shared/pricing/price-list";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { FormActions } from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { ProductPicker, type PickedProducts } from "@/pages/pricing/price-lists/product-picker";
import { PriceGrid } from "@/pages/pricing/price-lists/price-grid";
import { usePriceCurrencies } from "@/shared/hooks/use-price-currencies";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";

const caption = (
  <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg-subtle)" }}>
    Amounts are in the smallest currency unit (e.g. cents). Clearing a price removes that override.
  </p>
);

const centered = (
  <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
    <Spinner size={22} />
  </div>
);

// Lupus "Edit prices": the price grid for the chosen products (all of the list's products when
// none were chosen). Saving sends only what changed: created, updated and deleted overrides.
export function PriceListPricesEditPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const back = `/r/price-lists/${id}`;
  const { currencies, loading: loadingCurrencies } = usePriceCurrencies();
  const [products, setProducts] = useState<any[]>([]);
  const [before, setBefore] = useState<PriceMap>({});
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ids = useMemo(() => (search.get("ids[]") ?? "").split(",").filter(Boolean), [search]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ price_list }, rows] = await Promise.all([
        api<{ price_list: any }>(`/admin/price-lists/${id}`),
        ids.length
          ? listAll<any>(`/admin/products?id=${ids.map(encodeURIComponent).join(",")}`)
          : listAll<any>(`/admin/products?price_list_id=${encodeURIComponent(id)}`),
      ]);
      if (!alive) return;
      const variantIds = new Set(rows.flatMap((p) => (p.variants ?? []).map((v: any) => v.id)));
      const map = tiersFromPrices((price_list.prices ?? []).filter((p: any) => variantIds.has(p.variant_id)));
      setProducts(rows);
      setBefore(map);
      setPrices(JSON.parse(JSON.stringify(map)));
    })()
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, ids]);

  const dirty = JSON.stringify(before) !== JSON.stringify(prices);
  const leave = useLeaveGuard(dirty, back, busy);
  const problem = priceMapError(prices);

  async function save() {
    if (problem) {
      setShowErrors(true);
      setErr(problem);
      return;
    }
    const { toCreate, toUpdate, toDelete } = diffPrices(before, prices);
    if (toCreate.length + toUpdate.length + toDelete.length === 0) {
      navigate(back);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/price-lists/${id}/prices/batch`, {
        method: "POST",
        body: { create: toCreate, update: toUpdate, delete: toDelete },
      });
      navigate(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo={back}
      onRequestClose={() => void leave()}
      wide
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} disabled={loading || loadingCurrencies} />}
    >
      <div style={{ padding: "20px 24px 72px" }}>
        {err ? <Alert>{err}</Alert> : null}
        {loading || loadingCurrencies ? (
          centered
        ) : products.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--fg-subtle)" }}>This price list has no products yet.</p>
        ) : (
          <>
            {caption}
            <PriceGrid products={products} currencies={currencies} value={prices} onChange={setPrices} showErrors={showErrors} />
          </>
        )}
      </div>
    </WizardShell>
  );
}

// Lupus "Add products": pick products, then set their prices. Products that already have
// overrides in the list are shown checked and locked (use Edit prices for those).
export function PriceListPricesAddPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const back = `/r/price-lists/${id}`;
  const { currencies, loading: loadingCurrencies } = usePriceCurrencies();
  const [tab, setTab] = useState("products");
  const [existing, setExisting] = useState<string[]>([]);
  const [picked, setPicked] = useState<PickedProducts>({});
  const [prices, setPrices] = useState<PriceMap>({});
  const [showProducts, setShowProducts] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listAll<any>(`/admin/products?price_list_id=${encodeURIComponent(id)}`)
      .then((rows) => setExisting(rows.map((p) => p.id)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  const products = Object.values(picked);
  const variantIds = products.flatMap((p: any) => (p.variants ?? []).map((v: any) => v.id));
  const productsError = products.length === 0 ? "Too small: expected array to have >=1 items" : undefined;
  const dirty = products.length > 0;
  const leave = useLeaveGuard(dirty, back, busy);
  const problem = priceMapError(prices);

  function goTo(target: string) {
    if (target === "prices" && productsError) {
      setShowProducts(true);
      setTab("products");
      return;
    }
    setTab(target);
  }

  async function save() {
    setErr(null);
    if (productsError) {
      setShowProducts(true);
      setTab("products");
      return;
    }
    if (problem) {
      setShowPrices(true);
      setErr(problem);
      return;
    }
    const { toCreate } = diffPrices({}, Object.fromEntries(Object.entries(prices).filter(([v]) => variantIds.includes(v))));
    setBusy(true);
    try {
      if (toCreate.length) {
        await api(`/admin/price-lists/${id}/prices/batch`, { method: "POST", body: { create: toCreate } });
      }
      navigate(back);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const last = tab === "prices";
  return (
    <WizardShell
      tabs={[
        { id: "products", label: "Products" },
        { id: "prices", label: "Prices" },
      ]}
      tab={tab}
      onTab={goTo}
      closeTo={back}
      onRequestClose={() => void leave()}
      wide
      footer={
        <FormActions
          onCancel={() => void leave()}
          onSubmit={last ? save : () => goTo("prices")}
          submitLabel={last ? "Save" : "Continue"}
          busy={busy}
          disabled={last && loadingCurrencies}
        />
      }
    >
      {err ? (
        <div style={{ padding: "16px 24px 0" }}>
          <Alert>{err}</Alert>
        </div>
      ) : null}
      {tab === "products" ? (
        <ProductPicker picked={picked} onChange={setPicked} locked={existing} error={showProducts ? productsError : undefined} />
      ) : (
        <div style={{ padding: "20px 24px 72px" }}>
          {loadingCurrencies ? (
            centered
          ) : (
            <>
              {caption}
              <PriceGrid products={products} currencies={currencies} value={prices} onChange={setPrices} showErrors={showPrices} />
            </>
          )}
        </div>
      )}
    </WizardShell>
  );
}
