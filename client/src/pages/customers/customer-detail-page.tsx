import { EditableMetadata } from "@/widgets/detail/editable-metadata";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Badge, fmtCell } from "@/widgets/ui/surfaces";
import {
  Alert,
  EmptyState,
  RowMenu,
  Spinner,
} from "@/widgets/ui/primitives";
import {
  DetailSection,
  JsonSection,
  KV,
  MetadataSection,
} from "@/widgets/detail/detail-section";
import { ResourceForm } from "@/pages/resource/resource-form";
import { CustomerGroupsSection, CustomerOrdersSection } from "@/pages/customers/customer-sections";
import { getResource } from "@/entities/resources";
import { DataTable, TablePager, useTablePaging } from "@/widgets/table";
import type { TableColumn } from "@/widgets/table";
import { useConfirm } from "@/widgets/confirm";

export function CustomerDetailPage() {
  const confirm = useConfirm();
  const { id = "" } = useParams<{ slug: string; id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const customersRes = getResource("customers");

  function load() {
    setErr(null);
    api<{ customer: any }>(`/admin/customers/${id}`)
      .then((d) => setCustomer(d.customer))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del() {
    if (
      !(await confirm({
        description: `Delete customer ${customer?.email ?? id}?`,
      }))
    )
      return;
    try {
      await api(`/admin/customers/${id}`, { method: "DELETE" });
      navigate("/r/customers");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeAddress(addressId: string) {
    if (!(await confirm({ description: "Delete this address?" }))) return;
    await api(`/admin/customers/${id}/addresses/${addressId}`, {
      method: "DELETE",
    })
      .then(load)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }

  const name = [customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .join(" ");
  const title = customer ? (customer.email ?? name ?? id) : id;
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
          to="/r/customers"
          style={{
            color: "var(--fg-subtle)",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          Customers
        </Link>
        <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>â€º</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      </div>

      {err ? <Alert>{err}</Alert> : null}
      {!customer && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Spinner size={22} />
        </div>
      ) : null}

      {customer ? (
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
              title={title}
              action={
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge value={customer.has_account ? "Customer" : "Guest"} />
                  <RowMenu
                    items={[
                      { label: "Edit", onClick: () => setEditing(true) },
                      { label: "Delete", danger: true, onClick: del },
                    ]}
                  />
                </div>
              }
            >
              <KV
                rows={[
                  ["Name", fmtCell(name)],
                  ["Company", fmtCell(customer.company_name)],
                  ["Phone", fmtCell(customer.phone)],
                ]}
              />
            </DetailSection>

            <CustomerOrdersSection customerId={customer.id} />

            <CustomerGroupsSection customer={customer} onChanged={load} />

            <EditableMetadata metadata={customer.metadata} path={`/admin/customers/${id}`} onSaved={load} />

            <JsonSection data={customer} />
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              minWidth: 0,
            }}
          >
            <DetailSection
              title="Addresses"
              action={
                <button
                  className="btn btn-secondary"
                  onClick={() => navigate(`/r/customers/${id}/create-address`)}
                >
                  Add
                </button>
              }
            >
              {(customer.addresses ?? []).length === 0 ? (
                <EmptyState
                  title="No records"
                  hint="There are no records to show"
                />
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {(customer.addresses ?? []).map((a: any) => (
                    <div
                      key={a.id}
                      className="card"
                      style={{ padding: "10px 14px", fontSize: 13 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <strong>
                          {a.address_name ||
                            [a.first_name, a.last_name].filter(Boolean).join(" ") ||
                            "â€“"}
                        </strong>
                        <button
                          className="btn btn-danger"
                          onClick={() => removeAddress(a.id)}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{ color: "var(--fg-subtle)", marginTop: 4 }}>
                        {[
                          a.address_1,
                          a.address_2,
                          a.city,
                          a.province,
                          a.postal_code,
                          a.country_code,
                        ]
                          .filter(Boolean)
                          .join(", ") || "â€“"}
                      </div>
                      {a.phone ? (
                        <div style={{ color: "var(--fg-subtle)" }}>
                          {a.phone}
                        </div>
                      ) : null}
                      {a.company ? (
                        <div style={{ color: "var(--fg-subtle)" }}>
                          {a.company}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        </div>
      ) : null}

      {editing && customersRes ? (
        <ResourceForm
          resource={customersRes}
          mode="edit"
          initial={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
