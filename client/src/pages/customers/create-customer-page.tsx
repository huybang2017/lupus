import { useNavigate } from "react-router-dom"
import { requiredText } from "@/widgets/form"
import type { SchemaFieldDef } from "@/widgets/form"
import { EntityFormPage } from "@/pages/resource/entity-form-page"
import type { EntitySection } from "@/pages/resource/entity-form-page"

const EMAIL_REQUIRED = "Email is required."
const EMAIL_FORMAT = "Enter a valid email address."

const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i

function emailError(v: unknown): string | undefined {
  const value = `${v}`.trim()
  const blank = requiredText(value, EMAIL_REQUIRED)
  if (blank) return blank
  return EMAIL_PATTERN.test(value) ? undefined : EMAIL_FORMAT
}

const FIELDS: SchemaFieldDef[] = [
  { key: "first_name", label: "First Name", type: "text", optional: true },
  { key: "last_name", label: "Last Name", type: "text", optional: true },
  {
    key: "email",
    label: "Email",
    type: "text",
    required: true,
    inputType: "email",
    validate: emailError,
  },
  { key: "company_name", label: "Company", type: "text", optional: true },
  { key: "phone", label: "Phone", type: "text", optional: true },
]

const SECTIONS: EntitySection[] = [{ cols: 2, fields: FIELDS }]

function trimmed(values: Record<string, any>, key: string): string {
  return String(values[key] ?? "").trim()
}

function buildBody(values: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = { email: trimmed(values, "email") }
  const firstName = trimmed(values, "first_name")
  if (firstName) body.first_name = firstName
  const lastName = trimmed(values, "last_name")
  if (lastName) body.last_name = lastName
  const company = trimmed(values, "company_name")
  if (company) body.company_name = company
  const phone = trimmed(values, "phone")
  if (phone) body.phone = phone
  return body
}

export function CreateCustomerPage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Customer"
      subtitle="Create a new customer and manage their details."
      sections={SECTIONS}
      submitLabel="Create"
      closeTo="/r/customers"
      tabs={[{ id: "details", label: "Details" }]}
      tab="details"
      confirmDiscard={false}
      path="/admin/customers"
      buildBody={buildBody}
      onSaved={(res) => {
        navigate(`/r/customers/${res.customer.id}`)
      }}
    />
  )
}
