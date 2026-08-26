import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Badge, fmtCell } from "@/widgets/ui/surfaces";
import { Alert, RowMenu, Spinner } from "@/widgets/ui/primitives";
import { DataTable, TablePager, useTablePaging } from "@/widgets/table";
import {
  CheckListField,
  DateTimeField,
  FormDrawer,
  FormGrid,
  NumberField,
  TextAreaField,
  TextField,
  toggleInList,
} from "@/widgets/form";
import { DetailSection, JsonSection, KV } from "@/widgets/detail/detail-section";
import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { requestConfirm, useConfirm } from "@/widgets/confirm";

const toISO = (v: string) => (v.trim() ? new Date(v).toISOString() : null);

function fmtDate(iso?: string) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CampaignDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState<null | "edit" | "promotions">(null);

  function load() {
    setErr(null);
    api<{ campaign: any }>(`/admin/campaigns/${id}`)
      .then((d) => setCampaign(d.campaign))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({
        description: `Delete campaign ${campaign?.name ?? id}? Promotions stay but are detached.`,
      }))
    )
      return;
    setBusy(true);
    try {
      await api(`/admin/campaigns/${id}`, { method: "DELETE" });
      navigate("/r/campaigns");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const promos: any[] = campaign?.promotions ?? [];
  const paging = useTablePaging(promos, { resetKey: id });
  const budget = campaign?.budget ?? {};
  const isActive = !campaign?.deleted_at;

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <Link
          to="/r/campaigns"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Campaigns
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {campaign?.name ?? id}
        </span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!campaign && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {campaign ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection
              title={campaign.name}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge value={isActive ? "Active" : "Inactive"} />
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setDrawer("edit") },
                      { label: "Delete", danger: true, onClick: del },
                    ]}
                  />
                </div>
              }
            >
              <KV
                rows={[
                  [
                    "Identifier",
                    <span key="i" className="mono">
                      {fmtCell(campaign.campaign_identifier ?? campaign.id)}
                    </span>,
                  ],
                  ["Description", fmtCell(campaign.description)],
                ]}
              />
            </DetailSection>

            <DetailSection
              title="Promotions"
              action={
                <button
                  className="btn btn-secondary"
                  onClick={() => setDrawer("promotions")}
                >
                  Add
                </button>
              }
            >
              <DataTable
                rows={paging.pageRows}
                columns={[
                  {
                    key: "code",
                    label: "Code",
                    render: (p: any) => (
                      <Link
                        to={`/r/promotions/${p.id}`}
                        style={{
                          color: "var(--fg-interactive)",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        {fmtCell(p.code)}
                      </Link>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (p: any) => <Badge value={p.status} />,
                  },
                ]}
                rowKey={(p: any) => p.id}
                rowActions={(p: any) => [
                  {
                    label: "Remove",
                    danger: true,
                    onClick: () => detachPromo(id, p.id, load, setErr),
                  },
                ]}
                emptyTitle="No records"
                emptyHint="There are no promotions in the campaign."
              />
              {promos.length > 0 ? (
                <TablePager
                  page={paging.page}
                  limit={paging.limit}
                  count={paging.total}
                  onPage={paging.setPage}
                />
              ) : null}
            </DetailSection>

            <EditableMetadata metadata={campaign?.metadata} path={`/admin/campaigns/${id}`} onSaved={load} />

            <JsonSection data={campaign} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection title="Configuration">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <div
                  className="card"
                  style={{
                    padding: "10px 12px",
                    borderLeft: "2px solid var(--fg-muted)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                    Start date
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {fmtDate(campaign.starts_at)}
                  </div>
                </div>
                <div
                  className="card"
                  style={{
                    padding: "10px 12px",
                    borderLeft: "2px solid #f59e0b",
                  }}
                >
                  <div style={{ fontSize: 12, color: "var(--fg-subtle)" }}>
                    End date
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>
                    {fmtDate(campaign.ends_at)}
                  </div>
                </div>
              </div>
              <KV
                rows={[
                  [
                    "Currency",
