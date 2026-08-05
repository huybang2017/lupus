import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Drawer } from "@/widgets/ui/primitives";
import { Spinner, EmptyState, Alert } from "@/widgets/ui/primitives";

interface Notification {
  id: string;
  to_address?: string;
  channel?: string;
  template?: string;
  status?: string;
  created_at?: string;
  data?: any;
}

// Lupus-style right slide-over fed by GET /admin/notifications.
export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api("/admin/notifications?limit=50&offset=0")
      .then((d) => {
        if (alive) setItems(parseList<Notification>(d).items);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Drawer title="Notifications" onClose={onClose}>
      {err ? <Alert>{err}</Alert> : null}
      {items === null && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spinner size={20} />
        </div>
      ) : items && items.length === 0 ? (
        <div style={{ paddingTop: 60 }}>
          <div style={{ textAlign: "center", fontSize: 22, marginBottom: 8 }}>
            🔔
          </div>
          <EmptyState
            title="No notifications"
            hint="You don't have any notifications at the moment, but once you do they will live here."
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(items ?? []).map((n) => (
            <div key={n.id} className="card" style={{ padding: "12px 14px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {n.template ?? n.channel ?? "Notification"}
                </span>
                <span style={{ color: "var(--fg-muted)", fontSize: 12 }}>
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""}
                </span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-subtle)",
                  marginTop: 4,
                }}
              >
                {[
                  n.to_address ? `to ${n.to_address}` : null,
                  n.channel,
                  n.status,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
