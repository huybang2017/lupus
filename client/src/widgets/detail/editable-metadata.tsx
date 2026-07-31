import { useState } from "react";
import { api } from "@/shared/api/client";
import { MetadataSection } from "@/widgets/detail/detail-section";
import { MetadataDrawer } from "@/widgets/detail/metadata-drawer";

/** The Metadata card with Lupus's edit drawer: saves `{ metadata }` to the entity's update route. */
export function EditableMetadata({ metadata, path, onSaved }: { metadata: Record<string, unknown> | null | undefined; path: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MetadataSection metadata={metadata} onEdit={() => setOpen(true)} />
      {open ? (
        <MetadataDrawer
          metadata={metadata}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
          save={async (next) => {
            await api(path, { method: "POST", body: { metadata: next } });
          }}
        />
      ) : null}
    </>
  );
}
