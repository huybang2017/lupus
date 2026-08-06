import { Search } from "lucide-react";
import type { CSSProperties, JSX, ReactNode } from "react";
import { PaginationFooter } from "@/widgets/ui/primitives";
import { SearchField } from "@/widgets/form/form-fields";

export function TableCard(props: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={"table-wrap" + (props.className ? ` ${props.className}` : "")}
      style={props.style}
    >
      {props.children}
    </div>
  );
}

export function TableToolbar(props: {
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 16px",
        borderBottom: "1px solid var(--card-border)",
        ...props.style,
      }}
    >
      {props.left}
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {props.right}
      </div>
      {props.children}
    </div>
  );
}

export function TableSearch(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  width?: number;
  autoFocus?: boolean;
}): JSX.Element {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <SearchField
        value={props.value}
        onChange={props.onChange}
        onSubmit={props.onSubmit}
        placeholder={props.placeholder}
        width={props.width}
        autoFocus={props.autoFocus}
        leading={<Search size={15} />}
      />
    </div>
  );
}

export function TablePager(props: {
  page: number;
  limit: number;
  count: number | null;
  onPage: (page: number) => void;
}): JSX.Element {
  if (props.count == null) {
    return (
      <div style={{ padding: "10px 16px" }}>
        <PaginationFooter
          page={props.page}
          limit={props.limit}
          count={props.count}
          onPage={props.onPage}
        />
      </div>
    );
  }
  const totalPages = Math.max(1, Math.ceil(props.count / props.limit));
  const safePage = Math.min(Math.max(1, Math.floor(props.page)), totalPages);
  const handlePage = (next: number) => {
    props.onPage(Math.min(Math.max(1, Math.floor(next)), totalPages));
  };
  return (
    <div style={{ padding: "10px 16px" }}>
      <PaginationFooter
        page={safePage}
        limit={props.limit}
        count={props.count}
        onPage={handlePage}
      />
    </div>
  );
}

export function TableBulkBar(props: {
  count: number;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        fontSize: 13,
        borderTop: "1px solid var(--card-border)",
      }}
    >
      <span style={{ color: "var(--fg-subtle)" }}>{props.count} selected</span>
      {props.children}
    </div>
  );
}

export function TableActions(props: {
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      className="form-actions"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        padding: "14px 16px",
        borderTop: "1px solid var(--card-border)",
        ...props.style,
      }}
    >
      {props.children}
    </div>
  );
}

export function TableEmptyNote(props: { children: ReactNode }): JSX.Element {
  return (
    <div className="hint" style={{ marginTop: 0, padding: "6px 0" }}>
      {props.children}
    </div>
  );
}
