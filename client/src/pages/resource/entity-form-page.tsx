import { useMemo, useRef } from "react"
import type { JSX, ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/shared/api/client"
import { parseFieldValue } from "@/widgets/ui/surfaces"
import type { FieldOption, SchemaFieldDef } from "@/widgets/ui/surfaces"
import { Alert, Spinner } from "@/widgets/ui/primitives"
import {
  FormActions,
  SchemaSection,
  useFormState,
  useSchemaOptions,
  useSchemaValidation,
} from "@/widgets/form"
import type { FieldErrors } from "@/widgets/form"
import { useConfirm } from "@/widgets/confirm"
import { WizardShell } from "@/widgets/wizard/wizard-shell"
import type { WizardTab } from "@/widgets/wizard/wizard-shell"

export interface EntityFieldGroup {
  cols?: 1 | 2 | 3
  fields: SchemaFieldDef[]
}

export interface EntitySection {
  title?: string
  subtitle?: string
  cols?: 1 | 2 | 3
  fields: SchemaFieldDef[]
  groups?: EntityFieldGroup[]
}

export interface EntityFormRenderState {
  values: Record<string, any>
  loading: boolean
  errors: FieldErrors<any>
  options: Record<string, FieldOption[]>
}

export interface EntityFormPageProps<
  T extends Record<string, any> = Record<string, any>,
> {
  title: string
  subtitle?: string
  sections: EntitySection[]
  initial?: T
  submitLabel?: string
  busyLabel?: string
  cancelLabel?: string
  closeTo: string
  modal?: boolean
  tabs?: WizardTab[]
  tab?: string
  onTab?: (id: string) => void
  path?: string | ((values: T) => string)
  method?: "POST" | "PUT" | "PATCH"
  buildBody?: (values: T) => Record<string, any>
  submit?: (values: T) => Promise<any>
  onSaved: (result: any, values: T) => void
  extraActions?: ReactNode
  children?: ReactNode
  renderExtra?: (state: EntityFormRenderState) => ReactNode
  disabled?: boolean
  confirmDiscard?: boolean
  disableWhileLoading?: boolean
}

function fallbackValue(field: SchemaFieldDef): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue
  if (field.type === "checkbox" || field.type === "toggle") return false
  if (field.type === "checklist") return []
  return ""
}

function deriveSeed<T extends Record<string, any>>(
  fields: SchemaFieldDef[],
  initial?: T,
): T {
  const seed: Record<string, unknown> = {}
  for (const field of fields) seed[field.key] = fallbackValue(field)
  return { ...seed, ...(initial ?? {}) } as T
}

function useSeed<T extends Record<string, any>>(
  fields: SchemaFieldDef[],
  initial?: T,
): T {
  const ref = useRef<T | null>(null)
  if (ref.current === null) ref.current = deriveSeed(fields, initial)
  return ref.current
}

function defaultBody(
  fields: SchemaFieldDef[],
  values: Record<string, any>,
): Record<string, any> {
  const body: Record<string, any> = {}
  for (const field of fields) {
    if (field.type === "file") continue
    const parsed = parseFieldValue(field, values[field.key])
    if (parsed === undefined) continue
    body[field.key] = parsed
  }
  return body
}

function labelOf(fields: SchemaFieldDef[], key: string): string {
  for (const field of fields) if (field.key === key) return field.label
  return key
}

export function EntityFormPage<T extends Record<string, any>>(
  props: EntityFormPageProps<T>,
): JSX.Element {
  const {
    title,
    subtitle,
    sections,
    initial,
    submitLabel,
    busyLabel,
    cancelLabel,
    closeTo,
    modal,
    tabs,
    tab,
    onTab,
    path,
    method,
    buildBody,
    submit,
    onSaved,
    extraActions,
    children,
    renderExtra,
    disabled,
    confirmDiscard = true,
    disableWhileLoading = false,
  } = props
  const navigate = useNavigate()
  const confirm = useConfirm()

  const allFields = useMemo(() => {
    const out: SchemaFieldDef[] = []
    for (const section of sections) {
      out.push(...section.fields)
      for (const group of section.groups ?? []) out.push(...group.fields)
    }
    return out
  }, [sections])

  const form = useFormState<T>(useSeed(allFields, initial))

  const { optionsByKey, loadingKeys, errorKeys, reload } = useSchemaOptions(
    allFields,
    form.values,
    (key) => form.set(key as keyof T, "" as T[keyof T]),
  )

  const { validate } = useSchemaValidation(allFields, form)

  async function save() {
    form.setError(null)
    if (!validate()) return
    form.setBusy(true)
    const values = form.values
    try {
      const result = submit
        ? await submit(values)
        : await api(typeof path === "function" ? path(values) : (path ?? ""), {
            method: method ?? "POST",
            body: buildBody ? buildBody(values) : defaultBody(allFields, values),
          })
      onSaved(result, values)
    } catch (e) {
      form.setError(e instanceof Error ? e.message : String(e))
    } finally {
      form.setBusy(false)
    }
  }

  async function handleDismiss() {
    if (confirmDiscard && form.dirty) {
      const ok = await confirm({
        title: "Unsaved changes",
        description:
          "You have unsaved changes. Are you sure you want to leave this form?",
        variant: "primary",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
      })
      if (!ok) return
    }
    navigate(closeTo)
  }

  const failedOptions = Object.keys(errorKeys).filter(
    (key) => errorKeys[key] !== "",
  )
  const optionsLoading = loadingKeys.length > 0
  const firstLoad = loadingKeys.some(
    (key) => !(key in optionsByKey) && !errorKeys[key],
  )

  return (
    <WizardShell
      title={title}
      tabs={tabs ?? []}
      tab={tab ?? ""}
      onTab={onTab ?? (() => {})}
      modal={modal}
      onClose={handleDismiss}
      closeTo={closeTo}
      footer={
        <FormActions
          onCancel={handleDismiss}
          onSubmit={save}
          busy={form.busy}
          disabled={disabled || (disableWhileLoading && optionsLoading)}
          submitLabel={submitLabel ?? "Create"}
          busyLabel={busyLabel}
          cancelLabel={cancelLabel}
          extra={extraActions}
        />
      }
    >
      {form.error ? <Alert>{form.error}</Alert> : null}
      {failedOptions.length > 0 ? (
        <Alert variant="info">
          <div>
            Could not load options for{" "}
            {failedOptions.map((key) => labelOf(allFields, key)).join(", ")}.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {failedOptions.map((key) => (
              <button
                key={key}
                type="button"
                className="btn btn-secondary"
                onClick={() => reload(key)}
              >
                Retry {labelOf(allFields, key)}
              </button>
            ))}
          </div>
        </Alert>
      ) : null}
      {modal ? null : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          {subtitle ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--fg-subtle)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      )}
      {firstLoad ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {sections.map((section, index) => (
        <SchemaSection
          key={index}
          title={section.title}
          subtitle={section.subtitle}
          cols={section.cols}
          fields={section.fields}
          groups={section.groups}
          values={form.values}
          errors={form.fieldErrors}
          optionsByKey={optionsByKey}
          allOptionsByKey={optionsByKey}
          loadingKeys={loadingKeys}
          onChange={(key, value) => form.set(key as keyof T, value)}
        />
      ))}
      {renderExtra
        ? renderExtra({
            values: form.values,
            loading: optionsLoading,
            errors: form.fieldErrors,
            options: optionsByKey,
          })
        : children}
    </WizardShell>
  )
}
