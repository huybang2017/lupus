import type { CheckOption } from "@/widgets/form";

// English singularization for resource labels ("Policies" -> "Policy").
// Only used for display strings like "Create X" / "Edit X".
export function singular(label: string): string {
  if (/ies$/i.test(label) && label.length > 3) return label.slice(0, -3) + "y";
  if (/ses$/i.test(label)) return label.slice(0, -2);
  if (/s$/i.test(label) && !/ss$/i.test(label)) return label.slice(0, -1);
  return label;
}

export function toOptionList<T extends { id: string | number }>(
  rows: T[],
  label: (row: T) => string,
  sub?: (row: T) => string | undefined,
): CheckOption[] {
  return rows.map((r) => ({ id: String(r.id), label: label(r), sub: sub?.(r) }));
}
