import { useRef, type JSX, type ReactNode } from "react";
import { Alert, Drawer } from "@/widgets/ui/primitives";
import { requestConfirm } from "@/widgets/confirm";

export interface FormActionsProps {
  onCancel: () => void;
  onSubmit: () => void;
  busy?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  extra?: ReactNode;
}

const BUSY_LABELS = new Map<string, string>([
  ["Save", "Saving…"],
  ["Create", "Creating…"],
  ["Add", "Adding…"],
  ["Import", "Importing…"],
  ["Export", "Exporting…"],
  ["Convert", "Converting…"],
]);

function toBusyLabel(label: string): string {
  return BUSY_LABELS.get(label) ?? `${label}…`;
}

export function FormActions(props: FormActionsProps): JSX.Element {
  const {
    onCancel,
    onSubmit,
    busy,
    disabled,
    submitLabel = "Save",
    busyLabel,
    cancelLabel = "Cancel",
    extra,
  } = props;
  return (
    <div className="form-actions">
      {extra ? <span style={{ marginRight: "auto" }}>{extra}</span> : null}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onCancel}
        disabled={busy}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onSubmit}
        disabled={busy || disabled}
      >
        {busy ? (busyLabel ?? toBusyLabel(submitLabel)) : submitLabel}
      </button>
    </div>
  );
}

export interface FormDrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSubmit?: () => void;
  busy?: boolean;
  disabled?: boolean;
  submitLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  error?: string | null;
  extraActions?: ReactNode;
  /** Ask before closing a drawer whose fields were edited (default true). */
  confirmDiscard?: boolean;
  children: ReactNode;
}

export function FormDrawer(props: FormDrawerProps): JSX.Element {
  const {
    title,
    subtitle,
    onClose,
    onSubmit,
    busy,
    disabled,
    submitLabel,
    busyLabel,
    cancelLabel,
    error,
    extraActions,
    confirmDiscard = true,
    children,
  } = props;
  // Lupus blocks leaving a form that was edited: any input inside the drawer marks it dirty.
  const dirty = useRef(false);
  const guardedClose = async () => {
    if (
      confirmDiscard &&
      dirty.current &&
      !busy &&
      !(await requestConfirm({
        title: "Unsaved changes",
        description: "You have unsaved changes. Are you sure you want to discard them?",
        variant: "primary",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
      }))
    )
      return;
    onClose();
  };
  return (
    <Drawer
      title={title}
      subtitle={subtitle}
      onClose={() => void guardedClose()}
      footer={
        onSubmit ? (
          <FormActions
            onCancel={() => void guardedClose()}
            onSubmit={onSubmit}
            busy={busy}
            disabled={disabled}
            submitLabel={submitLabel}
            busyLabel={busyLabel}
            cancelLabel={cancelLabel}
            extra={extraActions}
          />
        ) : (
          <div className="form-actions">
            {extraActions ? (
              <span style={{ marginRight: "auto" }}>{extraActions}</span>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void guardedClose()}
              disabled={busy}
            >
              {cancelLabel ?? "Close"}
            </button>
          </div>
        )
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      <div
        onInputCapture={() => {
          dirty.current = true;
        }}
        onChangeCapture={() => {
          dirty.current = true;
        }}
      >
        {children}
      </div>
    </Drawer>
  );
}
