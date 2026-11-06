import { useParams } from "react-router-dom"
import { declineTransferRequest } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { Heading, Text } from "@/widgets/common/ui"
import TransferImage from "@/widgets/order/transfer-image"
import { PageLoading } from "@/widgets/common/page-state"

export function TransferDeclinePage() {
  const { id = "", token = "" } = useParams()
  usePageTitle("Chuyển giao đơn hàng")

  const { data, loading } = useAsync(() => declineTransferRequest(id, token), [id, token])

  if (loading || !data) {
    return <PageLoading message="Đang xử lý yêu cầu chuyển giao…" />
  }
  const { success, error } = data

  return (
    <div className="mx-auto my-12 flex w-[calc(100%_-_3rem)] max-w-2xl flex-col items-start gap-y-5 rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 text-brand-ink shadow-sm small:p-10">
      <TransferImage />
      <div className="flex flex-col gap-y-5">
        {success && (
          <>
            <Heading level="h1" className="font-serif text-2xl text-brand-forest">
              Đã từ chối chuyển giao đơn hàng
            </Heading>
            <Text className="text-brand-ink/70">Yêu cầu chuyển giao đơn hàng {id} đã được từ chối.</Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-brand-ink/70">Không thể từ chối yêu cầu chuyển giao. Vui lòng thử lại.</Text>
            {error && <Text className="text-red-600">Chi tiết lỗi: {error}</Text>}
          </>
        )}
      </div>
    </div>
  )
}
