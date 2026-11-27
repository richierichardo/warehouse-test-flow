BEGIN;

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MovementDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" UUID NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "received_on" DATE NOT NULL,
    "source_name" TEXT NOT NULL,
    "delivery_note_ref" TEXT,
    "notes" TEXT,
    "received_by" TEXT NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "posted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_request" (
    "id" UUID NOT NULL,
    "request_no" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requester_id" TEXT NOT NULL,
    "notes" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "idempotency_key" UUID NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movement" (
    "id" BIGSERIAL NOT NULL,
    "item_id" UUID NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "receipt_id" UUID,
    "request_id" UUID,
    "actor_id" TEXT NOT NULL,
    "posted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key_hash" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key_hash","window_start")
);

-- CreateTable
CREATE TABLE "access_audit" (
    "id" UUID NOT NULL,
    "actor_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_safe" JSONB NOT NULL,
    "after_safe" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" TEXT NOT NULL,

    CONSTRAINT "access_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "item_code_key" ON "item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_receipt_no_key" ON "goods_receipt"("receipt_no");

-- CreateIndex
CREATE INDEX "goods_receipt_posted_at_id_idx" ON "goods_receipt"("posted_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_received_by_idempotency_key_key" ON "goods_receipt"("received_by", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "item_request_request_no_key" ON "item_request"("request_no");

-- CreateIndex
CREATE INDEX "item_request_requester_id_created_at_idx" ON "item_request"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "item_request_status_created_at_idx" ON "item_request"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "item_request_requester_id_idempotency_key_key" ON "item_request"("requester_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_receipt_id_key" ON "stock_movement"("receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movement_request_id_key" ON "stock_movement"("request_id");

-- CreateIndex
CREATE INDEX "stock_movement_item_id_id_idx" ON "stock_movement"("item_id", "id");

-- CreateIndex
CREATE INDEX "rate_limit_bucket_expires_at_idx" ON "rate_limit_bucket"("expires_at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item" ADD CONSTRAINT "item_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_received_by_fkey" FOREIGN KEY ("received_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_request" ADD CONSTRAINT "item_request_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_request" ADD CONSTRAINT "item_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_request" ADD CONSTRAINT "item_request_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "item_request"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_audit" ADD CONSTRAINT "access_audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_audit" ADD CONSTRAINT "access_audit_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Warehouse invariants enforced independently of Prisma Client.
ALTER TABLE "user"
  ADD CONSTRAINT "user_role_allowed" CHECK ("role" IN ('EMPLOYEE', 'WAREHOUSE', 'SUPERADMIN')),
  ADD CONSTRAINT "user_email_normalized" CHECK (
    "email" <> '' AND "email" = lower("email" COLLATE pg_catalog."pg_c_utf8")
    AND "email" COLLATE pg_catalog."pg_c_utf8" !~ '^[[:space:]]|[[:space:]]$'
  );

ALTER TABLE "item"
  ADD CONSTRAINT "item_stock_range" CHECK ("stock" BETWEEN 0 AND 2000000000),
  ADD CONSTRAINT "item_code_normalized" CHECK (
    "code" <> '' AND "code" = upper("code" COLLATE pg_catalog."pg_c_utf8")
    AND "code" COLLATE pg_catalog."pg_c_utf8" !~ '^[[:space:]]|[[:space:]]$'
  );

ALTER TABLE "goods_receipt"
  ADD CONSTRAINT "goods_receipt_quantity_range" CHECK ("quantity" BETWEEN 1 AND 1000000);

ALTER TABLE "item_request"
  ADD CONSTRAINT "item_request_quantity_range" CHECK ("quantity" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "item_request_decision_state" CHECK (
    ("status" = 'PENDING' AND "decided_by" IS NULL AND "decided_at" IS NULL AND "rejection_reason" IS NULL)
    OR ("status" = 'APPROVED' AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL AND "rejection_reason" IS NULL)
    OR ("status" = 'REJECTED' AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL
      AND "rejection_reason" IS NOT NULL AND "rejection_reason" COLLATE pg_catalog."pg_c_utf8" ~ '[^[:space:]]')
  );

ALTER TABLE "stock_movement"
  ADD CONSTRAINT "stock_movement_quantity_range" CHECK ("quantity" BETWEEN 1 AND 1000000),
  ADD CONSTRAINT "stock_movement_balance_range" CHECK ("balance_after" BETWEEN 0 AND 2000000000),
  ADD CONSTRAINT "stock_movement_direction_source" CHECK (
    ("direction" = 'IN' AND "receipt_id" IS NOT NULL AND "request_id" IS NULL)
    OR ("direction" = 'OUT' AND "request_id" IS NOT NULL AND "receipt_id" IS NULL)
  );

ALTER TABLE "rate_limit_bucket"
  ADD CONSTRAINT "rate_limit_bucket_count_nonnegative" CHECK ("count" >= 0);

COMMIT;
