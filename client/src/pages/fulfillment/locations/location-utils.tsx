import { countryName } from "@/shared/i18n/country-options";

export interface Address {
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  country_code?: string | null;
  postal_code?: string | null;
  province?: string | null;
  company?: string | null;
  phone?: string | null;
}

/** Lupus's getFormattedAddress: company, street, city + postal code, state, country. */
export function formatAddress(a?: Address | null): string {
  if (!a) return "";
  const cityLine = [a.postal_code, a.city].filter(Boolean).join(" ");
  return [a.company, a.address_1, a.address_2, cityLine, a.province, countryName(a.country_code)]
    .filter(Boolean)
    .join(", ");
}

/** `manual` -> "Manual": the provider id as a human label (Lupus's formatProvider). */
export function formatProvider(id: string): string {
  return id
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "A, B + 2 more" (Lupus's ListSummary with n=1 / inline). */
export function summarize(list: string[], n = 1): string {
  if (list.length === 0) return "";
  const shown = list.slice(0, n).join(", ");
  const rest = list.length - n;
  return rest > 0 ? `${shown} + ${rest} more` : shown;
}

export const REQUIRED = "Too small: expected string to have >=1 characters";
