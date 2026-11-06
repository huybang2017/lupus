import { Checkbox, Label } from "@/widgets/common/ui"
import React from "react"

type CheckboxProps = {
  checked?: boolean
  onChange?: () => void
  label: string
  name?: string
  'data-testid'?: string
}

const CheckboxWithLabel: React.FC<CheckboxProps> = ({
  checked = true,
  onChange,
  label,
  name,
  'data-testid': dataTestId
}) => {
  const inputId = React.useId()

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        className="h-5 w-5 shrink-0 rounded border-brand-gold accent-brand-forest text-brand-forest focus:ring-brand-clay"
        id={inputId}
        checked={checked}
        onChange={onChange}
        name={name}
        data-testid={dataTestId}
      />
      <Label
        htmlFor={inputId}
        className="!transform-none cursor-pointer text-sm font-medium leading-5 text-brand-ink"
      >
        {label}
      </Label>
    </div>
  )
}

export default CheckboxWithLabel
