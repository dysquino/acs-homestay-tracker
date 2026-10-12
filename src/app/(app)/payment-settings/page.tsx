import { PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { getPaymentConfig } from "@/lib/data/payment-config";

import { PaymentSettingsForm } from "./payment-settings-form";

// `getPaymentConfig` reads the access cookie; the page is per-request.
export const dynamic = "force-dynamic";

/**
 * Owner-only page that edits the InstaPay bank details shown on /book.
 * The QR image itself isn't editable here — it's a static asset at
 * /public/qr-code.JPG (replace the file to update).
 */
export default async function PaymentSettingsPage() {
  const config = await getPaymentConfig();

  return (
    <>
      <PageHeader
        title="Payment settings"
        description="Bank details shown to guests on /book for paying via InstaPay."
      />
      <Card className="max-w-xl">
        <PaymentSettingsForm initial={config} />
      </Card>
    </>
  );
}