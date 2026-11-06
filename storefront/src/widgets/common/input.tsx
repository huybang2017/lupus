import { Label } from "@/widgets/common/ui"
import React, { useEffect, useImperativeHandle, useState } from "react"

import Eye from "@/widgets/common/icons/eye"
import EyeOff from "@/widgets/common/icons/eye-off"

type InputProps = Omit<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
  "placeholder"
> & {
  label: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
  name: string
  topLabel?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type, name, label, touched: _touched, required, topLabel, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const inputId = props.id ?? name
    const [showPassword, setShowPassword] = useState(false)
    const [inputType, setInputType] = useState(type)

    useEffect(() => {
      if (type === "password" && showPassword) {
        setInputType("text")
      }

      if (type === "password" && !showPassword) {
        setInputType("password")
      }
    }, [type, showPassword])

    useImperativeHandle(ref, () => inputRef.current!)

    return (
      <div className="flex flex-col w-full">
        {topLabel && (
          <Label htmlFor={inputId} className="mb-2 txt-compact-medium-plus">{topLabel}</Label>
        )}
        <div className="field-shell relative z-0 flex w-full txt-compact-medium">
          <input
            type={inputType}
            name={name}
            id={inputId}
            placeholder=" "
            required={required}
            className="field-control peer mt-0 block h-12 w-full appearance-none rounded-[inherit] border-0 bg-transparent px-4 pb-1 pt-4 text-brand-ink placeholder:text-transparent disabled:cursor-not-allowed disabled:opacity-55"
            {...props}
            ref={inputRef}
          />
          <label
            htmlFor={inputId}
            className="pointer-events-none absolute top-3.5 mx-3 flex origin-0 items-center justify-center px-1 text-brand-ink/50 transition-[color,font-size,transform] duration-200 peer-focus:text-brand-forest"
          >
            {label}
            {required && <span className="text-rose-500">*</span>}
          </label>
          {type === "password" && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-1 right-1 rounded-lg px-3 text-brand-ink/65 transition-colors duration-150 hover:bg-brand-mist hover:text-brand-forest focus-visible:bg-brand-mist focus-visible:text-brand-forest focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <Eye /> : <EyeOff />}
            </button>
          )}
        </div>
      </div>
    )
  }
)

Input.displayName = "Input"

export default Input
