import type { JSX } from "react"
import { FormGrid, FormSection } from "@/widgets/form/form-grid"
import { SchemaField } from "@/widgets/form/schema-field"
import type { FieldOption, SchemaFieldDef } from "@/widgets/ui/surfaces"
import type { SelectOption } from "@/widgets/ui/select"

export interface SchemaGroup {
  cols?: 1 | 2 | 3
  fields: SchemaFieldDef[]
}

export interface SchemaSectionProps {
  title?: string
  subtitle?: string
  fields: SchemaFieldDef[]
  groups?: SchemaGroup[]
  values: Record<string, any>
  errors: Partial<Record<string, string>>
  optionsByKey?: Record<string, SelectOption[]>
  allOptionsByKey?: Record<string, FieldOption[]>
  loadingKeys?: string[]
  cols?: 1 | 2 | 3
  onChange: (key: string, value: any) => void
}

export function SchemaSection(props: SchemaSectionProps): JSX.Element {
  const {
    title,
    subtitle,
    fields,
    groups,
    values,
    errors,
    optionsByKey,
    allOptionsByKey,
    loadingKeys,
    cols,
    onChange,
  } = props
  const resolved: SchemaGroup[] =
    groups && groups.length > 0 ? groups : [{ cols, fields }]
  const grids = resolved.map((group, index) => (
    <FormGrid key={index} cols={group.cols ?? 1}>
      {group.fields.map((field) => (
        <SchemaField
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(v) => onChange(field.key, v)}
          error={errors[field.key]}
          options={optionsByKey?.[field.key]}
          allOptions={allOptionsByKey}
          loading={loadingKeys?.includes(field.key)}
          formValues={values}
        />
      ))}
    </FormGrid>
  ))
  if (!title) return <>{grids}</>
  return (
    <FormSection title={title} subtitle={subtitle}>
      {grids}
    </FormSection>
  )
}
