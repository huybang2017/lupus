import { isEmpty } from "@/shared/utils/is-empty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

// The lupus Store API returns amounts in minor units (cents, or whole units for zero-decimal
// currencies like VND/JPY), so the fraction digits of the currency decide the divisor.
const digitsCache = new Map<string, number>()

function currencyDigits(currency_code: string, locale: string): number {
  const key = `${locale}|${currency_code}`
  let digits = digitsCache.get(key)
  if (digits === undefined) {
    try {
      digits = new Intl.NumberFormat(locale, { style: "currency", currency: currency_code }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      digits = 2
    }
    digitsCache.set(key, digits)
  }
  return digits
}

export const convertToLocale = ({ amount, currency_code, minimumFractionDigits, maximumFractionDigits, locale = "en-US" }: ConvertToLocaleParams) => {
  if (!currency_code || isEmpty(currency_code)) {
    return amount.toString()
  }
  const digits = currencyDigits(currency_code, locale)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency_code,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(amount / 10 ** digits)
}
