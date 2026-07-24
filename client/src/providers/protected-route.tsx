import { useEffect, useState } from "react"
import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "@/providers/auth-provider"

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const [show, setShow] = useState(false)

  useEffect(() => { if (!loading) setShow(true) }, [loading])

  if (!show) return <div style={{ padding: 24 }}>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
