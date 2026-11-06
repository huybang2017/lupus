
import { useActionState } from "react"
import Input from "@/widgets/common/input"
import { LOGIN_VIEW } from "@/widgets/account/login-template"
import ErrorMessage from "@/widgets/checkout/error-message"
import { SubmitButton } from "@/widgets/checkout/submit-button"
import { signup } from "@/entities/customer"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(signup, null)

  return (
    <div
      className="flex w-full max-w-md flex-col items-center rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 text-brand-ink shadow-sm small:p-10"
      data-testid="register-page"
    >
      <span className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-clay">Lupus Books</span>
      <h1 className="mb-4 text-center font-serif text-3xl font-semibold text-brand-forest">
        Trở thành thành viên Lupus Books
      </h1>
      <p className="mb-6 text-center text-base-regular text-brand-ink/70">
        Tạo tài khoản để lưu địa chỉ, theo dõi đơn hàng và khám phá sách thuận tiện hơn.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-4 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="register-verification-message"
        >
          Chúng tôi đã gửi liên kết xác minh đến <strong>{message.email}</strong>.
          Vui lòng kiểm tra hộp thư, xác minh email rồi đăng nhập.
        </div>
      )}
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Tên"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="Họ"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="Số điện thoại"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label="Mật khẩu"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="register-error"
        />
        <span className="mt-6 text-center text-small-regular text-brand-ink/70">
          Thông tin bạn cung cấp được dùng để tạo tài khoản, xử lý đơn hàng và hỗ trợ quá trình mua sách.
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          Tạo tài khoản
        </SubmitButton>
      </form>
      <span className="mt-6 text-center text-small-regular text-brand-ink/70">
        Đã có tài khoản?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="font-semibold text-brand-clay underline underline-offset-4"
        >
          Đăng nhập
        </button>
        .
      </span>
    </div>
  )
}

export default Register
