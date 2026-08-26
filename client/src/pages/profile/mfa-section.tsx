import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { api } from "@/shared/api/client";
import { Alert, RowMenu } from "@/widgets/ui/primitives";
import { CopyButton } from "@/widgets/ui/copy-button";
import { FormDrawer, TextField } from "@/widgets/form";
import { StatusBadge } from "@/widgets/cells/status-pill";
import { useConfirm } from "@/widgets/confirm";
import { DetailSection, KV } from "@/widgets/detail/detail-section";

interface Factor {
  id: string;
  provider: string;
  status: "pending" | "enabled" | "disabled" | string;
}

// An otpauth:// link drawn as an SVG QR code, which is what authenticator apps scan.
function QrCode({ value }: { value: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [value]);
  return <div aria-label="QR code" role="img" style={{ width: 188, height: 188, background: "#fff", padding: 6, borderRadius: 8 }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function RecoveryCodesDialog({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = codes.join("\n");
  return (
    <div className="confirm-back">
      <div className="confirm" role="dialog" aria-modal="true" aria-label="Recovery codes" style={{ maxWidth: 460 }}>
        <div className="confirm-title">Save your recovery codes</div>
        <div className="confirm-body">
          Each code works once if you lose access to your authenticator app. This is the only time they are shown, so store them somewhere safe.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, margin: "0 0 12px", fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}>
          {codes.map((c) => (
            <code key={c} style={{ padding: "6px 8px", border: "1px solid var(--card-border)", borderRadius: 6 }}>
              {c}
            </code>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 13 }}>
          <CopyButton value={text} title="Copy all codes" />
          Copy all codes
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-primary" onClick={onDone}>
            I have saved them
          </button>
        </div>
      </div>
    </div>
  );
}

function SetupDrawer({ factorId, secret, otpauth, onClose, onEnabled }: { factorId: string; secret: string; otpauth: string; onClose: () => void; onEnabled: (codes: string[]) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function verify() {
    if (!/^\d{6}$/.test(code.trim())) {
      setErr("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/auth/mfa/factors/${factorId}/verify`, { method: "POST", body: { code: code.trim() } });
      const res = await api<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: {} });
      onEnabled(res.recovery_codes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Set up two-factor authentication" subtitle="Scan the QR code with an authenticator app, then enter the code it shows." onClose={onClose} onSubmit={verify} busy={busy} error={err} submitLabel="Verify">
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 8px" }}>
        <QrCode value={otpauth} />
      </div>
      <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>Cannot scan it? Enter this key in your app instead:</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <code style={{ fontSize: 13, overflowWrap: "anywhere" }}>{secret}</code>
        <CopyButton value={secret} title="Copy key" />
      </div>
      <TextField label="Authentication code" placeholder="123456" value={code} onChange={setCode} maxLength={6} autoComplete="one-time-code" />
    </FormDrawer>
  );
}

function DisableDrawer({ factorId, onClose, onDisabled }: { factorId: string; onClose: () => void; onDisabled: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function disable() {
    if (code.trim() === "") {
      setErr("Enter a code from your authenticator app, or a recovery code.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/auth/mfa/factors/${factorId}`, { method: "DELETE", body: { code: code.trim() } });
      onDisabled();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Turn off two-factor authentication" subtitle="Enter a current code from your authenticator app, or one of your recovery codes." onClose={onClose} onSubmit={disable} busy={busy} error={err} submitLabel="Turn off">
      <TextField label="Authentication or recovery code" value={code} onChange={setCode} autoComplete="one-time-code" />
    </FormDrawer>
  );
}

// Lupus profile "Two-factor authentication": status, authenticator-app setup and recovery codes.
export function MfaSection() {
  const confirm = useConfirm();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ id: string; secret: string; otpauth: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  function load() {
    api<{ mfa_factors: Factor[] }>("/auth/mfa/factors")
      .then((d) => setFactors(d.mfa_factors))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, []);

  const live = (factors ?? []).filter((f) => f.provider === "totp" && f.status !== "disabled");
  const enabled = live.find((f) => f.status === "enabled");
  const pending = !enabled && live.some((f) => f.status === "pending");

  async function start() {
    setErr(null);
    try {
      const res = await api<{ mfa_factor: Factor; secret: string; otpauth_url: string }>("/auth/mfa/factors", { method: "POST", body: { provider: "totp", label: "admin", issuer: "Store Admin" } });
      setSetup({ id: res.mfa_factor.id, secret: res.secret, otpauth: res.otpauth_url });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function regenerate() {
    const ok = await confirm({
      title: "Generate new recovery codes?",
      description: "Your current recovery codes stop working as soon as new ones are generated.",
      confirmLabel: "Generate",
      variant: "primary",
    });
    if (!ok) return;
    try {
      const res = await api<{ recovery_codes: string[] }>("/auth/mfa/recovery-codes", { method: "POST", body: {} });
      setCodes(res.recovery_codes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <DetailSection
        title="Two-factor authentication"
        subtitle="Require an authenticator app when signing in."
        action={
          enabled ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-secondary" onClick={() => setDisabling(true)}>
                Disable
              </button>
              <RowMenu items={[{ label: "Generate new recovery codes", onClick: () => void regenerate() }]} />
            </div>
          ) : (
            <button className="btn btn-secondary" onClick={() => void start()} disabled={factors === null}>
              Enable
            </button>
          )
        }
      >
        {err ? <Alert>{err}</Alert> : null}
        <KV
          rows={[
            ["Status", enabled ? <StatusBadge key="s" color="green">Enabled</StatusBadge> : pending ? <StatusBadge key="s" color="orange">Pending setup</StatusBadge> : <StatusBadge key="s" color="grey">Disabled</StatusBadge>],
            ["Method", "Authenticator app"],
          ]}
        />
      </DetailSection>
      {setup ? (
        <SetupDrawer
          factorId={setup.id}
          secret={setup.secret}
          otpauth={setup.otpauth}
          onClose={() => {
            setSetup(null);
            load();
          }}
          onEnabled={(c) => {
            setSetup(null);
            setCodes(c);
            load();
          }}
        />
      ) : null}
      {disabling && enabled ? (
        <DisableDrawer
          factorId={enabled.id}
          onClose={() => setDisabling(false)}
          onDisabled={() => {
            setDisabling(false);
            load();
          }}
        />
      ) : null}
      {codes ? <RecoveryCodesDialog codes={codes} onDone={() => setCodes(null)} /> : null}
    </>
  );
}
