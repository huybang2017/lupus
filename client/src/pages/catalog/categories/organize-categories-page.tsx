import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { parseList } from "@/shared/api/list";
import { Alert, Spinner } from "@/widgets/ui/primitives";
import { WizardShell } from "@/widgets/wizard/wizard-shell";

interface Category {
  id: string;
  name: string;
  rank?: number;
  parent_category_id?: string | null;
}

// Depth-first list: each parent followed by its children, siblings ordered by rank.
function flatten(rows: Category[]): { cat: Category; depth: number }[] {
  const byParent = new Map<string, Category[]>();
  for (const c of rows) {
    const key = c.parent_category_id ?? "";
    byParent.set(key, [...(byParent.get(key) ?? []), c]);
  }
  const out: { cat: Category; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    const kids = (byParent.get(parent) ?? []).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    for (const k of kids) {
      out.push({ cat: k, depth });
      walk(k.id, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

// Lupus Categories > Organize: a full-screen ranking list. Dragging a row onto a sibling
// reorders it and saves immediately (no Save button), like the original.
export function OrganizeCategoriesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Category[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/admin/product-categories?limit=100&offset=0")
      .then((d) => setItems(parseList<Category>(d, 200).items))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") navigate("/r/categories");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  async function drop(targetId: string) {
    const dragged = items?.find((c) => c.id === dragId);
    const target = items?.find((c) => c.id === targetId);
    setDragId(null);
    setOverId(null);
    if (!items || !dragged || !target || dragged.id === target.id) return;
    // Only siblings can swap places; the tree structure itself is edited from the category.
    if ((dragged.parent_category_id ?? "") !== (target.parent_category_id ?? "")) return;

    const group = items
      .filter((c) => (c.parent_category_id ?? "") === (dragged.parent_category_id ?? ""))
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    const next = group.filter((c) => c.id !== dragged.id);
    next.splice(next.findIndex((c) => c.id === target.id) + (group.indexOf(dragged) < group.indexOf(target) ? 1 : 0), 0, dragged);
    const ranked = new Map(next.map((c, i) => [c.id, i]));
    const before = items;
    setItems(items.map((c) => (ranked.has(c.id) ? { ...c, rank: ranked.get(c.id) } : c)));

    setSaving(true);
    setErr(null);
    try {
      for (const c of next) {
        const rank = ranked.get(c.id)!;
        if ((c.rank ?? 0) !== rank) {
          await api(`/admin/product-categories/${c.id}`, { method: "POST", body: { rank } });
        }
      }
    } catch (e) {
      setItems(before);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const rows = items ? flatten(items) : [];

  return (
    <WizardShell tabs={[]} tab="" onTab={() => {}} closeTo="/r/categories" wide>
      {err ? <Alert>{err}</Alert> : null}
      {!items && !err ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spinner size={22} />
        </div>
      ) : null}
      {items && rows.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--fg-subtle)", fontSize: 13 }}>
          No categories yet
        </div>
      ) : null}
      <div style={{ opacity: saving ? 0.7 : 1 }}>
        {rows.map(({ cat, depth }) => (
          <div
            key={cat.id}
            draggable
            onDragStart={() => setDragId(cat.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(cat.id);
            }}
            onDrop={() => void drop(cat.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 28,
              height: 49,
              padding: `0 24px 0 ${36 + depth * 28}px`,
              borderBottom: "1px solid var(--card-border)",
              background: dragId === cat.id ? "var(--hover-bg)" : "transparent",
              boxShadow: overId === cat.id && dragId !== cat.id ? "inset 0 2px 0 var(--fg-interactive)" : "none",
              fontSize: 13,
              color: "var(--fg-base)",
              cursor: "grab",
            }}
          >
            <span title="Drag to reorder" style={{ color: "var(--fg-muted)", userSelect: "none", width: 16 }}>
              ⠿
            </span>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#6366f1" aria-hidden>
              <path d="M1.5 2.5A1 1 0 0 1 2.5 1.5h5.1a1 1 0 0 1 .7.3l6 6a1 1 0 0 1 0 1.4l-5.1 5.1a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1-.3-.7V2.5Zm3 1.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
            </svg>
            <span>{cat.name}</span>
          </div>
        ))}
      </div>
    </WizardShell>
  );
}
