import { PageHeader } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { GuestMessageSettings } from "@/components/settings/guest-message-settings";
import { getPaymentConfig } from "@/lib/data/payment-config";
import { listStayPreparation } from "@/lib/data/stay-preparation";

import { PaymentSettingsForm } from "./payment-settings-form";

// `getPaymentConfig` reads the access cookie; the page is per-request.
export const dynamic = "force-dynamic";

/**
 * Owner-only settings hub for guest-facing payment and stay-message details.
 */
export default async function PaymentSettingsPage() {
  const [config, stayPreparation] = await Promise.all([
    getPaymentConfig(),
    listStayPreparation(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage payments and the reusable details sent to guests."
      />

      <div className="space-y-8">
        <section id="payments" className="scroll-mt-24">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Payments</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Pricing, bank details, required booking attachments, and reconciliation.
            </p>
          </div>
          <Card className="max-w-xl">
            <PaymentSettingsForm initial={config} />
          </Card>
        </section>

        <section id="guest-messages" className="scroll-mt-24">
          <div className="mb-3">
            <h2 className="text-lg font-semibold text-slate-900">Guest messages</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Standard stay details and reusable messages for upcoming bookings.
            </p>
          </div>
          <Card className="max-w-3xl">
            <GuestMessageSettings initial={stayPreparation} />
          </Card>
        </section>
      </div>
    </>
  );
}
