import ItemsTemplate from "@/widgets/cart/items-template"
import Summary from "@/widgets/cart/cart-summary"
import EmptyCartMessage from "@/widgets/cart/empty-cart-message"
import SignInPrompt from "@/widgets/cart/sign-in-prompt"
import Divider from "@/widgets/common/divider"
import { HttpTypes } from "@/shared/types/http"

const CartTemplate = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  return (
    <div className="min-h-[70vh] bg-brand-cream/60 py-8 small:py-12">
      <div className="content-container" data-testid="cart-container">
        {cart?.items?.length ? (
          <div className="grid grid-cols-1 gap-y-8 small:grid-cols-[1fr_360px] small:gap-x-12 medium:gap-x-20">
            <div className="flex flex-col rounded-2xl border border-brand-gold/30 bg-brand-paper p-4 gap-y-6 sm:p-6">
              {!customer && (
                <>
                  <SignInPrompt />
                  <Divider />
                </>
              )}
              <ItemsTemplate cart={cart} />
            </div>
            <div className="relative">
              <div className="flex flex-col gap-y-8 sticky top-12">
                {cart && cart.region && (
                  <>
                    <div className="py-0 small:py-6">
                      <Summary cart={cart} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default CartTemplate
