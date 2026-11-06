import { Heading, Text } from "@/widgets/common/ui"

import InteractiveLink from "@/widgets/common/interactive-link"

const EmptyCartMessage = () => {
  return (
    <div className="my-12 flex min-h-[50vh] flex-col items-start justify-center rounded-2xl border border-brand-gold/40 bg-brand-paper px-6 py-20 shadow-book sm:px-12" data-testid="empty-cart-message">
      <Heading
        level="h1"
        className="font-editorial flex flex-row text-3xl-regular gap-x-2 items-baseline text-brand-ink"
      >
        Giỏ sách của bạn
      </Heading>
      <Text className="text-base-regular mt-4 mb-6 max-w-[32rem] text-brand-ink/70">
        Giỏ sách đang trống. Hãy khám phá những tựa sách phù hợp và bắt đầu
        hành trình đọc tiếp theo của bạn.
      </Text>
      <div>
        <InteractiveLink href="/store">Khám phá tủ sách</InteractiveLink>
      </div>
    </div>
  )
}

export default EmptyCartMessage
