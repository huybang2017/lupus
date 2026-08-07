import { useEffect, useRef, useState, type JSX } from "react";
import { Check, Copy } from "lucide-react";

function fallbackCopy(value: string) {
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {}
}

function writeClipboard(value: string): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      clipboard?: { writeText: (t: string) => Promise<void> };
    };
    if (nav.clipboard?.writeText)
      return nav.clipboard.writeText(value).catch(() => fallbackCopy(value));
  } catch {}
  fallbackCopy(value);
  return Promise.resolve();
}

export function CopyButton(props: {
  value: string;
  label?: string;
  title?: string;
}): JSX.Element | null {
  const { value, label, title } = props;
  const text = title ?? label ?? "Copy";
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);
  if (!value) return null;
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void writeClipboard(value).then(() => {
          setCopied(true);
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      style={{
        width: 24,
        height: 24,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 6,
        color: "var(--fg-muted)",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export function CopyText(props: { value: string }): JSX.Element | null {
  const { value } = props;
  if (!value) return null;
  return (
    <span
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 8,
        minWidth: 0,
      }}
    >
      <span
        style={{
          minWidth: 0,
          flex: 1,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
      <CopyButton value={value} />
    </span>
  );
}
