import { useEffect, useRef, useState, type JSX } from "react";

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  /** When set, the user must type this text before the confirm button unlocks. */
  verifyText?: string;
}

export interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
}

export function ConfirmDialog(props: {
  state: ConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element | null {
  const title = props.state.options.title ?? "Are you sure?";
  const description = props.state.options.description;
  const confirmLabel = props.state.options.confirmLabel ?? "Continue";
  const cancelLabel = props.state.options.cancelLabel ?? "Cancel";
  const variant = props.state.options.variant ?? "danger";
  const verifyText = props.state.options.verifyText;
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancel = props.onCancel;
  const onConfirm = props.onConfirm;
  const open = props.state.open;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="listbox"]')) return;
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  useEffect(() => {
    if (!open) return;
    setTyped("");
    if (!verifyText) confirmRef.current?.focus();
  }, [open, verifyText]);
  const locked = !!verifyText && typed !== verifyText;
  if (!open) return null;
  return (
    <div className="confirm-back" onClick={onCancel}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">{title}</div>
        <div className="confirm-body">{description}</div>
        {verifyText ? (
          <div style={{ margin: "0 0 16px" }}>
            <div style={{ fontSize: 13, color: "var(--fg-subtle)", marginBottom: 6 }}>
              Please type <strong style={{ color: "var(--fg-base)" }}>{verifyText}</strong> to confirm:
            </div>
            <input
              className="input"
              autoFocus
              aria-label="Confirmation text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !locked) onConfirm();
              }}
            />
          </div>
        ) : null}
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            disabled={locked}
            className={
              variant === "danger"
                ? "btn btn-primary confirm-danger"
                : "btn btn-primary"
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
