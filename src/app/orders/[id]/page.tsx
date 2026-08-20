import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RescheduleForm } from "@/components/RescheduleForm";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let user;
  try {
    user = await requireActiveUser();
  } catch (error) {
    if (error instanceof AuthError) redirect(`/login?next=/orders/${params.id}`);
    throw error;
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      pickupZone: { select: { code: true, name: true } },
      dropZone: { select: { code: true, name: true } },
      customer: { select: { id: true, name: true, email: true } },
      assignedAgent: {
        select: { employeeCode: true, userId: true, user: { select: { name: true } } },
      },
      attempts: {
        orderBy: { attemptNumber: "asc" },
        include: {
          agent: {
            select: { employeeCode: true, user: { select: { name: true } } },
          },
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true, email: true } } },
      },
    },
  });

  if (!order) notFound();

  const isOwner = order.customerId === user.id;
  const isAssignedAgent = order.assignedAgent?.userId === user.id;
  if (user.role !== "ADMIN" && !isOwner && !isAssignedAgent) {
    redirect("/forbidden");
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 border-b border-gray-200 pb-4 dark:border-gray-800">
        <h1 className="font-mono text-xl font-semibold">{order.orderNumber}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {order.status} · {order.orderType} · {order.paymentType} ·{" "}
          {order.pickupZone.code} → {order.dropZone.code} ({order.scope})
        </p>
        <nav className="mt-3 text-sm">
          <Link href="/orders" className="text-gray-600 underline-offset-4 hover:underline dark:text-gray-400">
            Back to orders
          </Link>
        </nav>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-2 text-sm font-medium">Pickup</h2>
          <p className="text-sm">{order.pickupContactName} · {order.pickupPhone}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {order.pickupAddressLine1}
            {order.pickupAddressLine2 ? `, ${order.pickupAddressLine2}` : ""},{" "}
            {order.pickupCity} {order.pickupPincode}
          </p>
        </section>

        <section className="rounded border border-gray-200 p-4 dark:border-gray-800">
          <h2 className="mb-2 text-sm font-medium">Drop</h2>
          <p className="text-sm">{order.dropContactName} · {order.dropPhone}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {order.dropAddressLine1}
            {order.dropAddressLine2 ? `, ${order.dropAddressLine2}` : ""},{" "}
            {order.dropCity} {order.dropPincode}
          </p>
        </section>
      </div>

      <section className="mt-6 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-medium">Charge</h2>
        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
          Snapshotted at creation, so a later rate-card change never rewrites
          what was charged.
        </p>
        <Row label="Actual weight" value={`${order.actualWeightKg.toString()} kg`} />
        <Row
          label={`Volumetric weight (÷${order.volumetricDivisor})`}
          value={`${order.volumetricWeightKg.toString()} kg`}
        />
        <Row label="Chargeable weight" value={`${order.chargeableWeightKg.toString()} kg`} />
        <Row label="Freight" value={order.freightCharge.toString()} />
        <Row label="COD surcharge" value={order.codSurcharge.toString()} />
        <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-800">
          <Row label="Total" value={order.totalCharge.toString()} />
        </div>
        {order.codAmount ? (
          <Row label="Collect from consignee" value={order.codAmount.toString()} />
        ) : null}
      </section>

      <section className="mt-6 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-1 text-sm font-medium">Assignment</h2>
        <p className="text-sm">
          {order.assignedAgent
            ? `${order.assignedAgent.user.name} (${order.assignedAgent.employeeCode})`
            : "Not yet assigned — an admin will assign an agent."}
        </p>
      </section>

      {order.status === "FAILED" && (isOwner || user.role === "ADMIN") ? (
        <div className="mt-6">
          <RescheduleForm
            orderId={order.id}
            failureReason={
              [...order.attempts]
                .reverse()
                .find((attempt) => attempt.failureReason)?.failureReason ?? null
            }
          />
        </div>
      ) : null}

      <section className="mt-6 rounded border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="mb-2 text-sm font-medium">
          Delivery attempts ({order.attempts.length})
        </h2>
        <ol className="flex flex-col gap-2 text-sm">
          {order.attempts.map((attempt) => (
            <li key={attempt.id} className="flex flex-wrap justify-between gap-2">
              <span>
                Attempt {attempt.attemptNumber} —{" "}
                <span className="font-mono text-xs">{attempt.status}</span>
                {attempt.agent ? ` · ${attempt.agent.user.name}` : ""}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                {attempt.scheduledFor
                  ? attempt.scheduledFor.toISOString().slice(0, 10)
                  : "as soon as possible"}
                {attempt.failureReason ? ` · ${attempt.failureReason}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-sm font-medium">History</h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Append-only. A correction is recorded as a new entry; nothing here is
          ever edited or removed.
        </p>
        <ol className="flex flex-col gap-3">
          {order.statusHistory.map((entry) => (
            <li
              key={entry.id}
              className="rounded border border-gray-200 p-3 text-sm dark:border-gray-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs">
                  {entry.fromStatus ? `${entry.fromStatus} → ` : ""}
                  {entry.status}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {entry.createdAt.toISOString()}
                </span>
              </div>
              {entry.note ? (
                <p className="mt-1 text-gray-700 dark:text-gray-300">{entry.note}</p>
              ) : null}
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {entry.actor ? `${entry.actor.name} (${entry.actorRole})` : entry.actorRole}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
