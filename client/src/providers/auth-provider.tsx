import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { api, getToken, setToken, ApiError } from "@/shared/api/client"

interface User { id: string; email: string; first_name?: string | null; last_name?: string | null }
interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ mfa?: { id: string; methods: string[]; token: string } | null }>
  verifyMfa: (challengeId: string, challengeToken: string, method: string, code: string) => Promise<void>
  logout: () => void
}
const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const token = getToken()
    if (!token) { setLoading(false); return }
    api<{ user: User }>("/admin/users/me", { token }).then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setLoading(false))
  }, [])
  const login = useCallback(async (email: string, password: string) => {
    const res = await api<any>("/auth/user/emailpass", { method: "POST", body: { email, password }, token: null })
    if (res.mfa_required && res.mfa_challenge) return { mfa: { id: res.mfa_challenge.id, methods: res.mfa_challenge.methods ?? ["totp"], token: res.token } }
    if (!res.token) throw new Error("Unexpected login response")
    setToken(res.token)
    setUser(await api<{ user: User }>("/admin/users/me", { token: res.token }).then((d) => d.user))
    return { mfa: null }
  }, [])
  const verifyMfa = useCallback(async (challengeId: string, challengeToken: string, method: string, code: string) => {
    const res = await api<{ token: string }>(`/auth/mfa/challenges/${challengeId}/verify`, { method: "POST", body: { method, code }, token: challengeToken })
    setToken(res.token)
    setUser(await api<{ user: User }>("/admin/users/me", { token: res.token }).then((d) => d.user))
  }, [])
  const logout = useCallback(() => { setToken(null); setUser(null) }, [])
  return <AuthContext.Provider value={{ user, loading, login, verifyMfa, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth outside provider")
  return ctx
}
