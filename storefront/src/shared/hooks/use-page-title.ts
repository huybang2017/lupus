import { useEffect } from "react"

// Stand-in for the starter's generateMetadata / metadata exports
export function usePageTitle(title: string | undefined, description?: string) {
  useEffect(() => {
    if (title) {
      document.title = title
    }
    if (description) {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
      if (!meta) {
        meta = document.createElement("meta")
        meta.name = "description"
        document.head.appendChild(meta)
      }
      meta.content = description
    }
  }, [title, description])
}
