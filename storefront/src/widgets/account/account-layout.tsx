import React from "react"

import AccountNav from "@/widgets/account/account-nav"
import { HttpTypes } from "@/shared/types/http"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({
  customer,
  children,
}) => {
  return (
    <div className="flex-1 bg-brand-cream small:py-12" data-testid="account-page">
      <div className="content-container mx-auto flex h-full max-w-5xl flex-1 flex-col rounded-2xl bg-brand-paper px-6 shadow-sm small:px-10">
        <div
          className={`grid grid-cols-1 py-10 small:py-12 ${
            customer ? "small:grid-cols-[240px_minmax(0,1fr)] small:gap-x-10" : ""
          }`}
        >
          {customer && (
            <div>
              <AccountNav customer={customer} />
            </div>
          )}
          <div className="min-w-0 flex-1">{children}</div>
        </div>
        <div className="flex flex-col items-start justify-between gap-8 border-t border-brand-gold/40 py-10 small:flex-row small:items-end">
          <div>
            <h3 className="mb-3 font-serif text-2xl font-semibold text-brand-forest">Bạn cần hỗ trợ?</h3>
            <span className="txt-medium text-brand-ink/70">
              Các câu hỏi thường gặp và hướng dẫn mua sách luôn sẵn có tại trang chăm sóc khách hàng.
            </span>
          </div>
          <span className="rounded-full border border-brand-gold/50 px-4 py-2 text-sm font-medium text-brand-forest">
            Hỗ trợ từ trang quản trị cửa hàng
          </span>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
