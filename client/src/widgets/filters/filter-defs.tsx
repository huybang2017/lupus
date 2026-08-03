import type { FilterDef, FilterOption } from "@/shared/filters/list-filters";

// Factory helpers so resources.tsx can describe a list's filters declaratively
// instead of hand-writing the same object shape 20 times. No React here: a
// FilterDef is plain data and must stay usable from query keys and URL parsing.

function titleize(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/** `created_at` -> `Created at`, `sales_channel_id` -> `Sales channel`, `id` -> `Id`. */
export function humanize(key: string): string {
  // A trailing `_id` is the foreign-key suffix every Lupus field carries and
  // nobody wants to read "Sales channel id" in a chip.
  const stripped =
    key.endsWith("_id") && key.length > 3 ? key.slice(0, -3) : key;
  return titleize(stripped.replace(/[_-]+/g, " "));
}

/** Static option list from ["pending","complete"] with first-letter casing. */
export function options(...values: string[]): FilterOption[] {
  return values.map((value) => ({
    value,
    label: titleize(value.replace(/[_-]+/g, " ")),
  }));
}

/** `{ value, label }` pairs from tuples. */
export function optionPairs(pairs: [string, string][]): FilterOption[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

/** Comma separated string -> option list (handy for long enums). */
export function csvOptions(csv: string): FilterOption[] {
  return options(
    ...csv
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );
}

// `extra` is spread last everywhere so a caller can override any field.
export function textFilter(
  key: string,
  label: string,
  extra?: Partial<FilterDef>,
): FilterDef {
  return { key, label, type: "text", ...extra };
}

export function selectFilter(
  key: string,
  label: string,
  opts: FilterOption[],
  extra?: Partial<FilterDef>,
): FilterDef {
  return { key, label, type: "select", options: opts, ...extra };
}

export function multiSelectFilter(
  key: string,
  label: string,
  opts: FilterOption[],
  extra?: Partial<FilterDef>,
): FilterDef {
  return { key, label, type: "multiselect", options: opts, ...extra };
}

export function boolFilter(
  key: string,
  label: string,
  extra?: Partial<FilterDef>,
): FilterDef {
  return { key, label, type: "boolean", ...extra };
}

export function dateFilter(
  key: string,
  label?: string,
  extra?: Partial<FilterDef>,
): FilterDef {
  return { key, label: label ?? humanize(key), type: "date", ...extra };
}

export function numberFilter(
  key: string,
  label?: string,
  extra?: Partial<FilterDef>,
): FilterDef {
  return { key, label: label ?? humanize(key), type: "number", ...extra };
}