import { useState } from "react";
import { api } from "@/shared/api/client";
import { toISO } from "@/shared/utils/form-utils";
import {
  DateTimeField,
  FormDrawer,
  RadioGroupField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/widgets/form";
import { CustomerAvailabilityField, type Group } from "@/pages/pricing/price-lists/customer-availability";

const REQUIRED = "Too small: expected string to have >=1 characters";

/** `<input type="datetime-local">` wants local time; the API speaks UTC ISO strings. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Lupus "Edit Price List": type, title, status and description (all required).
export function EditPriceListDrawer({
  list,
  onClose,
  onSaved,
}: {
  list: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<string>(list.type ?? "sale");
  const [title, setTitle] = useState<string>(list.title ?? "");
  const [status, setStatus] = useState<string>(list.status ?? "active");
  const [description, setDescription] = useState<string>(list.description ?? "");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titleError = title.trim() === "" ? REQUIRED : undefined;
  const descriptionError = description.trim() === "" ? REQUIRED : undefined;

  async function save() {
    if (titleError || descriptionError) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/admin/price-lists/${list.id}`, {
        method: "POST",
        body: { type, title: title.trim(), status, description: description.trim() },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Price List" onClose={onClose} onSubmit={save} busy={busy} error={err}>
      <RadioGroupField
        label="Type"
        hint="Choose the type of price list you want to create."
        value={type}
        onChange={setType}
        cols={1}
        options={[
          { id: "sale", label: "Sale", hint: "Sale prices are temporary price changes for products." },
          { id: "override", label: "Override", hint: "Overrides are usually used to create customer-specific prices." },
        ]}
      />
      <TextField label="Title" value={title} onChange={setTitle} error={show ? titleError : undefined} />
      <SelectField
        label="Status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "active", label: "Active" },
          { value: "draft", label: "Draft" },
        ]}
      />
      <TextAreaField
        label="Description"
        rows={4}
        value={description}
        onChange={setDescription}
        error={show ? descriptionError : undefined}
      />
    </FormDrawer>
  );
}

// Lupus "Edit Configuration": start / expiry dates and the customer groups the list applies to.
export function EditConfigurationDrawer({
  list,
  onClose,
  onSaved,
}: {
  list: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startsAt, setStartsAt] = useState(toLocalInput(list.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(list.ends_at));
  const [groups, setGroups] = useState<Group[]>(
    (list.customer_groups ?? []).map((g: any) => ({ id: g.id, name: g.name ?? g.id })),
  );
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endsError =
    startsAt && endsAt && new Date(endsAt) <= new Date(startsAt) ? "The end date must be after the start date" : undefined;

  async function save() {
    if (endsError) return;
    setBusy(true);
    setErr(null);
    try {
      // `rules` is replaced as a whole, so any other rule on the list is carried over
      const rules = { ...(list.rules ?? {}) } as Record<string, unknown>;
      if (groups.length) rules["customer.groups.id"] = groups.map((g) => g.id);
      else delete rules["customer.groups.id"];
      await api(`/admin/price-lists/${list.id}`, {
        method: "POST",
        body: { starts_at: toISO(startsAt), ends_at: toISO(endsAt), rules },
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDrawer title="Edit Configuration" onClose={() => (picking ? undefined : onClose())} onSubmit={save} busy={busy} error={err} disabled={!!endsError}>
      <DateTimeField
        label="Price list has a start date?"
        optional
        hint="Schedule the price list to activate in the future."
        value={startsAt}
        onChange={setStartsAt}
      />
      <DateTimeField
        label="Price list has an expiry date?"
        optional
        hint="Schedule the price list to deactivate in the future."
        value={endsAt}
        onChange={setEndsAt}
        error={endsError}
      />
      <CustomerAvailabilityField groups={groups} onChange={setGroups} onPickerOpenChange={setPicking} compact />
    </FormDrawer>
  );
}
