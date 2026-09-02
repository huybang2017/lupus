import { CreditCard } from "@/widgets/common/icons"
import Bancontact from "@/widgets/common/icons/bancontact"
import Ideal from "@/widgets/common/icons/ideal"
import PayPal from "@/widgets/common/icons/paypal"
import React from "react"

/* Map of payment provider_id to their title and icon. Add in any payment providers you want to use. */
export const paymentInfoMap: Record<string, { title: string; icon: React.JSX.Element }> = {
  pp_stripe_stripe: {
    title: "Credit card",
    icon: <CreditCard />,
  },
  "pp_stripe-ideal_stripe": {
    title: "iDeal",
    icon: <Ideal />,
  },
  "pp_stripe-bancontact_stripe": {
    title: "Bancontact",
    icon: <Bancontact />,
  },
  pp_paypal_paypal: {
    title: "PayPal",
    icon: <PayPal />,
  },
  pp_system_default: {
    title: "Manual Payment",
    icon: <CreditCard />,
  },
  // the backend's legacy id for the same built-in provider
  manual: {
    title: "Manual Payment",
    icon: <CreditCard />,
  },
  // Add more payment providers here
}

// This only checks if it is native stripe, it ignores the other stripe-based providers
export const isStripeLike = (providerId?: string) => {
  return providerId?.startsWith("pp_stripe_")
}

export const isManual = (providerId?: string) => {
  return providerId?.startsWith("pp_system_default") || providerId === "manual"
}
