import { useParams } from "react-router-dom"
import { acceptTransferRequest } from "@/entities/orders"
import { useAsync } from "@/shared/hooks/use-async"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { Heading, Text } from "@/widgets/common/ui"
import TransferImage from "@/widgets/order/transfer-image"
import { PageLoading } from "@/widgets/common/page-state"

export function TransferAcceptPage() {
  const { id = "", token = "" } = useParams()
  usePageTitle("Chuyển giao đơn hàng")

  const { data, loading } = useAsync(() => acceptTransferRequest(id, token), [id, token])

  if (loading || !data) {
    return <PageLoading message="Đang xác nhận chuyển giao đơn hàng…" />
  }
  const { success, error } = data

  return (
    <div className="mx-auto my-12 flex w-[calc(100%_-_3rem)] max-w-2xl flex-col items-start gap-y-5 rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 text-brand-ink shadow-sm small:p-10">
      <TransferImage />
      <div className="flex flex-col gap-y-5">
        {success && (
          <>
            <Heading level="h1" className="font-serif text-2xl text-brand-forest">
              Chuyển giao đơn hàng thành công!
            </Heading>
            <Text className="text-brand-ink/70">Đơn hàng {id} đã được chuyển cho chủ sở hữu mới.</Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-brand-ink/70">Không thể chấp nhận yêu cầu chuyển giao. Vui lòng thử lại.</Text>
            {error && <Text className="text-red-600">Chi tiết lỗi: {error}</Text>}
          </>
        )}
      </div>
    </div>
  )
}
