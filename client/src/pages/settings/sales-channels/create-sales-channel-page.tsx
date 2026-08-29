import { useNavigate } from "react-router-dom"
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
    key: "description",
    label: "Description",
    type: "textarea",
    required: true,
    rows: 4,
    validate: (v) => requiredText(`${v}`.trim(), "Description is required."),
  },
  {
    key: "enabled",
    label: "Enabled",
    type: "toggle",
    defaultValue: true,
    hint: "Customers can purchase through this channel when enabled.",
  },
]

const SECTIONS: EntitySection[] = [
  {
    title: "Create Sales Channel",
    subtitle: "Create a new sales channel to sell products through.",
    fields: FIELDS,
  },
]

function buildBody(values: Record<string, any>): Record<string, any> {
  return {
    name: `${values.name}`.trim(),
    description: `${values.description}`.trim(),
    is_disabled: !values.enabled,
  }
}

export function CreateSalesChannelPage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Sales Channel"
      sections={SECTIONS}
      submitLabel="Create"
      closeTo="/settings/sales-channels"
      modal
      path="/admin/sales-channels"
      buildBody={buildBody}
      onSaved={(res) => {
        navigate(`/settings/sales-channels/${res.sales_channel.id}`)
      }}
    />
  )
}
