import { HttpTypes } from "@/shared/types/http"

export type BookMetadata = {
  author?: string
  publisher?: string
  publicationYear?: string
  pages?: string
  isbn?: string
  languages?: string[]
}

const asText = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }

  return undefined
}

export function getBookMetadata(product: HttpTypes.StoreProduct): BookMetadata {
  const metadata = product.metadata ?? {}
  const languages = Array.isArray(metadata.languages)
    ? metadata.languages.filter((language): language is string => typeof language === "string")
    : typeof metadata.languages === "string"
      ? [metadata.languages]
      : undefined

  return {
    author: asText(metadata.author),
    publisher: asText(metadata.publisher),
    publicationYear: asText(metadata.publication_year),
    pages: asText(metadata.pages),
    isbn: asText(metadata.isbn),
    languages,
  }
}

export function descriptionToText(description?: string | null) {
  if (!description) return ""

  return description
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
