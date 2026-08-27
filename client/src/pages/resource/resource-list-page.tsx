import { useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { singular } from "@/shared/formatting/text";
import { downloadCSV, parseCSVFile, toCSV } from "@/shared/formatting/csv";
import { detailUrl } from "@/shared/utils/admin-path";
import { useAdminBase } from "@/shared/utils/admin-path";
import { getResource, type Resource } from "@/entities/resources";
import { buildListPath, useResourceList, type ListParams } from "@/shared/hooks/use-resource-list";
import { fmtCell } from "@/widgets/ui/surfaces";
import { Alert } from "@/widgets/ui/primitives";
import {
  DataTable,
  TableBulkBar,
  TablePager,
  TableSearch,
  TableToolbar,
} from "@/widgets/table/index";
import type { TableColumn, TableRowAction } from "@/widgets/table/index";
import { FileField, FormDrawer, toggleInList } from "@/widgets/form/index";
import { FilterBar, useListFilters } from "@/widgets/filters";
import type { FilterDef } from "@/shared/filters/list-filters";
import { ResourceForm } from "@/pages/resource/resource-form";
import { useConfirm } from "@/widgets/confirm";

export const PAGE_SIZE = 20;

/** Largest page the shared list endpoints accept; used for the CSV export. */
const EXPORT_LIMIT = 1000;

/** Stable identity for "this resource has no filters", so hooks never loop. */
const EMPTY_FILTERS: FilterDef[] = [];

/**
 * Placeholder so the list query can be called before the slug is validated.
 * `useQuery` needs a stable key and a path; nothing ever reads the result
 * because the component returns "Resource not found" first.
 */
const FALLBACK_RESOURCE: Resource = {
  slug: "__missing__",
  label: "Records",
  group: "",
  listKey: "records",
  listPath: "/admin/does-not-exist",
  columns: [],
  fields: [],
};

function ExportDrawer({
  resource,
  rows,
  params,
  onClose,
}: {
  resource: Resource;
  rows: Record<string, any>[];
  params: ListParams;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function doExport() {
    setBusy(true);
    try {
      const all: Record<string, any>[] = rows.length > 0 ? rows : [];
      if (all.length === 0) {
        // Same path builder as the table, so the CSV matches what the user is
        // looking at: same search term, same filters, just a bigger page.
        const data = await api(
          buildListPath(resource, { ...params, page: 1, limit: EXPORT_LIMIT }),
        );
        all.push(...parseList(data, EXPORT_LIMIT).items);
      }
      downloadCSV(`${resource.slug}-export`, toCSV(resource.columns, all));
      onClose();
    } finally {
      setBusy(false);
    }
  }
  const filtered = params.q !== "" || (params.filters?.length ?? 0) > 0;
  return (
    <FormDrawer
      title={`Export ${resource.label} List`}
      subtitle={
        filtered
          ? "Exports the rows that match the current search and filters"
          : "Apply filters in the table overview to adjust this view"
      }
      onClose={onClose}
      onSubmit={doExport}
      busy={busy}
      submitLabel="Export"
    >
      <div style={{ fontSize: 13, color: "var(--fg-subtle)" }}>
        <div
          style={{ fontWeight: 600, color: "var(--fg-base)", marginBottom: 4 }}
        >
          Filters
        </div>
        {filtered
          ? `The active search and ${params.filters?.length ?? 0} filter${
              (params.filters?.length ?? 0) === 1 ? "" : "s"
            } are applied. `
          : ""}
        Exports the current view as CSV ({rows.length} row
        {rows.length === 1 ? "" : "s"} on this page; falls back to the first{" "}
        {EXPORT_LIMIT} matching rows when empty).{" "}
      </div>
    </FormDrawer>
  );
}

function ImportDrawer({
  resource,
  onClose,
  onDone,
}: {
  resource: Resource;
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labelToKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of resource.columns) map.set(c.label.toLowerCase(), c.key);
    for (const f of resource.fields) map.set(f.label.toLowerCase(), f.key);
    return map;
  }, [resource]);

  function downloadTemplate() {
    const cols =
      resource.fields.length > 0
        ? resource.fields.map((f) => ({ key: f.key, label: f.label }))
        : resource.columns;
    downloadCSV(`${resource.slug}-import-template`, toCSV(cols, []));
  }

  async function doImport() {
    if (!file || !resource.createPath) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { headers, rows } = await parseCSVFile(file);
      const keys = headers.map((h) => labelToKey.get(h.toLowerCase()) ?? h);
      let ok = 0;
      const failures: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const body: Record<string, any> = {};
        keys.forEach((k, idx) => {
          const v = rows[i][headers[idx]];
          if (v !== "") body[k] = v;
        });
        try {
          const path =
            typeof resource.createPath === "function"
              ? resource.createPath(body)
              : resource.createPath;
          await api(path, { method: "POST", body });
          ok++;
        } catch (e) {
          failures.push(
            `row ${i + 2}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      setResult(
        `Imported ${ok}/${rows.length} rows${failures.length ? `. Failures: ${failures.slice(0, 5).join("; ")}${failures.length > 5 ? ` (+${failures.length - 5} more)` : ""}` : ""}`,
      );
      if (ok > 0) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer
      title={`Import ${resource.label} List`}
      onClose={onClose}
      onSubmit={doImport}
      busy={busy}
      disabled={!file || !resource.createPath}
      submitLabel="Import"
    >
      {error ? <Alert>{error}</Alert> : null}
      {result ? <Alert variant="success">{result}</Alert> : null}
      <div
        style={{ fontSize: 13, color: "var(--fg-subtle)", marginBottom: 12 }}
      >
        <div
          style={{ fontWeight: 600, color: "var(--fg-base)", marginBottom: 4 }}
        >
          Upload a CSV file
        </div>
        Column headers must match the template below. You will create one{" "}
        {singular(resource.label).toLowerCase()} per row.
      </div>
      <FileField
        file={file}
