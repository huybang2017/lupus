import { useParams } from "react-router-dom"
import { usePageTitle } from "@/shared/hooks/use-page-title"
import { Heading, Text } from "@/widgets/common/ui"
import TransferActions from "@/widgets/order/transfer-actions"
import TransferImage from "@/widgets/order/transfer-image"

export function TransferPage() {
  const { id = "", token = "" } = useParams()
  usePageTitle("Chuyển giao đơn hàng")

  return (
    <div className="mx-auto my-12 flex w-[calc(100%_-_3rem)] max-w-2xl flex-col items-start gap-y-5 rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 text-brand-ink shadow-sm small:p-10">
      <TransferImage />
      <div className="flex flex-col gap-y-5">
        <Heading level="h1" className="font-serif text-2xl text-brand-forest">
          Yêu cầu chuyển giao đơn hàng {id}
        </Heading>
        <Text className="text-brand-ink/70">
          Bạn nhận được yêu cầu chuyển quyền sở hữu đơn hàng ({id}). Nếu đồng ý, hãy xác nhận bằng nút bên dưới.
        </Text>
        <div className="h-px w-full bg-brand-gold/40" />
        <Text className="text-brand-ink/70">
          Khi bạn chấp nhận, chủ sở hữu mới sẽ tiếp nhận toàn bộ quyền và trách nhiệm liên quan đến đơn hàng này.
        </Text>
        <Text className="text-brand-ink/70">Nếu không nhận ra yêu cầu này hoặc muốn giữ quyền sở hữu, bạn có thể từ chối chuyển giao.</Text>
        <div className="h-px w-full bg-brand-gold/40" />
        <TransferActions id={id} token={token} />
      </div>
    </div>
  )
}
