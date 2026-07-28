import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";

/**
 * The currencies a price can be set in: the store's supported currencies (Settings > Store),
 * default currency first. Falls back to USD if the store cannot be read.
 */
export function usePriceCurrencies(): { currencies: string[]; loading: boolean } {
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    api<{ store: { supported_currencies?: { currency_code: string }[] } }>("/admin/store")
      .then((d) => {
        if (!alive) return;
        const codes = (d.store.supported_currencies ?? []).map((c) => String(c.currency_code).toUpperCase());
        setCurrencies(codes.length ? codes : ["USD"]);
      })
      .catch(() => alive && setCurrencies(["USD"]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { currencies, loading };
}
