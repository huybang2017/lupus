import type { CSSProperties, JSX } from "react"
import {
  CheckboxField,
  CheckListField,
  DateField,
  DateTimeField,
  NumberField,
  RadioGroupField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/widgets/form/form-fields"
import type { CheckOption, RadioCardOption } from "@/widgets/form/form-fields"
import { FormField } from "@/widgets/form/form-field"
import { toggleInList } from "@/widgets/form/use-form-state"
import type { SelectOption } from "@/widgets/ui/select"
import type { SchemaFieldDef, FieldOption } from "@/widgets/ui/surfaces"
import { resolveFieldText } from "@/widgets/ui/surfaces"

export function schemaOptions(field: SchemaFieldDef): SelectOption[] {
  if (!Array.isArray(field.options)) return []
  return field.options.map((o) => ({ value: o.value, label: o.label, sub: o.sub }))
}

export interface SchemaFieldProps {
  field: SchemaFieldDef
  value: any
  onChange: (value: any) => void
  error?: string
  options?: SelectOption[]
  allOptions?: Record<string, FieldOption[]>
  loading?: boolean
  style?: CSSProperties
  formValues?: Record<string, any>
}

function spanStyle(field: SchemaFieldDef): CSSProperties | undefined {
  if (!field.colSpan || field.colSpan <= 1) return undefined
  return { gridColumn: `span ${field.colSpan}` }
}

function mergeStyles(a: CSSProperties | undefined, b: CSSProperties | undefined): CSSProperties | undefined {
  if (!a) return b
  if (!b) return a
  return { ...a, ...b }
}

function boxStyle(field: SchemaFieldDef): CSSProperties | undefined {
  if (!field.style && field.maxWidth === undefined) return undefined
  return { ...field.style, ...(field.maxWidth === undefined ? undefined : { maxWidth: field.maxWidth }) }
}

function wrapperStyle(field: SchemaFieldDef, base?: CSSProperties): CSSProperties | undefined {
  const span = spanStyle(field)
  if (!span) return base
  if (!base) return span
  return { ...base, ...span }
}

export function SchemaField(props: SchemaFieldProps): JSX.Element | null {
  const { field, value, onChange, error, options, allOptions, loading, style, formValues } =
    props

  if (field.type === "hidden" || field.type === "file") return null
  const values = formValues ?? {}
  if (field.hidden && field.hidden(values)) return null
  const fieldOptions = options ?? schemaOptions(field)
  const placeholder = resolveFieldText(field.placeholder, values, fieldOptions, allOptions)
  const hint = resolveFieldText(field.hint, values, fieldOptions, allOptions)

  const controlStyle = mergeStyles(style, field.style)
  const box = boxStyle(field)
  const wrap = (el: JSX.Element, nodeStyle?: CSSProperties): JSX.Element => {
    const merged = wrapperStyle(field, nodeStyle)
    return merged ? <div style={merged}>{el}</div> : el
  }

  if (field.type === "checkbox") {
    if (!field.required) {
      return wrap(
        <CheckboxField
          label={field.label}
          checked={!!value}
          onChange={(v) => onChange(v)}
          hint={hint}
          error={error}
          disabled={field.readOnly}
        />,
        mergeStyles(style, box),
      )
    }
    return wrap(
      <FormField label={field.label} required hint={hint} error={error}>
        <CheckboxField
          label=""
          checked={!!value}
          onChange={(v) => onChange(v)}
          disabled={field.readOnly}
        />
      </FormField>,
      mergeStyles(style, box),
    )
  }

  if (field.type === "toggle") {
    return wrap(
      <ToggleField
        title={field.label}
        checked={!!value}
        onChange={(v) => onChange(v)}
        hint={hint}
        error={error}
        disabled={field.readOnly}
      />,
      mergeStyles(style, box),
    )
  }

  if (field.type === "select") {
    return wrap(
      <SelectField
        label={field.label}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(v) => onChange(v)}
        required={field.required}
        optional={field.optional}
        hint={hint}
        error={error}
        options={fieldOptions}
        placeholder={placeholder ?? "—"}
        searchable={field.searchable}
        searchPlaceholder={field.searchPlaceholder}
        emptyText={field.emptyText}
        allowClear={field.allowClear}
        disabled={field.readOnly || loading}
        style={controlStyle}
        maxWidth={field.maxWidth}
      />,
    )
  }

  if (field.type === "checklist") {
    const list = Array.isArray(value) ? value : []
    const checkOptions: CheckOption[] = fieldOptions.map((o) => ({
      id: o.value,
      label: o.label,
      sub: o.sub,
      disabled: !!field.readOnly || !!loading,
    }))
    return wrap(
      <CheckListField
        label={field.label}
        options={checkOptions}
        checked={list}
        onToggle={(id) => onChange(toggleInList(list, id))}
        hint={hint}
        error={error}
        required={field.required}
        emptyHint={field.emptyHint}
        searchable={field.searchable}
        searchPlaceholder={field.searchPlaceholder}
        maxHeight={field.maxHeight ?? 180}
      />,
      mergeStyles(style, box),
    )
  }

  if (field.type === "radiogroup") {
    const radioOptions: RadioCardOption[] = fieldOptions.map((o) => ({
      id: o.value,
      label: o.label,
      hint: o.sub,
      disabled: !!field.readOnly || !!loading,
    }))
    return wrap(
      <RadioGroupField
        label={field.label}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(v) => onChange(v)}
        options={radioOptions}
        hint={hint}
        error={error}
        required={field.required}
        cols={field.cols}
      />,
      mergeStyles(style, box),
    )
  }

  if (field.type === "textarea" || field.type === "json") {
    return wrap(
      <TextAreaField
        label={field.label}
        value={
          typeof value === "object" && value !== null
            ? JSON.stringify(value, null, 2)
            : String(value ?? "")
        }
        onChange={(v) => onChange(v)}
        required={field.required}
        optional={field.optional}
        hint={hint}
        error={error}
        placeholder={placeholder ?? (field.type === "json" ? "{ \"key\": \"value\" }" : undefined)}
        rows={field.rows ?? 5}
        disabled={field.readOnly}
        style={controlStyle}
        maxWidth={field.maxWidth}
      />,
    )
  }

  if (field.type === "number") {
    return wrap(
      <NumberField
        label={field.label}
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(v) => onChange(v === "" ? null : Number(v))}
        required={field.required}
        optional={field.optional}
        hint={hint}
        error={error}
        placeholder={placeholder}
        disabled={field.readOnly}
        min={field.min}
        max={field.max}
        step={field.step}
        style={controlStyle}
        maxWidth={field.maxWidth}
      />,
    )
  }

  if (field.type === "date" || field.type === "datetime") {
    const common = {
      label: field.label,
      value: String(value ?? ""),
      onChange: (v: string) => onChange(v),
      required: field.required,
      optional: field.optional,
      hint,
      error,
      disabled: field.readOnly,
      placeholder,
      style: controlStyle,
      maxWidth: field.maxWidth,
    }
    return wrap(field.type === "date" ? <DateField {...common} /> : <DateTimeField {...common} />)
  }

  return wrap(
    <TextField
      label={field.label}
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(v) => onChange(v)}
      required={field.required}
      optional={field.optional}
      hint={hint}
      error={error}
      placeholder={placeholder}
      type={field.inputType}
      maxLength={field.maxLength}
      readOnly={field.readOnly}
      style={controlStyle}
      maxWidth={field.maxWidth}
    />,
  )
}
