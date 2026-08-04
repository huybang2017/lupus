import { useId, useState } from "react";
import type { CSSProperties, JSX, KeyboardEvent, ReactNode } from "react";
import { FormField } from "@/widgets/form/form-field";
import { Select } from "@/widgets/ui/select";
import type { SelectOption } from "@/widgets/ui/select";

const EMPTY_OPTION_VALUE = "__empty__";

export type { SelectOption };

export interface BaseFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  style?: CSSProperties;
  maxWidth?: number;
  layout?: "stack" | "split";
}

export function TextField(
  props: BaseFieldProps & {
    type?: "text" | "email" | "search" | "url" | "tel" | "password";
    maxLength?: number;
    autoComplete?: string;
    readOnly?: boolean;
  },
): JSX.Element {
  const {
    label,
    value,
    onChange,
    required,
    optional,
    hint,
    error,
    disabled,
    placeholder,
    id,
    style,
    maxWidth,
    layout,
    type = "text",
    maxLength,
    autoComplete,
    readOnly,
  } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      layout={layout}
    >
      <input
        className="input"
        id={fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        style={{ width: "100%", maxWidth: maxWidth ?? undefined, ...style }}
      />
    </FormField>
  );
}

export function NumberField(
  props: BaseFieldProps & { min?: number; max?: number; step?: number },
): JSX.Element {
  const {
    label,
    value,
    onChange,
    required,
    optional,
    hint,
    error,
    disabled,
    placeholder,
    id,
    style,
    maxWidth,
    layout,
    min,
    max,
    step,
  } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      layout={layout}
    >
      <input
        className="input"
        id={fieldId}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        aria-invalid={error ? true : undefined}
        style={{ width: "100%", maxWidth: maxWidth ?? undefined, ...style }}
      />
    </FormField>
  );
}

export function TextAreaField(
  props: BaseFieldProps & { rows?: number },
): JSX.Element {
  const {
    label,
    value,
    onChange,
    required,
    optional,
    hint,
    error,
    disabled,
    placeholder,
    id,
    style,
    maxWidth,
    layout,
    rows = 3,
  } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      layout={layout}
    >
      <textarea
        className="input"
        id={fieldId}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        style={{
          width: "100%",
          maxWidth: maxWidth ?? undefined,
          resize: "vertical",
          ...style,
        }}
      />
    </FormField>
  );
}

export function DateTimeField(props: BaseFieldProps): JSX.Element {
  const {
    label,
    value,
    onChange,
    required,
    optional,
    hint,
    error,
    disabled,
    placeholder,
    id,
    style,
    maxWidth,
    layout,
  } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      layout={layout}
    >
      <input
        className="input"
        id={fieldId}
        type="datetime-local"
        value={value.slice(0, 16)}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        style={{ width: "100%", maxWidth: maxWidth ?? undefined, ...style }}
      />
    </FormField>
  );
}

export function DateField(props: BaseFieldProps): JSX.Element {
  const {
    label,
    value,
    onChange,
    required,
    optional,
    hint,
    error,
    disabled,
    placeholder,
    id,
    style,
    maxWidth,
    layout,
  } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      layout={layout}
    >
      <input
        className="input"
        id={fieldId}
        type="date"
        value={value.slice(0, 10)}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        style={{ width: "100%", maxWidth: maxWidth ?? undefined, ...style }}
      />
    </FormField>
  );
}

export function SelectField(
  props: Omit<BaseFieldProps, "placeholder"> & {
    options: SelectOption[];
    placeholder?: string;
    searchable?: boolean;
    allowClear?: boolean;
    emptyText?: string;
    searchPlaceholder?: string;
  },
): JSX.Element {
  const {
    label,
    value,
    onChange,
    required,
    optional,
    hint,
    error,
    disabled,
    id,
    style,
    maxWidth,
    layout,
    options,
    placeholder,
    searchable,
    allowClear,
    emptyText,
    searchPlaceholder,
  } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  const mappedOptions = options.map((o) =>
    o.value === "" ? { ...o, value: EMPTY_OPTION_VALUE } : o,
  );
  const mappedValue = value === "" ? EMPTY_OPTION_VALUE : value;
  return (
    <FormField
      label={label}
      htmlFor={fieldId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
      layout={layout}
    >
      <Select
        value={mappedValue}
        onChange={(v) => onChange(v === EMPTY_OPTION_VALUE ? "" : v)}
        options={mappedOptions}
        placeholder={placeholder}
        allowClear={allowClear}
        disabled={disabled}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        aria-label={label ?? fieldId}
        style={{ width: "100%", maxWidth: maxWidth ?? undefined, ...style }}
      />
    </FormField>
  );
}

export function CheckboxField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
}): JSX.Element {
  const { label, checked, onChange, hint, error, disabled, id } = props;
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="field">
      <label className="checkrow" htmlFor={fieldId}>
        <input
          id={fieldId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span style={{ display: "flex", flexDirection: "column" }}>
          <span>{label}</span>
          {hint ? <div className="hint">{hint}</div> : null}
        </span>
      </label>
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function ToggleField(props: {
  title: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  disabled?: boolean;
  /** Put the switch opposite the label (Lupus's settings rows). Default: before the label. */
  switchSide?: "left" | "right";
}): JSX.Element {
  const { title, hint, checked, onChange, error, disabled, switchSide = "left" } = props;
  return (
    <div className="field">
      <div
        style={{
          display: "flex",
          flexDirection: switchSide === "right" ? "row-reverse" : "row",
          justifyContent: switchSide === "right" ? "space-between" : undefined,
          alignItems: switchSide === "right" ? "center" : "flex-start",
          gap: 10,
