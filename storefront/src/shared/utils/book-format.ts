import { HttpTypes } from "@/shared/types/http"

const ELECTRONIC_BOOK_VALUES = new Set(["sách điện tử", "ebook", "e-book"])

export function isElectronicBookValue(value?: string | null): boolean {
  return ELECTRONIC_BOOK_VALUES.has(value?.trim().toLocaleLowerCase("vi-VN") ?? "")
}

export function isElectronicBookVariant(variant: HttpTypes.StoreProductVariant): boolean {
  return variant.options?.some((option) => isElectronicBookValue(option.value)) ?? false
}
