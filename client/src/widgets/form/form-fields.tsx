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
        }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          style={{
            width: 28,
            height: 16,
            borderRadius: 999,
            background: checked
              ? "var(--fg-interactive)"
              : "var(--field-border)",
            position: "relative",
            border: "none",
            cursor: "pointer",
            flexShrink: 0,
            padding: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: checked ? 14 : 2,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "var(--card-bg)",
              transition: "left .12s",
            }}
          />
        </button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {hint ? (
            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{hint}</div>
          ) : null}
        </div>
      </div>
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export interface CheckOption {
  id: string;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function CheckListField(props: {
  label?: string;
  options: CheckOption[];
  checked: string[];
  onToggle: (id: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  emptyHint?: string;
  maxHeight?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  labelWidth?: number;
}): JSX.Element {
  const {
    label,
    options,
    checked,
    onToggle,
    hint,
    error,
    required,
    emptyHint,
    maxHeight,
    searchable,
    searchPlaceholder,
    labelWidth,
  } = props;
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? options.filter((o) =>
        `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(needle),
      )
    : options;
  const searchBox = searchable ? (
    <input
      className="input"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder={searchPlaceholder ?? "Search…"}
      aria-label={label ?? searchPlaceholder ?? "Search options"}
      style={{ width: "100%", marginBottom: 8 }}
    />
  ) : null;
  const box = (
    <div
      style={{
        maxHeight: maxHeight ?? 180,
        overflowY: "auto",
        border: "1px solid var(--card-border)",
        borderRadius: 8,
        padding: 8,
      }}
    >
      {shown.length === 0 ? (
        <div className="hint" style={{ marginTop: 0 }}>
          {emptyHint ?? "None available"}
        </div>
      ) : (
        shown.map((o) => (
          <label className="checkrow" key={o.id}>
            <input
              type="checkbox"
              checked={checked.includes(o.id)}
              disabled={o.disabled}
              onChange={() => onToggle(o.id)}
            />
            <span>{o.label}</span>
            {o.sub ? (
              <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                {o.sub}
              </span>
            ) : null}
          </label>
        ))
      )}
    </div>
  );
  const body =
    labelWidth != null && label ? (
      <div style={{ display: "flex", gap: 12 }}>
        <div
          style={{
            width: labelWidth,
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {label}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {searchBox}
          {box}
        </div>
      </div>
    ) : (
      <>
        {searchBox}
        {box}
      </>
    );
  if (!label && !hint && !error && !required)
    return <div style={{ marginBottom: 12 }}>{body}</div>;
  return (
    <FormField
      label={labelWidth != null ? undefined : label}
      required={required}
      hint={hint}
      error={error}
    >
      {body}
    </FormField>
  );
}

export interface RadioCardOption {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function RadioCardField(props: {
  option: RadioCardOption;
  selected: boolean;
  onSelect: () => void;
  style?: CSSProperties;
}): JSX.Element {
  const { option, selected, onSelect, style } = props;
  return (
    <button
      type="button"
      id={`radio-${option.id}`}
      role="radio"
      aria-checked={selected}
      disabled={option.disabled}
      onClick={onSelect}
      style={{
        display: "flex",
        gap: 10,
        width: "100%",
        textAlign: "left",
        cursor: option.disabled ? "default" : "pointer",
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${selected ? "var(--fg-interactive)" : "var(--card-border)"}`,
        background: selected ? "var(--hover-bg)" : "var(--card-bg)",
        color: "var(--fg-base)",
        marginBottom: 8,
        boxSizing: "border-box",
        opacity: option.disabled ? 0.5 : undefined,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `2px solid ${selected ? "var(--fg-interactive)" : "var(--field-border)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {selected ? (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--fg-interactive)",
            }}
          />
        ) : null}
      </span>
      <span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>
          {option.label}
        </span>
        {option.hint ? (
          <span
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--fg-subtle)",
              marginTop: 2,
            }}
          >
            {option.hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function RadioGroupField(props: {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  options: RadioCardOption[];
  hint?: string;
  error?: string;
  required?: boolean;
  cols?: 1 | 2 | 3;
}): JSX.Element {
  const {
    label,
    value,
    onChange,
    options,
    hint,
    error,
    required,
    cols = 1,
  } = props;
  const enabled = options.filter((o) => !o.disabled);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
    const backward = e.key === "ArrowUp" || e.key === "ArrowLeft";
    if (!forward && !backward) return;
    e.preventDefault();
    if (enabled.length === 0) return;
    const current = enabled.findIndex((o) => o.id === value);
    const step = forward ? 1 : -1;
    const start =
      current === -1
        ? forward
          ? 0
          : enabled.length - 1
        : current;
    const next = enabled[(start + step + enabled.length) % enabled.length];
    onChange(next.id);
    document.getElementById(`radio-${next.id}`)?.focus();
  };
  const group = (
    <div
      role="radiogroup"
      aria-label={label ?? undefined}
      aria-required={required || undefined}
      onKeyDown={handleKeyDown}
      style={
        cols > 1
          ? { display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 8 }
          : { display: "flex", flexDirection: "column" }
      }
    >
      {options.map((o) => (
        <RadioCardField
          key={o.id}
          option={o}
          selected={o.id === value}
          onSelect={() => onChange(o.id)}
          style={cols > 1 ? { marginBottom: 0 } : undefined}
        />
      ))}
    </div>
  );
  if (!label && !hint && !error && !required) return group;
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {group}
    </FormField>
  );
}

export function SearchField(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  width?: number;
  autoFocus?: boolean;
  ariaLabel?: string;
  /** Optional node pinned over the left edge, e.g. a magnifier icon. */
  leading?: ReactNode;
}): JSX.Element {
  const {
    value,
    onChange,
    onSubmit,
    // A search box with no placeholder reads as an empty, broken box, so the
    // default is part of the component rather than every call site's job.
    placeholder = "Search",
    width = 220,
    autoFocus,
    ariaLabel,
    leading,
  } = props;
  const input = (
    <input
      className="input"
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        onSubmit?.();
      }}
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      style={leading ? { width, paddingLeft: 34 } : { width }}
      autoFocus={autoFocus}
    />
  );
  if (!leading) return input;
  return (
    <span style={{ position: "relative", display: "inline-flex", width }}>
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          display: "inline-flex",
          color: "var(--fg-muted)",
          // The icon is decoration: clicks belong to the input underneath.
          pointerEvents: "none",
        }}
      >
        {leading}
      </span>
      {input}
    </span>
  );
}
