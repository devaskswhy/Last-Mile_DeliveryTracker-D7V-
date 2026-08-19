import type { OrderType } from "@/lib/domain/enums";
import { prisma } from "@/lib/prisma";

import { normalizePincode } from "./engine";
import type { RateConfig } from "./types";

/**
 * The impure edge of the rate engine: loads exactly the configuration a quote
 * needs and hands it to `calculateRate` as plain data.
 *
 * Keeping the I/O here is what lets the engine itself stay pure and be tested
 * against object literals. It is also why the engine takes a snapshot rather
 * than a repository interface — there is no database to fake, so the tests
 * cannot drift from the real query shape by mocking it wrongly.
 */
export async function loadRateConfig(
  pickupPincode: string,
  dropPincode: string,
  orderType: OrderType,
): Promise<RateConfig> {
  const pincodes = [
    ...new Set([normalizePincode(pickupPincode), normalizePincode(dropPincode)]),
  ].filter((code) => code !== "");

  // Every area for these pincodes is loaded, including ones in other zones.
  // Filtering to a single row here would hide exactly the ambiguity the engine
  // is meant to refuse to guess at.
  const areas = pincodes.length
    ? await prisma.area.findMany({
        where: { pincode: { in: pincodes }, isActive: true },
        select: {
          id: true,
          name: true,
          pincode: true,
          isActive: true,
          zone: {
            select: { id: true, code: true, name: true, isActive: true },
          },
        },
      })
    : [];

  const zoneIds = [...new Set(areas.map((area) => area.zone.id))];

  // Rate cards are narrowed to the zones actually in play. The table is small
  // (2 × N² rows), but a quote is called on every keystroke of the order form,
  // so it is worth not reading all of it each time.
  const [rateCards, codSurcharges] = await Promise.all([
    zoneIds.length
      ? prisma.rateCard.findMany({
          where: {
            orderType,
            fromZoneId: { in: zoneIds },
            toZoneId: { in: zoneIds },
          },
          select: {
            id: true,
            orderType: true,
            scope: true,
            fromZoneId: true,
            toZoneId: true,
            baseRate: true,
            baseWeightKg: true,
            perKgRate: true,
            isActive: true,
          },
        })
      : Promise.resolve([]),
    prisma.codSurchargeConfig.findMany({
      where: { orderType },
      select: {
        id: true,
        orderType: true,
        mode: true,
        amount: true,
        percentage: true,
        minAmount: true,
        isActive: true,
      },
    }),
  ]);

  // Prisma `Decimal` values become strings here and stay strings all the way to
  // the API response — the engine never sees a float.
  return {
    areas,
    rateCards: rateCards.map((card) => ({
      ...card,
      baseRate: card.baseRate.toString(),
      baseWeightKg: card.baseWeightKg.toString(),
      perKgRate: card.perKgRate.toString(),
    })),
    codSurcharges: codSurcharges.map((row) => ({
      ...row,
      amount: row.amount?.toString() ?? null,
      percentage: row.percentage?.toString() ?? null,
      minAmount: row.minAmount?.toString() ?? null,
    })),
  };
}
