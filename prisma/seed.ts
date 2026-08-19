import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

/**
 * Idempotent seed: safe to re-run. Everything is upserted on a natural key, so
 * a second run updates in place instead of duplicating.
 *
 * Passwords come from env when present, so a non-local environment can seed
 * without the defaults below ever being valid credentials.
 */
const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@lastmile.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin@12345";
const AGENT_PASSWORD = process.env.SEED_AGENT_PASSWORD ?? "Agent@12345";

async function main() {
  console.log("Seeding database...");

  // --- Zones ---------------------------------------------------------------
  const zoneSeeds = [
    { code: "NORTH", name: "North Zone" },
    { code: "SOUTH", name: "South Zone" },
  ];

  const zones = Object.fromEntries(
    await Promise.all(
      zoneSeeds.map(async (z) => {
        const zone = await prisma.zone.upsert({
          where: { code: z.code },
          update: { name: z.name },
          create: z,
        });
        return [z.code, zone] as const;
      }),
    ),
  );
  console.log(`  zones: ${Object.keys(zones).length}`);

  // --- Areas ---------------------------------------------------------------
  const areaSeeds = [
    { name: "Rohini", pincode: "110085", zoneCode: "NORTH" },
    { name: "Pitampura", pincode: "110034", zoneCode: "NORTH" },
    { name: "Saket", pincode: "110017", zoneCode: "SOUTH" },
    { name: "Hauz Khas", pincode: "110016", zoneCode: "SOUTH" },
  ];

  for (const area of areaSeeds) {
    const zoneId = zones[area.zoneCode].id;
    await prisma.area.upsert({
      where: { zoneId_name: { zoneId, name: area.name } },
      update: { pincode: area.pincode },
      create: { name: area.name, pincode: area.pincode, zoneId },
    });
  }
  console.log(`  areas: ${areaSeeds.length}`);

  // --- Rate cards ----------------------------------------------------------
  // One INTRA card per zone plus both INTER directions, for each order type.
  const rateCardSeeds = [
    { orderType: "B2C", scope: "INTRA", from: "NORTH", to: "NORTH", base: 40, perKg: 15 },
    { orderType: "B2C", scope: "INTRA", from: "SOUTH", to: "SOUTH", base: 40, perKg: 15 },
    { orderType: "B2C", scope: "INTER", from: "NORTH", to: "SOUTH", base: 70, perKg: 25 },
    { orderType: "B2C", scope: "INTER", from: "SOUTH", to: "NORTH", base: 70, perKg: 25 },
    { orderType: "B2B", scope: "INTRA", from: "NORTH", to: "NORTH", base: 30, perKg: 12 },
    { orderType: "B2B", scope: "INTRA", from: "SOUTH", to: "SOUTH", base: 30, perKg: 12 },
    { orderType: "B2B", scope: "INTER", from: "NORTH", to: "SOUTH", base: 55, perKg: 20 },
    { orderType: "B2B", scope: "INTER", from: "SOUTH", to: "NORTH", base: 55, perKg: 20 },
  ] as const;

  for (const card of rateCardSeeds) {
    const fromZoneId = zones[card.from].id;
    const toZoneId = zones[card.to].id;

    await prisma.rateCard.upsert({
      where: {
        orderType_scope_fromZoneId_toZoneId: {
          orderType: card.orderType,
          scope: card.scope,
          fromZoneId,
          toZoneId,
        },
      },
      update: { baseRate: card.base, perKgRate: card.perKg },
      create: {
        orderType: card.orderType,
        scope: card.scope,
        fromZoneId,
        toZoneId,
        baseRate: card.base,
        baseWeightKg: 1,
        perKgRate: card.perKg,
      },
    });
  }
  console.log(`  rate cards: ${rateCardSeeds.length}`);

  // --- COD surcharge -------------------------------------------------------
  await prisma.codSurchargeConfig.upsert({
    where: { orderType: "B2C" },
    update: {},
    create: { orderType: "B2C", mode: "FIXED", amount: 30 },
  });
  await prisma.codSurchargeConfig.upsert({
    where: { orderType: "B2B" },
    update: {},
    create: {
      orderType: "B2B",
      mode: "PERCENTAGE",
      percentage: 2.5,
      minAmount: 25,
    },
  });
  console.log("  COD surcharge configs: 2");

  // --- Admin ---------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN", isActive: true },
    create: {
      email: ADMIN_EMAIL,
      name: "Platform Admin",
      passwordHash: await hash(ADMIN_PASSWORD, SALT_ROUNDS),
      role: "ADMIN",
    },
    select: { id: true, email: true },
  });
  console.log(`  admin: ${admin.email}`);

  // --- Agents --------------------------------------------------------------
  const agentSeeds = [
    {
      email: "agent.north@lastmile.local",
      name: "Asha Rane",
      employeeCode: "AGT-001",
      zoneCode: "NORTH",
    },
    {
      email: "agent.south@lastmile.local",
      name: "Vikram Iyer",
      employeeCode: "AGT-002",
      zoneCode: "SOUTH",
    },
  ];

  for (const seed of agentSeeds) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: { role: "AGENT", isActive: true },
      create: {
        email: seed.email,
        name: seed.name,
        passwordHash: await hash(AGENT_PASSWORD, SALT_ROUNDS),
        role: "AGENT",
      },
      select: { id: true },
    });

    await prisma.agent.upsert({
      where: { userId: user.id },
      update: {
        currentZoneId: zones[seed.zoneCode].id,
        availability: "AVAILABLE",
      },
      create: {
        userId: user.id,
        employeeCode: seed.employeeCode,
        currentZoneId: zones[seed.zoneCode].id,
        availability: "AVAILABLE",
      },
    });
  }
  console.log(`  agents: ${agentSeeds.length}`);

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
