import Link from "next/link";

import { OrderForm } from "@/components/OrderForm";

export const dynamic = "force-dynamic";

export default function NewOrderPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 border-b border-gray-200 pb-4 dark:border-gray-800">
        <h1 className="text-xl font-semibold">New delivery order</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Enter the shipment, review the itemised charge, then confirm. Nothing
          is created until you confirm.
        </p>
        <nav className="mt-3 text-sm">
          <Link href="/orders" className="text-gray-600 underline-offset-4 hover:underline dark:text-gray-400">
            My orders
          </Link>
        </nav>
      </header>
      <OrderForm createdBy="CUSTOMER" />
    </main>
  );
}
