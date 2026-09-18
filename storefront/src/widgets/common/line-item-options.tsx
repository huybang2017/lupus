import { HttpTypes } from "@/shared/types/http"
import { Text } from "@/widgets/common/ui"

type LineItemOptionsProps = {
  variant: HttpTypes.StoreProductVariant | null | undefined
  "data-testid"?: string
  "data-value"?: HttpTypes.StoreProductVariant | null
}

const LineItemOptions = ({
  variant,
  "data-testid": dataTestid,
  "data-value": dataValue,
}: LineItemOptionsProps) => {
  return (
    <Text
      data-testid={dataTestid}
      data-value={dataValue}
      className="inline-block txt-medium text-ui-fg-subtle w-full overflow-hidden text-ellipsis"
    >
      Variant: {variant?.title}
    </Text>
  )
}

export default LineItemOptions
