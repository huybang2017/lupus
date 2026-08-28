import { useNavigate } from "react-router-dom"
import { api } from "@/shared/api/client"
import { parseList } from "@/shared/api/list"
import { minNumber, requiredNumber, requiredText } from "@/widgets/form"
import type { FieldOption, SchemaFieldDef } from "@/widgets/form"
import { EntityFormPage } from "@/pages/resource/entity-form-page"
import type { EntitySection } from "@/pages/resource/entity-form-page"

const AMOUNT_ERROR = "Amount must be zero or positive."

const ORDERS_PATH = "/admin/orders?limit=100&offset=0"

function orderRows(): Promise<any[]> {
  return api(ORDERS_PATH).then((d) => parseList(d, 200).items)
}

function loadOrderOptions(): Promise<FieldOption[]> {
  return orderRows().then((rows) =>
    rows.slice(0, 200).map((o: any) => ({
      value: o.id,
      label: `#${o.display_id ?? o.id}`,
      sub: `${o.email ?? "–"} — ${o.total ?? "?"} ${o.currency_code ?? ""}`,
    })),
  )
}

const SUB_SEP = " — "

function totalFor(
  options: FieldOption[],
  orderId: unknown,
): string | undefined {
  const match = options.find((o) => String(o.value) === String(orderId ?? ""))
  const sub = match?.sub
  if (sub === undefined) return undefined
  const cut = sub.lastIndexOf(SUB_SEP)
  return cut >= 0 ? sub.slice(cut + SUB_SEP.length) : sub
}

const FIELDS: SchemaFieldDef[] = [
  {
    key: "order_id",
    label: "Order",
    type: "select",
    required: true,
    searchable: true,
    searchPlaceholder: "Filter orders…",
    placeholder: (_values, options) =>
      options.length > 0 ? `Select order (${options.length})` : "Select order",
    validate: (v) => requiredText(v, "Choose an order."),
    loadOptions: loadOrderOptions,
  },
  {
    key: "amount",
    label: "Amount (minor units)",
    type: "number",
    optional: true,
    min: 0,
    maxWidth: 220,
    hint: (values, _options, allOptions) => {
      const total = totalFor(allOptions.order_id ?? [], values.order_id)
      if (total === undefined) return "Defaults to the order total."
      return `Order total: ${total}`
    },
    validate: (v) => {
      if (v === "" || v === null || v === undefined) return undefined
      return (
        minNumber(Math.round(Number(v)), 0, AMOUNT_ERROR) ??
        requiredNumber(Math.round(Number(v)), AMOUNT_ERROR)
      )
    },
  },
]

const SECTIONS: EntitySection[] = [
  {
    title: "Create Payment Collection",
    subtitle:
      "A collection tracks payment for one order. Amount defaults to the order total.",
    fields: FIELDS,
  },
]

function buildBody(values: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = { order_id: values.order_id }
  if (String(values.amount ?? "").trim() !== "") {
    body.amount = Math.round(Number(values.amount))
  }
  return body
}

export function CreatePaymentCollectionPage() {
  const navigate = useNavigate()

  return (
    <EntityFormPage
      title="Create Payment Collection"
      sections={SECTIONS}
      submitLabel="Create"
      closeTo="/settings/payment-collections"
      modal
      disableWhileLoading
      path="/admin/payment-collections"
      buildBody={buildBody}
      onSaved={(res) => {
        navigate(`/r/payment-collections/${res.payment_collection.id}`)
      }}
    />
  )
}
