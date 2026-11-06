import repeat from "@/shared/utils/repeat"
import { HttpTypes } from "@/shared/types/http"
import { Heading, Table } from "@/widgets/common/ui"

import Item from "@/widgets/cart/item"
import SkeletonLineItem from "@/widgets/skeletons/skeleton-line-item"

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart
}

const ItemsTemplate = ({ cart }: ItemsTemplateProps) => {
  const items = cart?.items
  return (
    <div className="overflow-x-auto">
      <div className="pb-3 flex items-center">
        <Heading className="font-editorial text-[2rem] leading-[2.75rem] text-brand-ink">Giỏ sách</Heading>
      </div>
      <Table className="min-w-[560px] small:min-w-0">
        <Table.Header className="border-t-0">
          <Table.Row className="border-brand-gold/30 text-brand-ink/60 txt-medium-plus hover:bg-transparent">
            <Table.HeaderCell className="!pl-0">Sách</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
            <Table.HeaderCell>Số lượng</Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              Đơn giá
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right">
              Thành tiền
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items
            ? items
                .sort((a, b) => {
                  return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                })
                .map((item) => {
                  return (
                    <Item
                      key={item.id}
                      item={item}
                      currencyCode={cart?.currency_code}
                    />
                  )
                })
            : repeat(5).map((i) => {
                return <SkeletonLineItem key={i} />
              })}
        </Table.Body>
      </Table>
    </div>
  )
}

export default ItemsTemplate
