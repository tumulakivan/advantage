-- CreateTable
CREATE TABLE "account_catalog" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'bank',
    "icon" TEXT NOT NULL DEFAULT 'Landmark',
    "logoData" BYTEA,
    "logoType" TEXT,
    "logoVersion" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "account_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_catalog_slug_key" ON "account_catalog"("slug");

-- CreateIndex
CREATE INDEX "account_catalog_archivedAt_idx" ON "account_catalog"("archivedAt");
