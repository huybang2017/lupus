import { useNavigate } from "react-router-dom"
import { api } from "@/shared/api/client"
import { parseList } from "@/shared/api/list"
import { COUNTRIES } from "@/shared/i18n/countries"
import { minNumber, requiredNumber, requiredText } from "@/widgets/form"
import type { FieldDef } from "@/widgets/form"
import { EntityFormPage } from "@/pages/resource/entity-form-page"
import type { EntitySection } from "@/pages/resource/entity-form-page"

const RATE_MESSAGE = "Rate must be a positive number."
const RATE_PAIR_MESSAGE = "Enter both a name and a code to add a default tax rate."

function text(values: Record<string, any>, key: string): string {
  return `${values[key] ?? ""}`.trim()
}

function rateFieldError(v: unknown, values: Record<string, any>): string | undefined {
  if (text(values, "name") !== "") return undefined
  if (text(values, "code") !== "") return undefined
  if (text(values, "rate") !== "") return RATE_PAIR_MESSAGE
  return requiredText(v, "Required")
}

const REGION_FIELDS: FieldDef[] = [
  {
    key: "country_code",
    label: "Country",
    type: "select",
    required: true,
    options: COUNTRIES.map((c) => ({ value: c.id, label: c.label })),
    placeholder: "Select country",
    searchable: true,
    searchPlaceholder: "Filter countries…",
    hint: "Choose country",
    validate: (v) => requiredText(v, "Required"),
  },
  {
    key: "provider_id",
    label: "Tax provider",
    type: "select",
    required: true,
    placeholder: "Select tax provider",
    searchable: true,
    hint: "Choose tax provider",
    loadOptions: () =>
      api("/admin/tax-providers?limit=100&offset=0")
        .then((d) => parseList(d, 100).items)
        .then((rows: any[]) =>
          rows.map((p) => {
            const id = p?.id ?? p?.provider_id ?? "system"
            return { value: String(id), label: String(id) }
          }),
        )
        .catch(() => ({
          options: [{ value: "system", label: "system" }],
          degraded: "Showing the built-in system tax provider. Retry to load the configured providers.",
        })),
    validate: (v) => requiredText(v, "Required"),
  },
]

const DEFAULT_RATE_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "Name",
    type: "text",
    placeholder: "Enter name",
    validate: rateFieldError,
  },
  {
    key: "code",
    label: "Code",
    type: "text",
    placeholder: "Enter code",
    validate: rateFieldError,
  },
  {
    key: "rate",
    label: "Rate",
    type: "number",
    placeholder: "Enter rate",
    min: 0,
    step: 0.0001,
    maxWidth: 120,
    hint: "Percentage",
    validate: (v) => {
      if (v === "" || v === null || v === undefined) return undefined
      return minNumber(v, 0, RATE_MESSAGE) ?? requiredNumber(v, RATE_MESSAGE)
    },
  },
]

const SECTIONS: EntitySection[] = [
  { cols: 2, fields: REGION_FIELDS },
  {
    title: "Default tax rate",
    subtitle: "(optional)",
    cols: 3,
    fields: DEFAULT_RATE_FIELDS,
  },
]

function buildBody(values: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = {
    country_code: values.country_code,
    provider_id: values.provider_id,
  }
  const name = text(values, "name")
  const code = text(values, "code")
  if (name !== "" && code !== "") {
    const defaultRate: Record<string, any> = { name, code }
    const rate = text(values, "rate")
    if (rate !== "") defaultRate.rate = Number(rate)
    body.default_tax_rate = defaultRate
  }
  return body
}

export function CreateTaxRegionPage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Tax Region"
      sections={SECTIONS}
      submitLabel="Save"
      closeTo="/settings/tax-regions"
      modal
      path="/admin/tax-regions"
      buildBody={buildBody}
      onSaved={(res) => {
        const id = res?.tax_region_id ?? res?.tax_region?.id
        navigate(`/settings/tax-regions/${id}`)
      }}
    />
  )
}
