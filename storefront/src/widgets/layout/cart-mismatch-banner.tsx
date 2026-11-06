
import { transferCart } from "@/entities/customer"
import { ExclamationCircleSolid } from "@/widgets/common/icons"
import { StoreCart, StoreCustomer } from "@/shared/types/http"
import { Button } from "@/widgets/common/ui"
import { useState } from "react"
function CartMismatchBanner(props: {
  customer: StoreCustomer
  cart: StoreCart
}) {
  const { customer, cart } = props
  const [isPending, setIsPending] = useState(false)
  const [actionText, setActionText] = useState("Thử đồng bộ lại")

  if (!customer || !!cart.customer_id) {
    return
  }

  const handleSubmit = async () => {
    try {
      setIsPending(true)
      setActionText("Đang đồng bộ...")

      await transferCart()
    } catch {
      setActionText("Thử đồng bộ lại")
      setIsPending(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 bg-[#F6E4D8] p-2 text-center text-sm text-brand-clay-dark small:gap-2 small:p-4">
      <div className="flex flex-col small:flex-row small:gap-2 gap-1 items-center">
        <span className="flex items-center gap-1">
          <ExclamationCircleSolid className="inline" />
          Giỏ sách chưa được đồng bộ với tài khoản của bạn
        </span>

        <span>·</span>

        <Button
          variant="transparent"
          className="h-auto bg-transparent p-0 text-brand-clay-dark underline underline-offset-4 hover:bg-transparent active:bg-transparent focus:bg-transparent disabled:text-brand-clay/50"
          size="medium"
          disabled={isPending}
          onClick={handleSubmit}
        >
          {actionText}
        </Button>
      </div>
    </div>
  )
}

export default CartMismatchBanner
