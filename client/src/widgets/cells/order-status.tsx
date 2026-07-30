import type { StatusColor } from "@/shared/pricing/price-list";
import { StatusCell } from "@/widgets/cells/status-pill";

// Lupus's payment / fulfillment / order status cells: a coloured square and the label.
const PAYMENT: Record<string, [string, StatusColor]> = {
  not_paid: ["Not paid", "grey"],
  awaiting: ["Awaiting", "grey"],
  authorized: ["Authorized", "orange"],
  captured: ["Captured", "green"],
  partially_captured: ["Partially captured", "orange"],
  refunded: ["Refunded", "grey"],
  partially_refunded: ["Partially refunded", "orange"],
  requires_action: ["Requires action", "orange"],
  canceled: ["Canceled", "red"],
};

const FULFILLMENT: Record<string, [string, StatusColor]> = {
  not_fulfilled: ["Not fulfilled", "grey"],
  partially_fulfilled: ["Partially fulfilled", "orange"],
  fulfilled: ["Fulfilled", "green"],
  shipped: ["Shipped", "green"],
  partially_shipped: ["Partially shipped", "orange"],
  delivered: ["Delivered", "green"],
  partially_delivered: ["Partially delivered", "orange"],
  canceled: ["Canceled", "red"],
};

const ORDER: Record<string, [string, StatusColor]> = {
  pending: ["Pending", "orange"],
  completed: ["Completed", "green"],
  draft: ["Draft", "grey"],
  open: ["Open", "orange"],
  archived: ["Archived", "grey"],
  canceled: ["Canceled", "red"],
  requires_action: ["Requires action", "orange"],
};

const label = (raw: string) => raw.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function cell(table: Record<string, [string, StatusColor]>, value: unknown) {
  if (value === null || value === undefined || value === "") return <span style={{ color: "var(--fg-muted)" }}>-</span>;
  const [text, color] = table[String(value)] ?? [label(String(value)), "grey" as StatusColor];
  return <StatusCell color={color}>{text}</StatusCell>;
}

export const PaymentStatusCell = ({ value }: { value: unknown }) => cell(PAYMENT, value);
export const FulfillmentStatusCell = ({ value }: { value: unknown }) => cell(FULFILLMENT, value);
export const OrderStatusCell = ({ value }: { value: unknown }) => cell(ORDER, value);
