import { setAddresses } from "@/entities/cart"
import useToggleState from "@/shared/hooks/use-toggle-state"
import compareAddresses from "@/shared/utils/compare-addresses"
import { CheckCircleSolid } from "@/widgets/common/icons"
import { HttpTypes } from "@/shared/types/http"
import Divider from "@/widgets/common/divider"
import { Heading, Text } from "@/widgets/common/ui"
import Spinner from "@/widgets/common/icons/spinner"
import { usePathname, useRouter, useSearchParams } from "@/shared/navigation/router"
import { useActionState } from "react"
import BillingAddress from "@/widgets/checkout/billing-address"
import ErrorMessage from "@/widgets/checkout/error-message"
import ShippingAddress from "@/widgets/checkout/shipping-address"
import { SubmitButton } from "@/widgets/checkout/submit-button"

const Addresses = ({
  cart,
  customer,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
}) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isOpen = searchParams.get("step") === "address"

  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true
  )

  const handleEdit = () => {
    router.push(pathname + "?step=address")
  }

  const [message, formAction] = useActionState(setAddresses, null)

  return (
    <div className="rounded-2xl border border-brand-gold/35 bg-brand-paper p-5 shadow-book sm:p-7">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className="font-editorial flex flex-row text-3xl-regular gap-x-2 items-baseline text-brand-ink"
        >
          Địa chỉ giao hàng
          {!isOpen && <CheckCircleSolid className="text-brand-forest" />}
        </Heading>
        {!isOpen && cart?.shipping_address && (
          <Text>
            <button
              onClick={handleEdit}
              className="font-medium text-brand-clay hover:text-brand-clay-dark"
              data-testid="edit-address-button"
            >
              Chỉnh sửa
            </button>
          </Text>
        )}
      </div>
      {isOpen ? (
        <form action={formAction}>
          <div className="pb-8">
            <ShippingAddress
              customer={customer}
              checked={sameAsBilling}
              onChange={toggleSameAsBilling}
              cart={cart}
            />

            {!sameAsBilling && (
              <div className="mt-8 rounded-2xl border border-brand-sand bg-brand-cream/45 p-4 sm:p-6">
                <Heading
                  level="h3"
                  className="font-editorial text-2xl text-brand-ink"
                >
                  Địa chỉ xuất hóa đơn khác
                </Heading>

                <Text className="mb-6 mt-2 text-sm text-brand-ink/65">
                  Chỉ cần điền phần này khi thông tin xuất hóa đơn khác địa chỉ giao hàng.
                </Text>

                <BillingAddress cart={cart} />
              </div>
            )}
            <SubmitButton className="mt-6" data-testid="submit-address-button">
              Tiếp tục chọn giao hàng
            </SubmitButton>
            <ErrorMessage error={message} data-testid="address-error-message" />
          </div>
        </form>
      ) : (
        <div>
          <div className="text-small-regular">
            {cart && cart.shipping_address ? (
              <div className="flex items-start gap-x-8">
                <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-3">
                  <div
                    className="flex flex-col"
                    data-testid="shipping-address-summary"
                  >
                    <Text className="txt-medium-plus text-brand-ink mb-1">
                      Địa chỉ giao hàng
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.first_name}{" "}
                      {cart.shipping_address.last_name}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.address_1}{" "}
                      {cart.shipping_address.address_2}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.postal_code},{" "}
                      {cart.shipping_address.city}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.country_code?.toUpperCase()}
                    </Text>
                  </div>

                  <div
                    className="flex flex-col"
                    data-testid="shipping-contact-summary"
                  >
                    <Text className="txt-medium-plus text-brand-ink mb-1">
                      Thông tin liên hệ
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.shipping_address.phone}
                    </Text>
                    <Text className="txt-medium text-ui-fg-subtle">
                      {cart.email}
                    </Text>
                  </div>

                  <div
                    className="flex flex-col"
                    data-testid="billing-address-summary"
                  >
                    <Text className="txt-medium-plus text-brand-ink mb-1">
                      Thông tin xuất hóa đơn
                    </Text>

                    {sameAsBilling ? (
                      <Text className="txt-medium text-ui-fg-subtle">
                        Dùng địa chỉ giao hàng.
                      </Text>
                    ) : (
                      <>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.first_name}{" "}
                          {cart.billing_address?.last_name}
                        </Text>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.address_1}{" "}
                          {cart.billing_address?.address_2}
                        </Text>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.postal_code},{" "}
                          {cart.billing_address?.city}
                        </Text>
                        <Text className="txt-medium text-ui-fg-subtle">
                          {cart.billing_address?.country_code?.toUpperCase()}
                        </Text>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <Spinner />
              </div>
            )}
          </div>
        </div>
      )}
      <Divider className="mt-8 border-brand-gold/30" />
    </div>
  )
}

export default Addresses
