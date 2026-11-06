
import { Plus } from "@/widgets/common/icons"
import { Button, Heading } from "@/widgets/common/ui"
import { useActionState, useEffect, useState } from "react"

import { addCustomerAddress } from "@/entities/customer"
import useToggleState from "@/shared/hooks/use-toggle-state"
import { HttpTypes } from "@/shared/types/http"
import CountrySelect from "@/widgets/checkout/country-select"
import { SubmitButton } from "@/widgets/checkout/submit-button"
import Input from "@/widgets/common/input"
import Modal from "@/widgets/common/modal"

const AddAddress = ({
  region,
}: {
  region: HttpTypes.StoreRegion
  addresses: HttpTypes.StoreCustomerAddress[]
}) => {
  const [successState, setSuccessState] = useState(false)
  const { state, open, close: closeModal } = useToggleState(false)

  const [formState, formAction] = useActionState(addCustomerAddress, {
    success: false,
    error: null,
  } as { success: boolean; error: string | null })

  const close = () => {
    setSuccessState(false)
    closeModal()
  }

  useEffect(() => {
    if (successState) {
      close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successState])

  useEffect(() => {
    if (formState.success) {
      setSuccessState(true)
    }
  }, [formState])

  return (
    <>
      <button
        className="flex min-h-[220px] h-full w-full flex-col justify-between rounded-xl border border-dashed border-brand-clay/60 bg-brand-cream/60 p-5 text-left text-brand-ink transition-colors hover:border-brand-forest hover:bg-brand-cream"
        onClick={open}
        data-testid="add-address-button"
      >
        <span className="font-serif text-lg font-semibold text-brand-forest">Thêm địa chỉ mới</span>
        <Plus />
      </button>

      <Modal isOpen={state} close={close} data-testid="add-address-modal">
        <Modal.Title>
          <Heading className="mb-2 font-serif text-brand-forest">Thêm địa chỉ</Heading>
        </Modal.Title>
        <form action={formAction}>
          <Modal.Body>
            <div className="flex flex-col gap-y-2">
              <div className="grid grid-cols-2 gap-x-2">
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
              </div>
              <Input
                label="Công ty"
                name="company"
                autoComplete="organization"
                data-testid="company-input"
              />
              <Input
                label="Địa chỉ"
                name="address_1"
                required
                autoComplete="address-line1"
                data-testid="address-1-input"
              />
              <Input
                label="Căn hộ, tầng, tòa nhà (nếu có)"
                name="address_2"
                autoComplete="address-line2"
                data-testid="address-2-input"
              />
              <div className="grid grid-cols-[144px_1fr] gap-x-2">
                <Input
                  label="Mã bưu chính"
                  name="postal_code"
                  required
                  autoComplete="postal-code"
                  data-testid="postal-code-input"
                />
                <Input
                  label="Quận / Huyện"
                  name="city"
                  required
                  autoComplete="locality"
                  data-testid="city-input"
                />
              </div>
              <Input
                label="Tỉnh / Thành phố"
                name="province"
                autoComplete="address-level1"
                data-testid="state-input"
              />
              <CountrySelect
                region={region}
                name="country_code"
                required
                autoComplete="country"
                data-testid="country-select"
              />
              <Input
                label="Số điện thoại"
                name="phone"
                autoComplete="phone"
                data-testid="phone-input"
              />
            </div>
            {formState.error && (
              <div
                className="text-rose-500 text-small-regular py-2"
                data-testid="address-error"
              >
                {formState.error}
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            <div className="flex gap-3 mt-6">
              <Button
                type="reset"
                variant="secondary"
                onClick={close}
                className="h-10"
                data-testid="cancel-button"
              >
                Hủy
              </Button>
              <SubmitButton data-testid="save-button">Lưu địa chỉ</SubmitButton>
            </div>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  )
}

export default AddAddress
