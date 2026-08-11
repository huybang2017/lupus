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
            />
            <TextField
              label={
                method === "recovery_code"
                  ? "Recovery code"
                  : "Verification code"
              }
              value={code}
              onChange={setCode}
              required
              autoComplete="off"
              placeholder="000000"
              style={{ letterSpacing: "4px" }}
            />
            <FormActions
              onCancel={() => setMfa(null)}
              cancelLabel="Back"
              onSubmit={runVerify}
              busy={busy}
              submitLabel="Verify"
              busyLabel="Verifying…"
            />
          </div>
        )}
      </AuthShell>
      {resetOpen ? (
        <ResetPasswordDrawer
          emailHint={email}
          onClose={() => setResetOpen(false)}
        />
      ) : null}
    </>
  );
}

function ResetPasswordDrawer({
  emailHint,
  onClose,
}: {
  emailHint: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState(emailHint);
  const [token, setToken] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function runRequest() {
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      await api("/auth/user/emailpass/reset-password", {
        method: "POST",
        body: { identifier: email.trim() },
      });
      setOk(
        "If the email exists, a reset token was issued. Paste it below with your new password.",
      );
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    setErr(null);
    setOk(null);
    if (pw1 !== pw2) {
      setErr("Mật khẩu không khớp");
      return;
    }
    if (pw1.length < 8) {
      setErr("Mật khẩu tối thiểu 8 ký tự");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/user/emailpass/update", {
        method: "POST",
        body: { password: pw1 },
        token: token.trim(),
      });
      setOk("Password updated. You can sign in now.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title="Reset password"
      subtitle={`Step ${step} of 2 — request a token, then set a new password`}
      onClose={onClose}
      onSubmit={step === 1 ? runRequest : runConfirm}
      busy={busy}
      submitLabel={step === 1 ? "Send reset token" : "Update password"}
      busyLabel={step === 1 ? "Sending…" : "Updating…"}
      extraActions={
        step === 2 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setStep(1)}
          >
            Back
          </button>
        ) : undefined
      }
    >
      {err ? <Alert>{err}</Alert> : null}
      {ok ? <Alert variant="success">{ok}</Alert> : null}
      {step === 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField
            label="Account email"
            type="email"
            value={email}
            onChange={setEmail}
            required
            placeholder="admin@test.com"
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <TextField
            label="Reset token"
            value={token}
            onChange={setToken}
            required
            placeholder="Paste the token from your email"
            style={{ fontFamily: "monospace" }}
          />
          <div
            style={{ fontSize: 12, color: "var(--fg-subtle)", marginTop: 4 }}
          >
            Dev note: tokens are also stored in the{" "}
            <span style={{ fontFamily: "monospace" }}>
              password_reset_token
            </span>{" "}
            table and the notification log.
          </div>
          <TextField
            label="New password (min 8 chars)"
            type="password"
            value={pw1}
            onChange={setPw1}
            required
            autoComplete="new-password"
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={pw2}
            onChange={setPw2}
            required
            autoComplete="new-password"
          />
        </div>
      )}
    </FormDrawer>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function runRegister() {
    setError(null);
    setSuccess(false);
    if (password !== confirmPassword) {
      setError("Mật khẩu không khớp");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/user/emailpass/register", {
        method: "POST",
        body: { email, password, first_name: firstName, last_name: lastName },
      });
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function onRegisterKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void runRegister();
  }

  return (
    <AuthShell title="Create account" subtitle="Register your admin account">
      {error ? <Alert>{error}</Alert> : null}
      {success ? (
        <Alert variant="success">Account created! Redirecting to login…</Alert>
      ) : null}
      <div
        onKeyDown={onRegisterKeyDown}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        <FormGrid cols={2}>
          <TextField
            label="First name"
            value={firstName}
            onChange={setFirstName}
            required
            placeholder="John"
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={setLastName}
            required
            placeholder="Doe"
          />
        </FormGrid>
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
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
          autoComplete="new-password"
        />
        <FormActions
          onCancel={() => navigate("/login", { replace: true })}
          cancelLabel="Back"
          onSubmit={runRegister}
          busy={busy}
          submitLabel="Create account"
          busyLabel="Creating…"
        />
      </div>
      <p
        style={{
          textAlign: "center",
          marginTop: 16,
          fontSize: 13,
          color: "var(--fg-subtle)",
        }}
      >
        Already have an account?{" "}
        <Link
          to="/login"
          style={{
            color: "var(--fg-interactive)",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

// Lupus "Welcome to Lupus": the page an invite link opens (/invite?token=...). The email is
// the invited address and cannot be changed; the rest creates the account.
export function InviteAcceptPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ email: string } | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<{ invite: { email: string } }>(`/admin/invites/lookup?token=${encodeURIComponent(token)}`)
      .then((d) => setInvite(d.invite))
      .catch(() => setInvalid(true));
  }, [token]);

  const pwError = password.length < 8 ? "Password must be at least 8 characters" : undefined;
  const repeatError = repeat !== password ? "Passwords do not match" : undefined;

  async function submit() {
    setError(null);
    if (!invite || pwError || repeatError || !firstName.trim() || !lastName.trim()) {
      setShow(true);
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/invites/accept?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: { email: invite.email, password, first_name: firstName.trim(), last_name: lastName.trim() },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <AuthShell title="Your invite token is invalid" subtitle="Try requesting a new invite link.">
        <FormActions onCancel={() => navigate("/login")} cancelLabel="Back to login" onSubmit={() => navigate("/login")} submitLabel="Back to login" />
      </AuthShell>
    );
  }
  if (done) {
    return (
      <AuthShell title="Your account has been registered" subtitle="Get started with Lupus Admin right away.">
        <FormActions onCancel={() => navigate("/login")} cancelLabel="Back to login" onSubmit={() => navigate("/login")} submitLabel="Start Lupus Admin" />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Welcome to Lupus" subtitle="Create your account below">
      {error ? <Alert>{error}</Alert> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <TextField label="Email" value={invite?.email ?? ""} onChange={() => undefined} readOnly hint="Your email cannot be changed. If you would like to use another email, a new invite must be sent." />
        <TextField label="First name" value={firstName} onChange={setFirstName} error={show && !firstName.trim() ? "Required" : undefined} />
        <TextField label="Last name" value={lastName} onChange={setLastName} error={show && !lastName.trim() ? "Required" : undefined} />
        <TextField label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" error={show ? pwError : undefined} />
        <TextField label="Repeat password" type="password" value={repeat} onChange={setRepeat} autoComplete="new-password" error={show ? repeatError : undefined} />
        <FormActions onCancel={() => navigate("/login")} cancelLabel="Back to login" onSubmit={submit} busy={busy} submitLabel="Create account" busyLabel="Creating…" />
      </div>
    </AuthShell>
  );
}

// The page a reset password link opens (/reset-password?token=...).
export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pwError = pw.length < 8 ? "Password must be at least 8 characters" : undefined;
  const repeatError = repeat !== pw ? "Passwords do not match" : undefined;

  async function submit() {
    setError(null);
    if (pwError || repeatError) {
      setShow(true);
      return;
    }
    setBusy(true);
    try {
      await api("/auth/user/emailpass/update", { method: "POST", body: { password: pw }, token });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Your reset link is invalid" subtitle="Request a new one from the login page.">
        <FormActions onCancel={() => navigate("/login")} cancelLabel="Back to login" onSubmit={() => navigate("/login")} submitLabel="Back to login" />
      </AuthShell>
    );
  }
  return (
    <AuthShell title={done ? "Password updated" : "Reset password"} subtitle={done ? "You can sign in with your new password." : "Choose a new password"}>
      {error ? <Alert>{error}</Alert> : null}
      {done ? (
        <FormActions onCancel={() => navigate("/login")} cancelLabel="Back to login" onSubmit={() => navigate("/login")} submitLabel="Sign in" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TextField label="New password" type="password" value={pw} onChange={setPw} autoComplete="new-password" error={show ? pwError : undefined} />
          <TextField label="Repeat password" type="password" value={repeat} onChange={setRepeat} autoComplete="new-password" error={show ? repeatError : undefined} />
          <FormActions onCancel={() => navigate("/login")} cancelLabel="Back to login" onSubmit={submit} busy={busy} submitLabel="Reset password" busyLabel="Saving…" />
        </div>
      )}
    </AuthShell>
  );
}
