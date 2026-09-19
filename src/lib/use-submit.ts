import { useCallback, useRef, useState } from "react";

/**
 * Guards a form's submit against double-clicks and Enter-mashing: while one
 * save is in flight, further submits are ignored (a second one would create
 * a duplicate record). `saving` drives the button's disabled/label state.
 *
 * Lives in the component that owns the submit button (the modal footer sits
 * outside the <form>), and is handed down to the fields component.
 */
export function useSubmit() {
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (task: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await task();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }, []);

  return { saving, run };
}

export type Submit = ReturnType<typeof useSubmit>;
