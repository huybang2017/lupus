import { useNavigate } from "react-router-dom"
import { api } from "@/shared/api/client"
import { parseList } from "@/shared/api/list"
import { toOptionList } from "@/shared/formatting/text"
import { requiredText } from "@/widgets/form"
import type { SchemaFieldDef } from "@/widgets/form"
import { EntityFormPage } from "@/pages/resource/entity-form-page"
import type { EntitySection } from "@/pages/resource/entity-form-page"

const FIELDS: SchemaFieldDef[] = [
  {
    key: "name",
    label: "Name",
    type: "text",
    required: true,
    maxWidth: 320,
    validate: (v) => requiredText(`${v}`.trim(), "Name is required."),
  },
  {
    key: "customers",
    label: "Customers",
    type: "checklist",
    hint: "Optionally add existing customers right away.",
    emptyHint: "No customers yet",
    loadOptions: () =>
      api("/admin/customers?limit=100&offset=0")
        .then((d) =>
          toOptionList(
            parseList(d, 200).items,
            (c: any) =>
              [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email,
            (c: any) => c.email,
          ),
        )
        .then((rows) =>
          rows.map((o) => ({ value: o.id, label: o.label, sub: o.sub })),
        ),
  },
]

const SECTIONS: EntitySection[] = [{ fields: FIELDS }]

async function submitGroup(values: Record<string, any>) {
  const res = await api<{ customer_group: any }>("/admin/customer-groups", {
    method: "POST",
    body: { name: `${values.name}`.trim() },
  })
  const picked = Array.isArray(values.customers) ? values.customers : []
  if (picked.length > 0) {
    await api(`/admin/customer-groups/${res.customer_group.id}/customers`, {
      method: "POST",
      body: { add: picked },
    })
  }
  return res
}

export function CreateCustomerGroupPage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Customer Group"
      subtitle="Create a new customer group to segment your customers."
      sections={SECTIONS}
      submitLabel="Create"
      closeTo="/r/customer-groups"
      tabs={[{ id: "details", label: "Details" }]}
      tab="details"
      confirmDiscard={false}
      submit={submitGroup}
      onSaved={(res) => {
        navigate(`/r/customer-groups/${res.customer_group.id}`)
      }}
    />
  )
}
