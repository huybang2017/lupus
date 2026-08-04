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
