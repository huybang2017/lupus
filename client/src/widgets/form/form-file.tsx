import { useId, useState } from "react";
import type { DragEvent, JSX } from "react";
import { FormField } from "@/widgets/form/form-field";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileField(props: {
  label?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  maxHeight?: number;
}): JSX.Element {
  const {
    label,
    file,
    onChange,
    accept,
    multiple,
    hint,
    error,
    required,
    disabled,
    emptyLabel,
    maxHeight,
  } = props;
  const autoId = useId();
  const [dragOver, setDragOver] = useState(false);
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    onChange(e.dataTransfer.files?.[0] ?? null);
  };
  return (
    <FormField label={label} htmlFor={autoId} required={required} hint={hint} error={error}>
      <label
        htmlFor={autoId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          display: "block",
          border: `1px ${dragOver ? "solid" : "dashed"} var(--field-border)`,
          borderColor: dragOver ? "var(--fg-interactive)" : undefined,
          background: dragOver ? "var(--hover-bg)" : undefined,
          borderRadius: 10,
          padding: "28px 16px",
          maxHeight,
          overflowY: maxHeight ? "auto" : undefined,
          textAlign: "center",
          cursor: disabled ? "default" : "pointer",
          pointerEvents: disabled ? "none" : undefined,
          opacity: disabled ? 0.5 : undefined,
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          {file ? file.name : emptyLabel ?? "Drag and drop a file or click to upload"}
        </div>
        <div style={{ color: "var(--fg-subtle)", marginTop: 4 }}>
          {file ? formatBytes(file.size) : "Drag and drop or click to upload"}
        </div>
        <input
          id={autoId}
          type="file"
          accept={accept}
          multiple={multiple}
          hidden
          aria-invalid={error ? true : undefined}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {multiple && file ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange(null)}
          style={{ fontSize: 12, padding: "4px 10px", marginTop: 8 }}
        >
          Remove
        </button>
      ) : null}
    </FormField>
  );
}

export function MultiFileField(props: {
  label?: string;
  files: File[];
  onChange: (files: File[]) => void;
  accept?: string;
  max?: number;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  dropTitle?: string;
  dropHint?: string;
  markFirst?: boolean;
}): JSX.Element {
  const {
    label,
    files,
    onChange,
    accept,
    max,
    hint,
    error,
    required,
    optional,
    disabled,
    dropTitle,
    dropHint,
    markFirst,
  } = props;
  const autoId = useId();
  const [dragOver, setDragOver] = useState(false);
  const full = max != null && files.length >= max;
  const add = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const merged = [...files, ...Array.from(incoming)];
    onChange(max == null ? merged : merged.slice(0, max));
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    add(e.dataTransfer.files);
  };
  return (
    <FormField
      label={label}
      htmlFor={autoId}
      required={required}
      optional={optional}
      hint={hint}
      error={error}
    >
      <label
        htmlFor={autoId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          display: "block",
          border: `1px ${dragOver ? "solid" : "dashed"} var(--field-border)`,
          borderColor: dragOver ? "var(--fg-interactive)" : undefined,
          background: dragOver ? "var(--hover-bg)" : undefined,
          borderRadius: 10,
          padding: "28px 16px",
          textAlign: "center",
          cursor: disabled || full ? "default" : "pointer",
          pointerEvents: disabled ? "none" : undefined,
          opacity: disabled || full ? 0.5 : undefined,
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 600 }}>
          {dropTitle ?? "Drag and drop files or click to upload"}
        </div>
        <div style={{ color: "var(--fg-subtle)", marginTop: 4 }}>
          {dropHint ?? "Select as many files as you need"}
        </div>
        <input
          id={autoId}
          type="file"
          accept={accept}
          multiple
          hidden
          disabled={disabled || full}
          aria-invalid={error ? true : undefined}
          onChange={(e) => add(e.target.files)}
        />
      </label>
      {files.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="badge badge-gray"
              style={{ fontSize: 12 }}
            >
              {markFirst && i === 0 ? "★ " : ""}
              {f.name}
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                  marginLeft: 4,
                }}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </FormField>
  );
}

export function HiddenFileInput(props: {
  id: string;
  onFiles: (files: FileList | null) => void;
  accept?: string;
  multiple?: boolean;
}): JSX.Element {
  const { id, onFiles, accept, multiple } = props;
  return (
    <input
      id={id}
      type="file"
      accept={accept}
      multiple={multiple}
      hidden
      onChange={(e) => onFiles(e.target.files)}
    />
  );
}
