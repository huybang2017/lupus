import { Heading, Text } from "@/widgets/common/ui"
import LocalizedClientLink from "@/widgets/common/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-xl bg-brand-cream/70 p-4 sm:flex-row sm:items-center">
      <div>
        <Heading level="h2" className="font-editorial txt-xlarge text-brand-ink">
          Bạn đã có tài khoản?
        </Heading>
        <Text className="txt-medium text-brand-ink/65 mt-2">
          Đăng nhập để thanh toán nhanh hơn và theo dõi đơn sách dễ dàng.
        </Text>
      </div>
      <div>
        <LocalizedClientLink
          href="/account"
          className="inline-flex h-10 items-center justify-center rounded-full border border-brand-forest/30 bg-brand-paper px-5 text-sm font-semibold text-brand-forest transition-colors hover:border-brand-forest hover:bg-brand-mist"
          data-testid="sign-in-button"
        >
          Đăng nhập
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SignInPrompt
