import { BrowserRouter } from "react-router-dom"
import { AppRoutes } from "@/app/router/routes"

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}