import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { OrderForm } from "@/components/OrderForm";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  let user;
  try {
    user = await requireActiveUser();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?next=/orders/new");
    throw error;
  }

  if (user.role === "AGENT") redirect("/agent/orders");

  return (
    <AppShell role={user.role} email={user.email}>
      <div className="flex flex-col gap-8">
        <div className="max-w-prose">
          <p className="mb-3 text-eyebrow uppercase text-signal">New shipment</p>
          <h1 className="text-headline text-ink-bright">
            Price it, then confirm it.
          </h1>
          <p className="mt-3 text-body text-ink-muted">
            The quote updates as you fill in the parcel. Nothing is created
            until you confirm, and the server re-prices it at that moment.
          </p>
        </div>
        <OrderForm createdBy="CUSTOMER" />
      </div>
    </AppShell>
  );
}
