import type { CSSProperties, JSX, ReactNode } from "react";

function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  action?: ReactNode;
  style?: CSSProperties;
  className?: string;
  layout?: "stack" | "split";
  children: ReactNode;
}

export function FormField(props: FormFieldProps): JSX.Element {
  const {
    label,
    htmlFor,
    required,
    optional,
    hint,
    error,
    action,
    style,
    className,
    layout = "stack",
    children,
  } = props;
  if (layout === "split") {
    return (
      <div
        className={cn("field", className)}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "0 12px",
          ...style,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            paddingTop: 2,
          }}
        >
          {label || action ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {label ? (
                <label className="field-label" htmlFor={htmlFor}>
                  {label}
                  {required ? " *" : null}
                  {!required && optional ? (
                    <span className="field-optional"> (Optional)</span>
                  ) : null}
                </label>
              ) : null}
              {action ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}
            </div>
          ) : null}
          {hint ? (
            <div className="hint" style={{ marginTop: 0 }}>
              {hint}
            </div>
          ) : null}
        </div>
        <div style={{ minWidth: 0 }}>{children}</div>
        {error ? (
          <div className="field-error" role="alert" style={{ gridColumn: "1 / -1" }}>
            {error}
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div className={cn("field", className)} style={style}>
      {label || action ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {label ? (
            <label className="field-label" htmlFor={htmlFor}>
              {label}
              {required ? " *" : null}
              {!required && optional ? (
                <span className="field-optional"> (Optional)</span>
              ) : null}
            </label>
          ) : null}
          {action ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}
        </div>
      ) : null}
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
