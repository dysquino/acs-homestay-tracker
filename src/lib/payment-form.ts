/**
 * Validation for the booking-payment form.
 *
 * Lives apart from the component so the rules can be tested directly, and so
 * the one rule that is easy to get wrong — the payment screenshot — is stated
 * in exactly one place.
 *
 * The screenshot rule only applies to a NEW payment. An edit has no upload
 * field (the proof is managed from the payment details below the form), so
 * requiring one there blocked every edit before it reached the server: the
 * form bailed out on a rule it could never satisfy, and the message it set was
 * never rendered on that branch. The owner saw a button that did nothing.
 */

export type PaymentFormState = {
  amount: string;
  receivedDate: string;
};

export type PaymentFormErrors = Partial<Record<keyof PaymentFormState, string>>;

export type PaymentFormValidation = {
  /** Per-field messages, keyed by field. */
  errors: PaymentFormErrors;
  /** Set when a new payment is missing its receipt. */
  screenshotError: string | null;
  /** Whether the form may be submitted. */
  ok: boolean;
};

export function validatePaymentForm(
  form: PaymentFormState,
  options: {
    /** True when editing an existing payment (no upload field is shown). */
    isEditing: boolean;
    /** Whether a screenshot has been attached in this session. */
    hasScreenshot: boolean;
  },
): PaymentFormValidation {
  const errors: PaymentFormErrors = {};
  if (form.amount === "" || Number(form.amount) <= 0) {
    errors.amount = "Enter an amount greater than zero.";
  }
  if (!form.receivedDate) errors.receivedDate = "Received date is required.";

  // Only a new payment needs a receipt. An existing one already has its proof
  // on file; the edit form points at it rather than asking for it again.
  const screenshotError =
    !options.isEditing && !options.hasScreenshot
      ? "A payment screenshot is required."
      : null;

  return {
    errors,
    screenshotError,
    ok: Object.keys(errors).length === 0 && screenshotError === null,
  };
}
