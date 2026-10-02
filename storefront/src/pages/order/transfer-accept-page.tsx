import { useParams } from "react-router-dom"
import { acceptTransferRequest } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { Heading, Text } from "@/widgets/common/ui"
import TransferImage from "@/widgets/order/transfer-image"

export function TransferAcceptPage() {
  const { id = "", token = "" } = useParams()
  usePageTitle("Order transfer")

  const { data } = useAsync(() => acceptTransferRequest(id, token), [id, token])

  if (!data) {
    return null
  }
  const { success, error } = data

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        {success && (
          <>
            <Heading level="h1" className="text-xl text-zinc-900">
              Order transfered!
            </Heading>
            <Text className="text-zinc-600">Order {id} has been successfully transfered to the new owner.</Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-zinc-600">There was an error accepting the transfer. Please try again.</Text>
            {error && <Text className="text-red-500">Error message: {error}</Text>}
          </>
        )}
      </div>
    </div>
  )
}