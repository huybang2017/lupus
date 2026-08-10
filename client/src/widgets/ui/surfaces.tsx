import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export type BadgeTone = "gray" | "green" | "red" | "amber" | "blue";

const badgeToneMap: Record<string, BadgeTone> = {
  not_paid: "red",
  authorized: "amber",
  partially_authorized: "red",
  awaiting: "amber",
  captured: "green",
  partially_captured: "amber",
  refunded: "red",
  partially_refunded: "amber",
  canceled: "red",
  requires_action: "amber",
  not_fulfilled: "red",
  partially_fulfilled: "amber",
  fulfilled: "green",
  partially_shipped: "amber",
  shipped: "green",
  delivered: "green",
  partially_delivered: "amber",
  partially_returned: "amber",
  returned: "green",
  pending: "amber",
  completed: "green",
  draft: "gray",
  archived: "gray",
  open: "amber",
  requires_shipping: "amber",
};

export function badgeTone(value: unknown): BadgeTone {
  if (value === null || value === undefined) return "gray";
  const key = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (key === "") return "gray";
  return badgeToneMap[key] ?? "gray";
}

export function Badge({ value }: { value: unknown }) {
  const s = String(value ?? "");
  return <span className={"badge badge-" + badgeTone(value)}>{s}</span>;
}

export function fmtCell(value: unknown): ReactNode {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#9ca3af" }}>—</span>;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return <span style={{ color: "#9ca3af" }}>--</span>;
    return <span className="mono">{JSON.stringify(value).slice(0, 80)}</span>;
  }
  const s = String(value);
  if (
    /^(active|pending|completed|failed|cancelled|shipped|delivered|published|draft|open|paid|sent|enabled|disabled|archived|succeeded|running)$/i.test(
      s,
    )
  )
    return <Badge value={s} />;
  if (s.length > 60 || /^[a-z]+_[a-f0-9]{16,}/.test(s))
    return (
      <span className="mono">{s.length > 60 ? s.slice(0, 60) + "…" : s}</span>
    );
  return s;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type FieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "checkbox"
  | "toggle"
  | "json"
  | "file"
  | "hidden"
  | "date"
  | "datetime"
  | "checklist"
  | "radiogroup";

export interface FieldOption {
  value: string;
  label: string;
  sub?: string;
}

export interface FieldOptionsResult {
  options: FieldOption[];
  degraded?: string;
}

export type FieldOptionsLoader =
  | ((
      values: Record<string, any>,
    ) => Promise<FieldOption[] | FieldOptionsResult>)
  | ((values: Record<string, any>) => FieldOption[] | FieldOptionsResult);

export type FieldOptions = FieldOption[] | FieldOptionsLoader;

export type FieldTextFn = (
  values: Record<string, any>,
  options: FieldOption[],
  allOptions: Record<string, FieldOption[]>,
) => string;

export type FieldText = string | FieldTextFn;

export function resolveFieldText(
  text: FieldText | undefined,
  values: Record<string, any>,
  options: FieldOption[] = [],
  allOptions: Record<string, FieldOption[]> = {},
): string | undefined {
  if (text === undefined) return undefined;
  return typeof text === "function" ? text(values, options, allOptions) : text;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  optional?: boolean;
  readOnly?: boolean;
  inputType?: "text" | "email" | "search" | "url" | "tel" | "password";
  placeholder?: string;
  hint?: string;
  options?: FieldOption[];
  loadOptions?: FieldOptionsLoader;
  defaultValue?: unknown;
  dependsOn?: string[];
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  maxLength?: number;
  maxHeight?: number;
  maxWidth?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  allowClear?: boolean;
  accept?: string;
  multiple?: boolean;
  emptyHint?: string;
  emptyText?: string;
  cols?: 1 | 2;
  colSpan?: 1 | 2 | 3;
  style?: CSSProperties;
  validateNumber?: boolean;
  validate?: (
    value: unknown,
    values: Record<string, any>,
  ) => string | undefined;
  hidden?: (values: Record<string, any>) => boolean;
  format?: (value: unknown) => string;
}

export interface SchemaFieldDef extends Omit<FieldDef, "placeholder" | "hint"> {
  placeholder?: FieldText;
  hint?: FieldText;
}

export function parseFieldValue(field: SchemaFieldDef, raw: any): any {
  if (field.type === "json") {
    if (raw === null || raw === undefined || raw === "") return undefined;
    if (typeof raw === "object") return raw;
    return JSON.parse(String(raw));
  }
  if (
    field.type === "number" &&
    (raw === "" || raw === null || raw === undefined)
  )
    return undefined;
  if (field.type === "select" && raw === "") return undefined;
  if (field.type === "toggle" || field.type === "checkbox") {
    if (typeof raw === "string") return raw === "true";
    return !!raw;
  }
  if (field.type === "date" || field.type === "datetime") {
    if (raw === null || raw === undefined || raw === "") return undefined;
    return String(raw);
  }
  if (field.type === "checklist") {
    if (raw === null || raw === undefined || raw === "") return [];
    return Array.isArray(raw) ? raw : [raw];
  }
  if (
    field.type === "radiogroup" &&
    (raw === null || raw === undefined || raw === "")
  )
    return undefined;
  return raw;
}

export function useModalForm() {
  const [open, setOpen] = useState<null | { title: string; body: ReactNode }>(
    null,
  );
  const show = (title: string, body: ReactNode) => setOpen({ title, body });
  const close = () => setOpen(null);
  const el = open ? (
    <Modal title={open.title} onClose={close}>
      {open.body}
    </Modal>
  ) : null;
  return { show, close, el };
}
