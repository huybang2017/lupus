import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { useAuth } from "@/providers/auth-provider";
import { Alert } from "@/widgets/ui/primitives";
import {
  FormActions,
  FormDrawer,
  FormGrid,
  SelectField,
  TextField,
} from "@/widgets/form/index";

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--shell-bg)",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            color: "var(--fg-base)",
            letterSpacing: "-1px",
          }}
        >
          <span style={{ color: "var(--fg-interactive)" }}>◆</span> Lupus
        </div>
        <p style={{ color: "var(--fg-subtle)", marginTop: 8, fontSize: 13 }}>
          Plain React Admin Dashboard
        </p>
      </div>
      <div
        className="card"
        style={{
          borderRadius: 12,
          padding: 32,
          width: "100%",
          maxWidth: 400,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <h1
          style={{
            margin: "0 0 4px",
            fontSize: 22,
            textAlign: "center",
            color: "var(--fg-base)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: "0 0 20px",
            color: "var(--fg-subtle)",
            textAlign: "center",
            fontSize: 14,
          }}
        >
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login, verifyMfa, user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState<{
    id: string;
    methods: string[];
    token: string;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [method, setMethod] = useState("totp");
  const [code, setCode] = useState("");

  async function runLogin() {
    setError(null);
    setBusy(true);
    try {
      const res = await login(email, password);
      if (res.mfa) setMfa(res.mfa);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onLoginKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void runLogin();
  }

  async function runVerify() {
    if (!mfa) return;
    setError(null);
    setBusy(true);
    try {
      await verifyMfa(mfa.id, mfa.token, method, code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onMfaKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void runVerify();
  }

  return (
    <>
      <AuthShell
        title={mfa ? "Two-factor authentication" : "Welcome back"}
        subtitle={
          mfa ? "Enter your verification code" : "Sign in to your account"
        }
      >
        {error ? <Alert>{error}</Alert> : null}
        {!mfa ? (
          <div
            onKeyDown={onLoginKeyDown}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="email"
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              autoComplete="current-password"
            />
            <FormActions
              onCancel={() => setResetOpen(true)}
              cancelLabel="Forgot password?"
              onSubmit={runLogin}
              busy={busy}
              submitLabel="Sign in"
              busyLabel="Signing in…"
            />
            <p
              style={{
                textAlign: "center",
                margin: "4px 0 0",
                fontSize: 13,
                color: "var(--fg-subtle)",
              }}
            >
              Chưa có tài khoản?{" "}
              <Link
                to="/register"
                style={{
                  color: "var(--fg-interactive)",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Tạo tài khoản
              </Link>
            </p>
          </div>
        ) : (
          <div
            onKeyDown={onMfaKeyDown}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <SelectField
              label="Verification method"
              value={method}
              onChange={(v) => setMethod(v)}
              options={mfa.methods.map((m) => ({
                value: m,
                label:
                  m === "totp" ? "Authenticator app (TOTP)" : "Recovery code",
              }))}
