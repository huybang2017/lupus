
import Back from "@/widgets/common/icons/back"
import FastDelivery from "@/widgets/common/icons/fast-delivery"
import Refresh from "@/widgets/common/icons/refresh"

import Accordion from "@/widgets/products/product-tabs-accordion"
import { HttpTypes } from "@/shared/types/http"
import { getBookMetadata } from "@/shared/utils/book"

type ProductTabsProps = {
  product: HttpTypes.StoreProduct
}

const ProductTabs = ({ product }: ProductTabsProps) => {
  const tabs = [
    {
      label: "Thông tin sách",
      component: <ProductInfoTab product={product} />,
    },
    {
      label: "Giao hàng & đổi trả",
      component: <ShippingInfoTab />,
    },
  ]

  return (
    <div className="w-full">
      <Accordion type="multiple">
        {tabs.map((tab, i) => (
          <Accordion.Item
            key={i}
            title={tab.label}
            headingSize="medium"
            value={tab.label}
          >
            {tab.component}
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  )
}

const ProductInfoTab = ({ product }: ProductTabsProps) => {
  const { author, publisher, publicationYear, pages, isbn, languages } = getBookMetadata(product)
  const formats = product.options?.find((option) => option.title === "Định dạng")?.values?.map((value) => value.value)
  const details = [
    ["Tác giả", author],
    ["Nhà xuất bản", publisher],
    ["Năm xuất bản", publicationYear],
    ["Số trang", pages ? `${pages} trang` : undefined],
    ["ISBN", isbn],
    ["Ngôn ngữ", languages?.join(", ")],
    ["Định dạng", formats?.join(", ")],
  ].filter((detail): detail is string[] => Boolean(detail[1]))

  return (
    <div className="py-6 text-sm">
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-brand-sand/70 py-3 sm:block">
            <span className="font-semibold text-brand-forest">{label}</span>
            <p className="mt-1 text-right text-brand-ink/60 sm:text-left">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const ShippingInfoTab = () => {
  return (
    <div className="py-6 text-sm">
      <div className="grid grid-cols-1 gap-y-8">
        <div className="flex items-start gap-x-2">
          <FastDelivery />
          <div>
            <span className="font-semibold text-brand-forest">Giao hàng nhanh</span>
            <p className="mt-1 max-w-sm text-brand-ink/60">
              Đơn sách được đóng gói cẩn thận. Thời gian và chi phí giao hàng sẽ hiển thị theo địa chỉ của bạn ở bước thanh toán.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Refresh />
          <div>
            <span className="font-semibold text-brand-forest">Đổi sách đơn giản</span>
            <p className="mt-1 max-w-sm text-brand-ink/60">
              Nếu sách giao sai hoặc có lỗi từ nhà xuất bản, chúng mình sẽ hỗ trợ đổi cuốn mới.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Back />
          <div>
            <span className="font-semibold text-brand-forest">Đổi trả thuận tiện</span>
            <p className="mt-1 max-w-sm text-brand-ink/60">
              Nếu sách bị lỗi hoặc giao không đúng, hãy liên hệ bộ phận vận hành để được kiểm tra điều kiện và hướng dẫn xử lý.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductTabs
