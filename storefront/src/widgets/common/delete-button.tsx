import { deleteLineItem } from "@/entities/cart"
import { Spinner, Trash } from "@/widgets/common/icons"
import { clx } from "@/widgets/common/ui"
import { useState } from "react"

const DeleteButton = ({
  id,
  children,
  className,
}: {
  id: string
  children?: React.ReactNode
  className?: string
}) => {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    await deleteLineItem(id).catch((_err) => {
      setIsDeleting(false)
    })
  }

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className
      )}
    >
      <button
        className="flex cursor-pointer gap-x-1 text-brand-ink/65 hover:text-brand-clay"
        onClick={() => handleDelete(id)}
        aria-label={children ? undefined : "Xóa sách khỏi giỏ"}
      >
        {isDeleting ? <Spinner className="animate-spin" /> : <Trash />}
        <span>{children}</span>
      </button>
    </div>
  )
}

export default DeleteButton
