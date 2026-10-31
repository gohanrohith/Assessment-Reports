-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PLATFORM_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'STUDENT', 'GUARDIAN', 'REVIEWER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "platformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTotpStep" BIGINT NOT NULL DEFAULT -1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "tenant_id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "academicYear" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "state" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "logoUrl" TEXT,
    "campuses" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "School_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activeSchoolId" UUID,
    "refreshHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "mfaVerified" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshUse" (
    "hash" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshUse_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "correlationId" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateBucket" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "resetsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "School_tenant_id_idx" ON "School"("tenant_id");

-- CreateIndex
CREATE INDEX "Membership_tenant_id_idx" ON "Membership"("tenant_id");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenant_id_userId_key" ON "Membership"("tenant_id", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenant_id_createdAt_idx" ON "AuditEvent"("tenant_id", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "School"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS is transaction-local and forced even for the table owner (never run the API as a superuser).
ALTER TABLE "School" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "School" FORCE ROW LEVEL SECURITY;
CREATE POLICY school_scope ON "School" USING (tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true),'')::uuid);
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_read ON "Membership" FOR SELECT USING (tenant_id = nullif(current_setting('app.current_tenant_id',true),'')::uuid OR "userId" = nullif(current_setting('app.current_user_id',true),'')::uuid);
CREATE POLICY membership_write ON "Membership" FOR INSERT WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id',true),'')::uuid);
CREATE POLICY membership_update ON "Membership" FOR UPDATE USING (tenant_id = nullif(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id',true),'')::uuid);
ALTER TABLE "AuditEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON "AuditEvent" FOR SELECT USING (tenant_id = nullif(current_setting('app.current_tenant_id',true),'')::uuid);
CREATE POLICY audit_insert ON "AuditEvent" FOR INSERT WITH CHECK (tenant_id IS NULL OR tenant_id = nullif(current_setting('app.current_tenant_id',true),'')::uuid);
-- INSERT RETURNING must not require a broad SELECT policy, application audit writes use raw INSERT.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit events are append-only'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
GRANT USAGE ON SCHEMA public TO assessment_app;
GRANT SELECT, INSERT, UPDATE ON "User", "Session", "RefreshUse", "RateBucket", "School", "Membership" TO assessment_app;
GRANT SELECT, INSERT ON "AuditEvent" TO assessment_app;
GRANT DELETE ON "RateBucket", "RefreshUse" TO assessment_app;
