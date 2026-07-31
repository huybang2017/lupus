import { useState, type JSX } from "react";
import { EmptyState } from "@/widgets/ui/primitives";

export interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  amount?: string;
  at: string;
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = Math.floor(Math.max(0, Date.now() - t) / 1000);
  if (seconds < 60) return "less than a minute ago";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

function TimelineRow({ event, last }: { event: TimelineEvent; last: boolean }) {
  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "20px minmax(0, 1fr)" }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--fg-muted)",
            marginTop: 4,
            flexShrink: 0,
          }}
        />
        {last ? null : (
          <span
            style={{
              width: 1,
              flex: 1,
              minHeight: 16,
              background: "var(--card-border)",
            }}
          />
        )}
      </div>
      <div style={{ minWidth: 0, paddingBottom: last ? 0 : 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              minWidth: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--fg-base)",
            }}
          >
            {event.title}
          </div>
          <div
            style={{
              flexShrink: 0,
              whiteSpace: "nowrap",
              fontSize: 12,
              color: "var(--fg-muted)",
            }}
          >
            {timeAgo(event.at)}
          </div>
        </div>
        {event.description || event.amount ? (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 2,
            }}
          >
            {event.description ? (
              <div
                style={{ minWidth: 0, fontSize: 12, color: "var(--fg-subtle)" }}
              >
                {event.description}
              </div>
            ) : (
              <span />
            )}
            {event.amount ? (
              <div
                style={{
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--fg-base)",
                }}
              >
                {event.amount}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Timeline(props: {
  events: TimelineEvent[];
  emptyTitle?: string;
  emptyHint?: string;
  moreLabel?: (count: number) => string;
}): JSX.Element {
  const { events, emptyTitle, emptyHint, moreLabel } = props;
  const [expanded, setExpanded] = useState(false);
  const label =
    moreLabel ?? ((count: number) => `Show ${count} more activities`);
  if (events.length === 0)
    return <EmptyState title={emptyTitle ?? "No activity"} hint={emptyHint} />;
  if (events.length > 3 && !expanded) {
    const hidden = events.length - 3;
    const head = events.slice(0, 2);
    const tail = events[events.length - 1];
    return (
      <div>
        {head.map((event) => (
          <TimelineRow key={event.id} event={event} last={false} />
        ))}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "20px minmax(0, 1fr)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                width: 1,
                flex: 1,
                minHeight: 20,
                borderLeft: "1px dashed var(--card-border)",
              }}
            />
          </div>
          <div style={{ paddingBottom: 16 }}>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                background: "var(--card-bg)",
                border: "1px dashed var(--card-border)",
                borderRadius: 8,
                color: "var(--fg-subtle)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 12px",
              }}
            >
              {label(hidden)}
            </button>
          </div>
        </div>
        <TimelineRow event={tail} last />
      </div>
    );
  }
  return (
    <div>
      {events.map((event, index) => (
        <TimelineRow
          key={event.id}
          event={event}
          last={index === events.length - 1}
        />
      ))}
    </div>
  );
}
