import { useNavigate } from "react-router-dom"
import { api } from "@/shared/api/client"
import { parseList } from "@/shared/api/list"
import { minNumber, requiredNumber, requiredText } from "@/widgets/form"
import type { SchemaFieldDef } from "@/widgets/form"
import { EntityFormPage } from "@/pages/resource/entity-form-page"
import type { EntitySection } from "@/pages/resource/entity-form-page"

const RATE_ERROR = "Rate must be zero or positive."
const RATE_REQUIRED = "Rate is required."

const REGION_FIELDS: SchemaFieldDef[] = [
  {
    key: "tax_region_id",
    label: "Tax region",
    type: "select",
    required: true,
    placeholder: "Select region",
    searchable: true,
    validate: (v) => requiredText(v, "Choose a tax region."),
    loadOptions: () =>
      api("/admin/tax-regions?limit=100&offset=0")
        .then((d) => parseList(d, 200).items)
        .then((rows: any[]) =>
          rows.map((r: any) => ({
            value: r.id,
            label: `${r.country_code ?? r.id}${r.province_code ? ` / ${r.province_code}` : ""}`,
          })),
        ),
  },
]

const RATE_FIELDS: SchemaFieldDef[] = [
  {
    key: "code",
    label: "Code",
    type: "text",
    required: true,
    placeholder: "VAT-REDUCED",
    validate: (v) => requiredText(`${v}`.trim(), "Code is required."),
  },
  {
    key: "name",
    label: "Name",
    type: "text",
    required: true,
    placeholder: "Reduced VAT",
    validate: (v) => requiredText(`${v}`.trim(), "Name is required."),
  },
]

const OPTION_FIELDS: SchemaFieldDef[] = [
  {
    key: "rate",
    label: "Rate (%)",
    type: "number",
    required: true,
    min: 0,
    maxWidth: 200,
    validate: (v) => {
      const blank = requiredText(v, RATE_REQUIRED)
      if (blank) return blank
      return minNumber(v, 0, RATE_ERROR) ?? requiredNumber(v, RATE_ERROR)
    },
  },
  {
    key: "is_default",
    label: "Default rate",
    type: "toggle",
    hint: "Replace the region's current default rate.",
  },
  {
    key: "is_combinable",
    label: "Combinable",
    type: "toggle",
    hint: "Allow this rate to combine with other rates.",
    style: { marginTop: 12 },
  },
]

const SECTIONS: EntitySection[] = [
  {
    fields: [],
    groups: [
      { cols: 1, fields: REGION_FIELDS },
      { cols: 2, fields: RATE_FIELDS },
      { cols: 1, fields: OPTION_FIELDS },
    ],
  },
]

function buildBody(values: Record<string, any>): Record<string, any> {
  return {
    tax_region_id: values.tax_region_id,
    code: `${values.code}`.trim(),
    name: `${values.name}`.trim(),
    rate: Number(values.rate),
    is_default: !!values.is_default,
    is_combinable: !!values.is_combinable,
  }
}

export function CreateTaxRatePage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Tax Rate"
      sections={SECTIONS}
      submitLabel="Create"
      closeTo="/settings/tax-rates"
      modal
      disableWhileLoading
      path="/admin/tax-rates"
      buildBody={buildBody}
      onSaved={(res) => {
        navigate(`/settings/tax-rates/${res.tax_rate.id}`)
      }}
    />
  )
}
