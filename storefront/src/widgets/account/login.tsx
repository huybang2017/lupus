import { login } from "@/entities/customer"
import { LOGIN_VIEW } from "@/widgets/account/login-template"
import ErrorMessage from "@/widgets/checkout/error-message"
import { SubmitButton } from "@/widgets/checkout/submit-button"
import Input from "@/widgets/common/input"
import { useActionState } from "react"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Login = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(login, null)

  return (
    <div
      className="flex w-full max-w-md flex-col items-center rounded-2xl border border-brand-gold/40 bg-brand-paper p-6 text-brand-ink shadow-sm small:p-10"
      data-testid="login-page"
    >
      <span className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-clay">Lupus Books</span>
      <h1 className="mb-4 font-serif text-3xl font-semibold text-brand-forest">Mừng bạn trở lại</h1>
      <p className="mb-8 text-center text-base-regular text-brand-ink/70">
        Đăng nhập để tiếp tục hành trình đọc và theo dõi những đơn sách của bạn.
      </p>
      {message?.state === "verification_required" && (
        <div
          className="w-full mb-6 text-center text-base-regular text-ui-fg-base bg-ui-bg-subtle border border-ui-border-base rounded-rounded p-4"
          data-testid="login-verification-message"
        >
          Chúng tôi đã gửi liên kết xác minh đến <strong>{message.email}</strong>.
          Vui lòng xác minh email rồi đăng nhập.
        </div>
      )}
      <form className="w-full" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="Email"
            name="email"
            type="email"
            title="Vui lòng nhập địa chỉ email hợp lệ."
            autoComplete="email"
            required
            data-testid="email-input"
          />
          <Input
            label="Mật khẩu"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            data-testid="password-input"
          />
        </div>
        <ErrorMessage
          error={message?.state === "error" ? message.error : null}
          data-testid="login-error-message"
        />
        <SubmitButton data-testid="sign-in-button" className="w-full mt-6">
          Đăng nhập
        </SubmitButton>
      </form>
      <span className="mt-6 text-center text-small-regular text-brand-ink/70">
        Chưa có tài khoản?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.REGISTER)}
          className="font-semibold text-brand-clay underline underline-offset-4"
          data-testid="register-button"
        >
          Đăng ký ngay
        </button>
        .
      </span>
    </div>
  )
}

export default Login
