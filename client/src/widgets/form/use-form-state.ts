import { useCallback, useRef, useState } from "react";

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type FieldRule<T> = (value: T[keyof T], values: T) => string | undefined;

function isBlank(value: unknown): boolean {
  return value === "" || value === null || value === undefined;
}

export function requiredText(value: unknown, message?: string): string | undefined {
  return isBlank(value) ? message ?? "Required" : undefined;
}

export function requiredNumber(value: unknown, message?: string): string | undefined {
  if (isBlank(value)) return message ?? "Required";
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? message ?? "Required" : undefined;
}

export function toggleInList<T>(
  list: T[],
  item: T,
  equals: (a: T, b: T) => boolean = Object.is,
): T[] {
  return list.some((x) => equals(x, item))
    ? list.filter((x) => !equals(x, item))
    : [...list, item]
}

export function minNumber(
  value: unknown,
  min: number,
  message?: string,
): string | undefined {
  if (isBlank(value)) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return undefined;
  if (n < min) return message ?? `Must be at least ${min}`;
  return undefined;
}

export function useFormState<T extends Record<string, any>>(initial: T) {
  const initialRef = useRef(initial);
  const [values, setValues] = useState<T>(initialRef.current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<T>>({});
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((s) => ({ ...s, [key]: value }));
  }, []);
  const setFieldError = useCallback((key: keyof T, message: string) => {
    setFieldErrors((s) => ({ ...s, [key]: message }));
  }, []);
  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);
  const reset = useCallback((next?: Partial<T>) => {
    setValues({ ...initialRef.current, ...next });
    setFieldErrors({});
  }, []);
  const validate = useCallback(
    (rules: Partial<Record<keyof T, FieldRule<T>>>): boolean => {
      const collected: Record<string, string> = {};
      for (const key of Object.keys(rules) as (keyof T)[]) {
        const rule = rules[key];
        if (!rule) continue;
        const message = rule(values[key], values);
        if (message) collected[key as string] = message;
      }
      setFieldErrors(collected as FieldErrors<T>);
      return Object.keys(collected).length === 0;
    },
    [values],
  );
  const dirty = (Object.keys(initialRef.current) as (keyof T)[]).some(
    (key) => !Object.is(values[key], initialRef.current[key]),
  );
  return {
    values,
    setValues,
    set,
    error,
    setError,
    busy,
    setBusy,
    reset,
    fieldErrors,
    setFieldError,
    setFieldErrors,
    clearFieldErrors,
    dirty,
    validate,
  };
}
