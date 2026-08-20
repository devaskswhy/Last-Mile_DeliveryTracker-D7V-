import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { RescheduleForm } from "@/components/RescheduleForm";
import {
  StatusStepper,
  StatusTimeline,
  type TimelineRow,
} from "@/components/StatusTimeline";
import { Panel, Tag } from "@/components/ui";
import { AuthError, requireActiveUser } from "@/lib/auth/guard";
import type { OrderStatus } from "@/lib/domain/enums";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-caption text-ink-muted">{label}</span>
      <span className="font-mono text-caption text-ink-bright">{value}</span>
    </div>
  );
}

/** Tracking view: stepper, itemised charge, attempts, and the full audit trail. */
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
          agent: { select: { employeeCode: true, user: { select: { name: true } } } },
        },
      },
      statusHistory: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true } } },
      },
    },
  });

  if (!order) notFound();

  const isOwner = order.customerId === user.id;
  const isAssignedAgent = order.assignedAgent?.userId === user.id;
  if (user.role !== "ADMIN" && !isOwner && !isAssignedAgent) {
    redirect("/forbidden");
  }

  // The stepper is driven by statuses the order genuinely held, read from the
  // audit trail — not inferred from the current status, so a stop that was
  // skipped is never shown as completed.
  const reached = [
    ...new Set(order.statusHistory.map((entry) => entry.status)),
  ] as OrderStatus[];

  const timeline: TimelineRow[] = order.statusHistory.map((entry) => ({
    id: entry.id,
    status: entry.status,
    fromStatus: entry.fromStatus,
    note: entry.note,
    at: entry.createdAt.toISOString(),
    actorName: entry.actor?.name ?? null,
    actorRole: entry.actorRole,
  }));

  const latestFailure = [...order.attempts]
    .reverse()
    .find((attempt) => attempt.failureReason)?.failureReason;

  return (
    <AppShell role={user.role} email={user.email}>
      <div className="flex flex-col gap-8">
        <div>
          <Link
            href="/orders"
            className="text-caption text-ink-muted underline-offset-4 hover:text-signal hover:underline"
          >
            ← All orders
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-headline text-ink-bright">
              {order.orderNumber}
            </h1>
            <Tag active={order.status === "DELIVERED"}>{order.status}</Tag>
          </div>
          <p className="mt-2 text-body text-ink-muted">
            {order.pickupZone.code} → {order.dropZone.code} · {order.scope} ·{" "}
            {order.orderType} · {order.paymentType}
          </p>
        </div>

        <Panel>
          <StatusStepper status={order.status} reachedStatuses={reached} />
        </Panel>

        {order.status === "FAILED" && (isOwner || user.role === "ADMIN") ? (
          <RescheduleForm
            orderId={order.id}
            failureReason={latestFailure ?? null}
          />
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <Panel>
            <p className="mb-3 text-eyebrow uppercase text-ink-muted">Pickup</p>
            <p className="text-body text-ink-bright">
              {order.pickupContactName}
            </p>
            <p className="mt-1 text-caption text-ink-muted">
              {order.pickupPhone}
            </p>
            <p className="mt-2 text-caption text-ink-muted">
              {order.pickupAddressLine1}
              {order.pickupAddressLine2 ? `, ${order.pickupAddressLine2}` : ""},{" "}
              {order.pickupCity} {order.pickupPincode}
            </p>
          </Panel>

          <Panel>
            <p className="mb-3 text-eyebrow uppercase text-ink-muted">Drop</p>
            <p className="text-body text-ink-bright">{order.dropContactName}</p>
            <p className="mt-1 text-caption text-ink-muted">{order.dropPhone}</p>
            <p className="mt-2 text-caption text-ink-muted">
              {order.dropAddressLine1}
              {order.dropAddressLine2 ? `, ${order.dropAddressLine2}` : ""},{" "}
              {order.dropCity} {order.dropPincode}
            </p>
          </Panel>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel>
            <p className="mb-1 text-eyebrow uppercase text-ink-muted">Charge</p>
            <p className="mb-4 text-[0.6875rem] text-ink-muted/70">
              Snapshotted at creation — a later rate-card change never rewrites
              what was charged.
            </p>
            <Row label="Actual weight" value={`${order.actualWeightKg} kg`} />
            <Row
              label={`Volumetric (÷${order.volumetricDivisor})`}
              value={`${order.volumetricWeightKg} kg`}
            />
            <Row label="Chargeable" value={`${order.chargeableWeightKg} kg`} />
            <div className="my-2 border-t border-ink-line" />
            <Row label="Freight" value={order.freightCharge.toString()} />
            <Row label="COD surcharge" value={order.codSurcharge.toString()} />
            <div className="my-2 border-t border-ink-line" />
            <div className="flex items-baseline justify-between gap-4 py-1">
              <span className="text-body text-ink-bright">Total</span>
              <span className="font-mono text-title text-signal">
                {order.totalCharge.toString()}
              </span>
            </div>
            {order.codAmount ? (
              <Row
                label="Collect from consignee"
                value={order.codAmount.toString()}
              />
            ) : null}
          </Panel>

          <Panel>
            <p className="mb-3 text-eyebrow uppercase text-ink-muted">
              Delivery attempts ({order.attempts.length})
            </p>
            <ol className="flex flex-col gap-3">
              {order.attempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink-line/60 pb-3 last:border-0 last:pb-0"
                >
                  <span className="text-caption text-ink-bright">
                    Attempt {attempt.attemptNumber} <Tag>{attempt.status}</Tag>
                    {attempt.agent ? (
                      <span className="ml-2 text-ink-muted">
                        {attempt.agent.user.name}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[0.6875rem] text-ink-muted">
                    {attempt.scheduledFor
                      ? attempt.scheduledFor.toISOString().slice(0, 10)
                      : "as soon as possible"}
                  </span>
                  {attempt.failureReason ? (
                    <p className="w-full text-caption text-ink-muted">
                      {attempt.failureReason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>

            <p className="mt-5 text-eyebrow uppercase text-ink-muted">Agent</p>
            <p className="mt-2 text-body text-ink-bright">
              {order.assignedAgent
                ? `${order.assignedAgent.user.name} (${order.assignedAgent.employeeCode})`
                : "Not yet assigned"}
            </p>
          </Panel>
        </div>

        <div>
          <p className="mb-1 text-eyebrow uppercase text-signal">History</p>
          <p className="mb-5 text-caption text-ink-muted">
            Append-only. A correction is a new entry; nothing here is ever
            edited or removed.
          </p>
          <Panel>
            <StatusTimeline rows={timeline} />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
