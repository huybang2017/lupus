import { api } from "@/shared/api/client"
import type { Resource } from "@/entities/resources"
import { parseFieldValue } from "@/widgets/ui/surfaces"
import { Alert } from "@/widgets/ui/primitives"
import {
  FormDrawer,
  SchemaField,
  requiredText,
  useFormState,
} from "@/widgets/form"
import { useConfirm } from "@/widgets/confirm"
import { singular } from "@/shared/formatting/text"

export function ResourceForm({
  resource: r,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  resource: Resource
  mode: "create" | "edit"
  initial?: any
  onClose: () => void
  onSaved: () => void
}) {
  const confirm = useConfirm()

  const initialValues: Record<string, any> = {}
  for (const field of r.fields)
    initialValues[field.key] = initial?.[field.key] ?? field.defaultValue ?? ""

  const {
    values: form,
    set: setField,
    error: err,
    setError: setErr,
    busy,
    setBusy,
    validate,
    fieldErrors,
    dirty,
  } = useFormState<Record<string, any>>(initialValues)

  const rules: Record<string, (value: any) => string | undefined> = {}
  for (const field of r.fields) {
    if (field.required && field.type !== "file" && field.type !== "hidden") {
      rules[field.key] = (v) => requiredText(v, `${field.label} is required`)
    }
  }

  async function save() {
    setBusy(true)
    setErr(null)
    if (!validate(rules)) {
      setBusy(false)
      return
    }
    try {
      const body: Record<string, any> = {}
      for (const field of r.fields) {
        if (field.type === "file") continue
        body[field.key] = parseFieldValue(field, form[field.key])
      }
      if (mode === "create") {
        const path =
          typeof r.createPath === "function"
            ? r.createPath(body)
            : (r.createPath ?? "")
        await api(path, { method: "POST", body })
      } else {
        const id = initial?.id ?? ""
        const path = r.updatePath ? r.updatePath(id) : ""
        await api(path, { method: "POST", body })
      }
      onSaved()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function requestClose() {
    if (
      dirty &&
      !(await confirm({
        title: "Unsaved changes",
        description:
          "You have unsaved changes. Are you sure you want to discard them?",
        variant: "primary",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      }))
    )
      return
    onClose()
  }

  const singularName = singular(r.label)
  return (
    <FormDrawer
      confirmDiscard={false}
      title={
        mode === "create" ? `Create ${singularName}` : `Edit ${singularName}`
      }
      subtitle={
        mode === "create"
          ? `Add a new ${singularName.toLowerCase()} — fields marked * are required`
          : `Update the ${singularName.toLowerCase()} details`
      }
      onClose={requestClose}
      onSubmit={save}
      busy={busy}
      submitLabel="Save"
      error={err}
    >
      {r.fields.length === 0 ? (
        <Alert variant="info">This resource has no editable fields.</Alert>
      ) : null}
      {r.fields.map((f) => (
        <SchemaField
          key={f.key}
          field={f}
          value={form[f.key]}
          error={fieldErrors[f.key]}
          onChange={(v) => setField(f.key, v)}
          formValues={form}
        />
      ))}
      {r.fields.some((f) => f.type === "file") ? (
        <Alert variant="info">File uploads are handled on the detail page.</Alert>
      ) : null}
    </FormDrawer>
  )
}
