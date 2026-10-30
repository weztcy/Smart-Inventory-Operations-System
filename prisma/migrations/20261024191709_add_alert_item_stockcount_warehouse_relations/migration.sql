-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "itemId" TEXT,
    "locationId" TEXT,
    "message" TEXT NOT NULL,
    "currentQty" TEXT,
    "thresholdQty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Alert_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("createdAt", "currentQty", "id", "itemId", "locationId", "message", "organizationId", "resolvedAt", "status", "thresholdQty", "type") SELECT "createdAt", "currentQty", "id", "itemId", "locationId", "message", "organizationId", "resolvedAt", "status", "thresholdQty", "type" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE INDEX "Alert_organizationId_status_type_idx" ON "Alert"("organizationId", "status", "type");
CREATE TABLE "new_StockCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "reconciledAt" DATETIME,
    "adjustmentTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockCount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCount_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StockCount" ("adjustmentTransactionId", "createdAt", "createdById", "id", "locationId", "notes", "number", "organizationId", "reconciledAt", "startedAt", "status", "submittedAt", "warehouseId") SELECT "adjustmentTransactionId", "createdAt", "createdById", "id", "locationId", "notes", "number", "organizationId", "reconciledAt", "startedAt", "status", "submittedAt", "warehouseId" FROM "StockCount";
DROP TABLE "StockCount";
ALTER TABLE "new_StockCount" RENAME TO "StockCount";
CREATE UNIQUE INDEX "StockCount_adjustmentTransactionId_key" ON "StockCount"("adjustmentTransactionId");
CREATE INDEX "StockCount_organizationId_status_idx" ON "StockCount"("organizationId", "status");
CREATE UNIQUE INDEX "StockCount_organizationId_number_key" ON "StockCount"("organizationId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
