import { BrowserRouter } from "react-router-dom"
import { ConfirmProvider } from "@/widgets/confirm"
import { AuthProvider } from "@/providers/auth-provider"
import { AppRoutes } from "@/app/router/routes"

export function App() {
  return (
    <ConfirmProvider>
      <BrowserRouter basename="/app">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ConfirmProvider>
  )
}
