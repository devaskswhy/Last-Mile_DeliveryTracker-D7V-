import { Prisma } from "@prisma/client";

import type { Role } from "@/lib/auth/roles";
import type { OrderType, PaymentType } from "@/lib/domain/enums";
import { prisma } from "@/lib/prisma";
import {
  calculateRate,
  loadRateConfig,
  type RateQuote,
} from "@/lib/rate-engine";
import { equalsMoney } from "@/lib/rate-engine/decimal";

import { chooseAgentForZone, ASSIGNMENT_STRATEGY } from "./assignment";
import { appendStatusHistory } from "./history";
import { generateOrderNumber } from "./order-number";

export type OrderCreationErrorCode =
  /** The confirmed total no longer matches what the configuration produces. */
  | "QUOTE_STALE"
  | "CUSTOMER_NOT_FOUND"
  | "CUSTOMER_INACTIVE"
  | "ORDER_NUMBER_UNAVAILABLE";

export class OrderCreationError extends Error {
  readonly code: OrderCreationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: OrderCreationErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrderCreationError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, OrderCreationError.prototype);
  }
}

export interface AddressInput {
  contactName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  pincode: string;
}

export interface CreateOrderInput {
  customerId: string;
  pickup: AddressInput;
  drop: AddressInput;
  lengthCm: string;
  breadthCm: string;
  heightCm: string;
  actualWeightKg: string;
  orderType: OrderType;
  paymentType: PaymentType;
  /** Amount to collect from the consignee. Required for COD, absent otherwise. */
  codAmount?: string | null;
  notes?: string | null;
  /**
   * The total the customer was shown and confirmed. Required — it is what makes
   * confirmation explicit rather than a convention of whichever UI called this.
   */
  acknowledgedTotal: string;
}

export interface Actor {
  id: string;
  role: Role;
}

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  quote: RateQuote;
  assignment:
    | { assigned: true; agentId: string; agentName: string; employeeCode: string }
    | { assigned: false; reason: string };
}

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

/**
 * Creates an order from a confirmed quote.
 *
 * The price is **recomputed here** with the same `calculateRate` the quote
 * endpoint uses. The client's figure is never used as the price — only as a
 * claim to check against, so a tampered payload cannot set its own total, and a
 * rate card edited between quote and confirm cannot silently change what the
 * customer agreed to pay. A disagreement is refused with the fresh quote
 * attached so the caller can show the new number and ask again.
 */
export async function createOrder(
  input: CreateOrderInput,
  actor: Actor,
): Promise<CreateOrderResult> {
  const customer = await prisma.user.findUnique({
    where: { id: input.customerId },
    select: { id: true, role: true, isActive: true },
  });

  if (!customer) {
    throw new OrderCreationError(
      "CUSTOMER_NOT_FOUND",
      "That customer does not exist",
      { customerId: input.customerId },
    );
  }
  if (!customer.isActive) {
    throw new OrderCreationError(
      "CUSTOMER_INACTIVE",
      "That customer account is deactivated",
      { customerId: input.customerId },
    );
  }

  // --- Authoritative price ------------------------------------------------
  const config = await loadRateConfig(
    input.pickup.pincode,
    input.drop.pincode,
    input.orderType,
  );

  const quote = calculateRate(
    {
      pickupPincode: input.pickup.pincode,
      dropPincode: input.drop.pincode,
      dimensionsCm: {
        lengthCm: input.lengthCm,
        breadthCm: input.breadthCm,
        heightCm: input.heightCm,
      },
      actualWeightKg: input.actualWeightKg,
      orderType: input.orderType,
      paymentType: input.paymentType,
    },
    config,
  );

  if (!equalsMoney(quote.totalCharge, input.acknowledgedTotal)) {
    throw new OrderCreationError(
      "QUOTE_STALE",
      "The price has changed since this quote was shown. Review the new total and confirm again.",
      {
        acknowledgedTotal: input.acknowledgedTotal,
        currentTotal: quote.totalCharge,
        quote,
      },
    );
  }

  // --- Persist ------------------------------------------------------------
  // Retried as a whole because the order number is random: a collision has to
  // re-run the transaction with a fresh one, and a transaction that raised
  // cannot be continued.
  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
    try {
      return await persist(input, actor, quote);
    } catch (error) {
      const isOrderNumberCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        String(error.meta?.target ?? "").includes("orderNumber");

      if (!isOrderNumberCollision || attempt === MAX_ORDER_NUMBER_ATTEMPTS) {
        if (isOrderNumberCollision) {
          throw new OrderCreationError(
            "ORDER_NUMBER_UNAVAILABLE",
            "Could not allocate an order number. Please try again.",
          );
        }
        throw error;
      }
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new OrderCreationError(
    "ORDER_NUMBER_UNAVAILABLE",
    "Could not allocate an order number. Please try again.",
  );
}

async function persist(
  input: CreateOrderInput,
  actor: Actor,
  quote: RateQuote,
): Promise<CreateOrderResult> {
  return prisma.$transaction(async (tx) => {
    // The agent is chosen before the row is written so the order can be
    // inserted already carrying its status and assignment, rather than being
    // created and then immediately updated.
    const selection = await chooseAgentForZone(tx, quote.pickupZone.id);
    const agent = selection.selected;

    const now = new Date();
    const order = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(now),
        customerId: input.customerId,

        pickupContactName: input.pickup.contactName,
        pickupPhone: input.pickup.phone,
        pickupAddressLine1: input.pickup.addressLine1,
        pickupAddressLine2: input.pickup.addressLine2 ?? null,
        pickupCity: input.pickup.city,
        pickupPincode: quote.pickupZone.resolvedArea.pincode,
        pickupZoneId: quote.pickupZone.id,

        dropContactName: input.drop.contactName,
        dropPhone: input.drop.phone,
        dropAddressLine1: input.drop.addressLine1,
        dropAddressLine2: input.drop.addressLine2 ?? null,
        dropCity: input.drop.city,
        dropPincode: quote.dropZone.resolvedArea.pincode,
        dropZoneId: quote.dropZone.id,

        lengthCm: input.lengthCm,
        breadthCm: input.breadthCm,
        heightCm: input.heightCm,

        // Straight from the engine — the same numbers the customer confirmed.
        actualWeightKg: quote.actualWeight,
        volumetricWeightKg: quote.volumetricWeight,
        volumetricDivisor: quote.volumetricDivisor,
        chargeableWeightKg: quote.chargeableWeight,

        orderType: quote.orderType,
        scope: quote.scope,
        paymentType: quote.paymentType,
        rateCardId: quote.rateCardUsed.id,
        freightCharge: quote.baseCharge,
        codSurcharge: quote.codSurcharge,
        totalCharge: quote.totalCharge,
        codAmount: input.paymentType === "COD" ? (input.codAmount ?? null) : null,

        assignedAgentId: agent?.agentId ?? null,
        status: agent ? "ASSIGNED" : "CREATED",
        assignedAt: agent ? now : null,
        notes: input.notes ?? null,
      },
      select: { id: true, orderNumber: true },
    });

    // Attempt 1 opens with the order. `scheduledFor` is null: the customer has
    // not picked a date, this is simply "as soon as possible". A failure closes
    // it and rescheduling opens attempt 2 with the date they choose.
    await tx.deliveryAttempt.create({
      data: {
        orderId: order.id,
        attemptNumber: 1,
        status: "SCHEDULED",
        scheduledFor: null,
        agentId: agent?.agentId ?? null,
      },
    });

    const createdBy =
      actor.role === "ADMIN"
        ? "Created by an admin on behalf of the customer"
        : "Created by the customer";

    await appendStatusHistory(tx, {
      orderId: order.id,
      status: "CREATED",
      fromStatus: null,
      actorId: actor.id,
      actorRole: actor.role,
      note: agent
        ? createdBy
        : `${createdBy}. ${selection.selected === null ? selection.reason : ""} — awaiting manual assignment`.trim(),
    });

    if (agent) {
      await appendStatusHistory(tx, {
        orderId: order.id,
        status: "ASSIGNED",
        fromStatus: "CREATED",
        actorId: actor.id,
        actorRole: actor.role,
        note: `Auto-assigned to ${agent.agentName} (${agent.employeeCode}) — strategy ${ASSIGNMENT_STRATEGY}, ${agent.activeOrderCount} active order(s) at selection`,
      });
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      quote,
      assignment: agent
        ? {
            assigned: true as const,
            agentId: agent.agentId,
            agentName: agent.agentName,
            employeeCode: agent.employeeCode,
          }
        : {
            assigned: false as const,
            reason:
              selection.selected === null
                ? selection.reason
                : "No agent available",
          },
    };
  });
}
