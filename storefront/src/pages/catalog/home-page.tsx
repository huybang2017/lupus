import { listCollections } from "@/entities/collections"
import { useCountryRegion } from "@/providers/region-provider"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import FeaturedProducts from "@/widgets/home/featured-products"
import Hero from "@/widgets/home/hero"

export function HomePage() {
  const { region } = useCountryRegion()
  usePageTitle("Lupus Store", "A performant frontend ecommerce starter template with React and Lupus.")

  const { data } = useAsync(() => listCollections().then(({ collections }) => collections), [])

  if (!data) {
    return null
  }

  return (
    <>
      <Hero />
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={data} region={region} />
        </ul>
      </div>
    </>
  )
}