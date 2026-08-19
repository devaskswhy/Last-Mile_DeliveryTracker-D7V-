-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'AGENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('B2B', 'B2C');

-- CreateEnum
CREATE TYPE "RateScope" AS ENUM ('INTRA', 'INTER');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PREPAID', 'COD');

-- CreateEnum
CREATE TYPE "SurchargeMode" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "AgentAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "scope" "RateScope" NOT NULL,
    "fromZoneId" TEXT NOT NULL,
    "toZoneId" TEXT NOT NULL,
    "baseRate" DECIMAL(10,2) NOT NULL,
    "baseWeightKg" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "perKgRate" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_surcharge_configs" (
    "id" TEXT NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "mode" "SurchargeMode" NOT NULL,
    "amount" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "minAmount" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cod_surcharge_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "currentZoneId" TEXT,
    "currentLat" DOUBLE PRECISION,
    "currentLng" DOUBLE PRECISION,
    "availability" "AgentAvailability" NOT NULL DEFAULT 'OFFLINE',
    "lastLocationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pickupContactName" TEXT NOT NULL,
    "pickupPhone" TEXT NOT NULL,
    "pickupAddressLine1" TEXT NOT NULL,
    "pickupAddressLine2" TEXT,
    "pickupCity" TEXT NOT NULL,
    "pickupPincode" TEXT NOT NULL,
    "pickupZoneId" TEXT NOT NULL,
    "dropContactName" TEXT NOT NULL,
    "dropPhone" TEXT NOT NULL,
    "dropAddressLine1" TEXT NOT NULL,
    "dropAddressLine2" TEXT,
    "dropCity" TEXT NOT NULL,
    "dropPincode" TEXT NOT NULL,
    "dropZoneId" TEXT NOT NULL,
    "lengthCm" DECIMAL(10,2) NOT NULL,
    "breadthCm" DECIMAL(10,2) NOT NULL,
    "heightCm" DECIMAL(10,2) NOT NULL,
    "actualWeightKg" DECIMAL(10,3) NOT NULL,
    "volumetricWeightKg" DECIMAL(10,3) NOT NULL,
    "volumetricDivisor" INTEGER NOT NULL DEFAULT 5000,
    "chargeableWeightKg" DECIMAL(10,3) NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "scope" "RateScope" NOT NULL,
    "paymentType" "PaymentType" NOT NULL,
    "rateCardId" TEXT,
    "freightCharge" DECIMAL(10,2) NOT NULL,
    "codSurcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCharge" DECIMAL(10,2) NOT NULL,
    "codAmount" DECIMAL(10,2),
    "assignedAgentId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "assignedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "fromStatus" "OrderStatus",
    "actorId" TEXT,
    "actorRole" "Role" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "zones_name_key" ON "zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE INDEX "areas_pincode_idx" ON "areas"("pincode");

-- CreateIndex
CREATE INDEX "areas_zoneId_idx" ON "areas"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "areas_zoneId_name_key" ON "areas"("zoneId", "name");

-- CreateIndex
CREATE INDEX "rate_cards_orderType_scope_idx" ON "rate_cards"("orderType", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_orderType_scope_fromZoneId_toZoneId_key" ON "rate_cards"("orderType", "scope", "fromZoneId", "toZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "cod_surcharge_configs_orderType_key" ON "cod_surcharge_configs"("orderType");

-- CreateIndex
CREATE UNIQUE INDEX "agents_userId_key" ON "agents"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_employeeCode_key" ON "agents"("employeeCode");

-- CreateIndex
CREATE INDEX "agents_availability_currentZoneId_idx" ON "agents"("availability", "currentZoneId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- CreateIndex
CREATE INDEX "orders_assignedAgentId_idx" ON "orders"("assignedAgentId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "order_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_history_actorId_idx" ON "order_status_history"("actorId");

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_fromZoneId_fkey" FOREIGN KEY ("fromZoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_toZoneId_fkey" FOREIGN KEY ("toZoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_currentZoneId_fkey" FOREIGN KEY ("currentZoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_dropZoneId_fkey" FOREIGN KEY ("dropZoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
