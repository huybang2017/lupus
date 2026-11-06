import { Label, RadioGroup, Text, clx } from "@/widgets/common/ui"
type FilterRadioGroupProps = {
  title: string
  items: {
    value: string
    label: string
  }[]
  value: string
  handleChange: (value: string) => void
  "data-testid"?: string
}

const FilterRadioGroup = ({
  title,
  items,
  value,
  handleChange,
  "data-testid": dataTestId,
}: FilterRadioGroupProps) => {
  return (
    <div className="flex flex-col gap-y-3">
      <Text className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-ink/50">{title}</Text>
      <RadioGroup className="gap-1" data-testid={dataTestId}>
        {items?.map((i) => (
          <div
            key={i.value}
            className="relative flex items-center"
          >
            <RadioGroup.Item
              checked={i.value === value}
              onChange={() => handleChange(i.value)}
              className="peer sr-only"
              id={i.value}
              value={i.value}
            />
            <Label
              htmlFor={i.value}
              className={clx(
                "w-full !transform-none cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium text-brand-ink/60 transition-colors hover:bg-brand-mist hover:text-brand-forest peer-focus-visible:ring-2 peer-focus-visible:ring-brand-clay",
                {
                  "bg-brand-mist text-brand-forest": i.value === value,
                }
              )}
              data-testid="radio-label"
              data-active={i.value === value}
            >
              <span className="flex items-center gap-2">
                <span className={clx("h-1.5 w-1.5 rounded-full bg-brand-sand", { "bg-brand-clay": i.value === value })} />
                {i.label}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}

export default FilterRadioGroup
