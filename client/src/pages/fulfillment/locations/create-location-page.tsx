import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/shared/api/client";
import { Alert } from "@/widgets/ui/primitives";
import { FormActions, FormSection } from "@/widgets/form";
import { WizardShell } from "@/widgets/wizard/wizard-shell";
import { useLeaveGuard } from "@/shared/hooks/use-leave-guard";
import { AddressFields, addressErrors, addressPayload, blankAddress } from "@/pages/fulfillment/locations/location-drawers";

const LIST = "/settings/stock-locations";

// Lupus "Create Stock Location": name and a full address, all on one screen.
export function CreateLocationPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [address, setAddress] = useState(blankAddress());
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errors = addressErrors(name, address);
  const invalid = !!(errors.name || errors.address_1 || errors.country_code);
  const dirty = name.trim() !== "" || Object.values(address).some((v) => v !== "");
  const leave = useLeaveGuard(dirty, LIST, busy);

  async function save() {
    if (invalid) {
      setShow(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ stock_location: { id: string } }>("/admin/stock-locations", {
        method: "POST",
        body: { name: name.trim(), address: addressPayload(address) },
      });
      navigate(`${LIST}/${res.stock_location.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <WizardShell
      tabs={[]}
      tab=""
      onTab={() => {}}
      closeTo={LIST}
      onRequestClose={() => void leave()}
      footer={<FormActions onCancel={() => void leave()} onSubmit={save} submitLabel="Save" busy={busy} />}
    >
      {err ? <Alert>{err}</Alert> : null}
      <FormSection title="Create Stock Location" subtitle="A stock location is a physical site where products are stored and shipped from.">
        <AddressFields name={name} onName={setName} value={address} onChange={setAddress} errors={show ? errors : undefined} />
      </FormSection>
    </WizardShell>
  );
}
