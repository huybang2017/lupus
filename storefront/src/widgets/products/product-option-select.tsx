import { HttpTypes } from "@/shared/types/http"
import { isElectronicBookValue } from "@/shared/utils/book-format"
import { clx } from "@/widgets/common/ui"
import React from "react"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  unavailableValues?: string[]
  "data-testid"?: string
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
  unavailableValues = [],
}) => {
  const filteredOptions = [
    ...new Set((option.values ?? []).map((value) => value.value).filter((value) => !isElectronicBookValue(value))),
  ]

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm font-semibold text-brand-forest">Chọn {title.toLowerCase()}</span>
      <div
        className="flex flex-wrap justify-between gap-2"
        data-testid={dataTestId}
      >
        {filteredOptions.map((v) => {
          const unavailable = unavailableValues.includes(v)
          return (
            <button
              type="button"
              onClick={() => updateOption(option.id, v)}
              key={v}
              className={clx(
                "h-10 flex-1 rounded-xl border border-brand-sand bg-brand-cream p-2 text-small-regular text-brand-ink transition-all",
                {
                  "border-brand-forest bg-brand-mist font-semibold text-brand-forest ring-1 ring-brand-forest": v === current,
                  "hover:border-brand-moss hover:bg-brand-paper":
                    v !== current && !unavailable,
                  "cursor-not-allowed border-brand-sand/60 bg-brand-cream/40 text-brand-ink/35 line-through opacity-70": unavailable,
                }
              )}
              disabled={disabled || unavailable}
              aria-pressed={v === current}
              aria-label={unavailable ? `${v} không có với lựa chọn hiện tại` : v}
              title={unavailable ? "Không có phiên bản kết hợp với lựa chọn hiện tại" : undefined}
              data-testid="option-button"
            >
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect
