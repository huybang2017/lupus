import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { requestConfirm } from "@/widgets/confirm/confirm-provider";

/**
 * Lupus's "Are you sure you want to leave this form?" guard, plus Escape to leave.
 * Returns the function to call from Cancel / the close button.
 */
export function useLeaveGuard(dirty: boolean, to: string, busy = false) {
  const navigate = useNavigate();
  async function leave() {
    if (busy) return;
    if (dirty) {
      const ok = await requestConfirm({
        title: "Are you sure you want to leave this form?",
        description: "You have unsaved changes that will be lost if you exit this form.",
        confirmLabel: "Continue",
        cancelLabel: "Cancel",
        variant: "primary",
      });
      if (!ok) return;
    }
    navigate(to);
  }
  const ref = useRef(leave);
  ref.current = leave;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // a picker drawer / dialog / dropdown handles its own Escape
      if (document.querySelector('.confirm-back, .modal-back, [role="listbox"]')) return;
      void ref.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return leave;
}
