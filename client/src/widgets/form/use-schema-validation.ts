import { useCallback } from "react"
import type { FieldType, SchemaFieldDef } from "@/widgets/ui/surfaces"
import { minNumber, requiredText } from "@/widgets/form/use-form-state"
import type { FieldErrors, FieldRule } from "@/widgets/form/use-form-state"
import { useFormState } from "@/widgets/form/use-form-state"

export interface SchemaValidationResult<T extends Record<string, any>> {
  rules: Partial<Record<keyof T, FieldRule<T>>>
  validate: () => boolean
  fieldErrors: FieldErrors<T>
}

const TRIMMED_TYPES = new Set<FieldType>([
  "text",
  "textarea",
  "select",
  "date",
  "datetime",
  "radiogroup",
])

function isBlankish(value: unknown): boolean {
  if (value === "" || value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  return false
}

function maxNumber(value: unknown, max: number, message?: string): string | undefined {
  if (isBlankish(value)) return undefined
  const n = typeof value === "number" ? value : Number(value)
  if (Number.isNaN(n)) return undefined
  if (n > max) return message ?? `Must be at most ${max}`
  return undefined
}

function requiredMessage(field: SchemaFieldDef, value: unknown): string | undefined {
  const message = `${field.label} is required`
  if (field.type === "checkbox" || field.type === "toggle") {
    return value === true ? undefined : message
  }
  if (field.type === "checklist") {
    return Array.isArray(value) && value.length > 0 ? undefined : message
  }
  if (field.type === "radiogroup") {
    return String(value ?? "").trim() ? undefined : message
  }
  if (TRIMMED_TYPES.has(field.type) && typeof value === "string") {
    return requiredText(value.trim(), message)
  }
  return requiredText(value, message)
}

function buildRule(field: SchemaFieldDef): (value: unknown, values: Record<string, unknown>) => string | undefined {
  return (value, values) => {
    if (field.type === "hidden" || field.type === "file") return undefined
    if (field.hidden && field.hidden(values)) return undefined
    if (field.validate) {
      const custom = field.validate(value, values)
      if (custom) return custom
    }
    if (field.required) {
      const required = requiredMessage(field, value)
      if (required) return required
    }
    if (field.validateNumber === false) return undefined
    if (field.type === "number" && field.min !== undefined) {
      const low = isBlankish(value) ? undefined : minNumber(value, field.min, `${field.label} must be at least ${field.min}`)
      if (low) return low
    }
    if (field.type === "number" && field.max !== undefined) {
      const high = maxNumber(value, field.max, `${field.label} must be at most ${field.max}`)
      if (high) return high
    }
    return undefined
  }
}

export function useSchemaValidation<T extends Record<string, any>>(
  fields: SchemaFieldDef[],
  form: ReturnType<typeof useFormState<T>>,
): SchemaValidationResult<T> {
  const rules: Partial<Record<keyof T, FieldRule<T>>> = {}
  for (const field of fields) {
    const rule = buildRule(field)
    rules[field.key as keyof T] = rule
  }

  const run = form.validate
  const validate = useCallback(() => run(rules), [run, rules])

  return { rules, validate, fieldErrors: form.fieldErrors }
}
