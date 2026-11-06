import { Heading } from "@/widgets/common/ui"
import React from "react"

const Help = () => {
  return (
    <div className="mt-6 rounded-xl bg-brand-cream/70 p-5 text-brand-ink">
      <Heading className="font-serif text-lg font-semibold text-brand-forest">Bạn cần hỗ trợ?</Heading>
      <div className="text-base-regular my-2">
        <ul className="gap-y-2 flex flex-col">
          <li>Đối chiếu mã đơn hàng trước khi yêu cầu hỗ trợ.</li>
          <li>Với sách lỗi hoặc giao sai, hãy gửi thông tin cho bộ phận vận hành cửa hàng.</li>
        </ul>
      </div>
    </div>
  )
}

export default Help
