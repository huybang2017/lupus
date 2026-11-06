import { Container } from "@/widgets/common/ui"

import ChevronDown from "@/widgets/common/icons/chevron-down"
import LocalizedClientLink from "@/widgets/common/localized-client-link"
import { convertToLocale } from "@/shared/formatting/money"
import { HttpTypes } from "@/shared/types/http"

type OverviewProps = {
  customer: HttpTypes.StoreCustomer | null
  orders: HttpTypes.StoreOrder[] | null
}

const Overview = ({ customer, orders }: OverviewProps) => {
  return (
    <div className="text-brand-ink" data-testid="overview-page-wrapper">
      <div className="hidden small:block">
        <div className="mb-4 flex items-center justify-between">
          <span data-testid="welcome-message" data-value={customer?.first_name}>
            <span className="font-serif text-3xl font-semibold text-brand-forest">Xin chào, {customer?.first_name}</span>
          </span>
          <span className="text-small-regular text-brand-ink/65">
            Đang đăng nhập với:{" "}
            <span
              className="font-semibold"
              data-testid="customer-email"
              data-value={customer?.email}
            >
              {customer?.email}
            </span>
          </span>
        </div>
        <div className="flex flex-col border-t border-brand-gold/40 py-8">
          <div className="flex flex-col gap-y-4 h-full col-span-1 row-span-2 flex-1">
            <div className="flex items-start gap-x-16 mb-6">
              <div className="flex flex-col gap-y-4">
                <h3 className="font-serif text-xl font-semibold text-brand-forest">Hồ sơ</h3>
                <div className="flex items-end gap-x-2">
                  <span
                    className="text-3xl-semi leading-none"
                    data-testid="customer-profile-completion"
                    data-value={getProfileCompletion(customer)}
                  >
                    {getProfileCompletion(customer)}%
                  </span>
                  <span className="uppercase text-base-regular text-ui-fg-subtle">
                    Hoàn thiện
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-y-4">
                <h3 className="font-serif text-xl font-semibold text-brand-forest">Địa chỉ</h3>
                <div className="flex items-end gap-x-2">
                  <span
                    className="text-3xl-semi leading-none"
                    data-testid="addresses-count"
                    data-value={customer?.addresses?.length || 0}
                  >
                    {customer?.addresses?.length || 0}
                  </span>
                  <span className="uppercase text-base-regular text-ui-fg-subtle">
                    Đã lưu
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-y-4">
              <div className="flex items-center gap-x-2">
                <h3 className="font-serif text-xl font-semibold text-brand-forest">Đơn hàng gần đây</h3>
              </div>
              <ul
                className="flex flex-col gap-y-4"
                data-testid="orders-wrapper"
              >
                {orders && orders.length > 0 ? (
                  orders.slice(0, 5).map((order) => {
                    return (
                      <li
                        key={order.id}
                        data-testid="order-wrapper"
                        data-value={order.id}
                      >
                        <LocalizedClientLink
                          href={`/account/orders/details/${order.id}`}
                        >
                          <Container className="flex items-center justify-between border border-brand-gold/30 bg-brand-cream/70 p-4 transition-colors hover:bg-brand-cream">
                            <div className="grid grid-cols-3 grid-rows-2 text-small-regular gap-x-4 flex-1">
                              <span className="font-semibold">Ngày đặt</span>
                              <span className="font-semibold">
                                Mã đơn hàng
                              </span>
                              <span className="font-semibold">
                                Tổng tiền
                              </span>
                              <span data-testid="order-created-date">
                                {new Date(order.created_at).toLocaleDateString("vi-VN")}
                              </span>
                              <span
                                data-testid="order-id"
                                data-value={order.display_id}
                              >
                                #{order.display_id}
                              </span>
                              <span data-testid="order-amount">
                                {convertToLocale({
                                  amount: order.total,
                                  currency_code: order.currency_code,
                                })}
                              </span>
                            </div>
                            <span
                              className="flex items-center justify-between"
                              data-testid="open-order-button"
                            >
                              <span className="sr-only">
                                Xem đơn hàng #{order.display_id}
                              </span>
                              <ChevronDown className="-rotate-90" />
                            </span>
                          </Container>
                        </LocalizedClientLink>
                      </li>
                    )
                  })
                ) : (
                  <span className="text-brand-ink/60" data-testid="no-orders-message">Chưa có đơn hàng gần đây</span>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const getProfileCompletion = (customer: HttpTypes.StoreCustomer | null) => {
  let count = 0

  if (!customer) {
    return 0
  }

  if (customer.email) {
    count++
  }

  if (customer.first_name && customer.last_name) {
    count++
  }

  if (customer.phone) {
    count++
  }

  const billingAddress = customer.addresses?.find(
    (addr) => addr.is_default_billing
  )

  if (billingAddress) {
    count++
  }

  return (count / 4) * 100
}

export default Overview
