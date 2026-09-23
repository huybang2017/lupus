import { useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { retrieveCart } from "@/entities/cart"
import { retrieveCustomer } from "@/entities/customer"
import { registerNavigator } from "@/shared/navigation/navigation"
import ErrorBoundary from "@/widgets/common/error-boundary"

/** Mounted once: lets data-layer code (server-action stand-ins) navigate, and loads the cart and customer. */
export function RootLayout() {
  const navigate = useNavigate()

  useEffect(() => {
    registerNavigator((to, opts) => navigate(to, opts))
    return () => registerNavigator(null)
  }, [navigate])

  useEffect(() => {
    void retrieveCart()
    void retrieveCustomer()
  }, [])

  return (
    <ErrorBoundary>
      <main className="relative">
        <Outlet />
      </main>
    </ErrorBoundary>
  )
}