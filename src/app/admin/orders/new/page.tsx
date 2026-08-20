import { OrderForm } from "@/components/OrderForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Admin "create on behalf of" flow. The customer list is loaded server-side and
 * filtered in the browser — at this scale that is one query instead of one per
 * keystroke, and the picker stays responsive.
 */
export default async function AdminNewOrderPage() {
  const customers = await prisma.user.findMany({
    where: { role: "CUSTOMER", isActive: true },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true, email: true },
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">New order for a customer</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Same pricing and confirmation as the customer flow — the order is
          recorded against the customer you select, and the history records that
          you created it.
        </p>
      </div>
      <OrderForm createdBy="ADMIN" customers={customers} />
    </section>
  );
}
