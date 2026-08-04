import type { CSSProperties, JSX, ReactNode } from "react";

export function FormGrid(props: {
  cols?: 1 | 2 | 3;
  gap?: number | string;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const { cols = 2, gap, style, className, children } = props;
  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns:
          cols === 1
            ? "1fr"
            : cols === 3
              ? "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)"
              : "minmax(0, 1fr) minmax(0, 1fr)",
        gap: gap ?? "0 12px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function FormSection(props: {
  title: string;
  subtitle?: string;
  layout?: "stack" | "split";
  children: ReactNode;
}): JSX.Element {
  const { title, subtitle, layout = "stack", children } = props;
  if (layout === "split") {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: "0 12px",
          marginBottom: 20,
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
          <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>{subtitle}</div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          {children}
        </div>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: subtitle ? 2 : 8,
        }}
      >
        {title}
      </div>
      {subtitle ? (
        <div
          style={{ fontSize: 12, color: "var(--fg-subtle)", marginBottom: 8 }}
        >
          {subtitle}
        </div>
      ) : null}
      {children}
    </div>
  );
}
