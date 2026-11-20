-- Stock valuation fix (Nov 2026)
-- 1. Per-inch costs need more than 6 decimals: 70/36 stored as 1.944444 turned
--    6,000 yd (216,000 in) into 419,999.90 instead of 420,000.00.
ALTER TABLE "inventory"          ALTER COLUMN "avgCostPerInch"  TYPE DECIMAL(18,10);
ALTER TABLE "stock_movements"    ALTER COLUMN "unitCostPerInch" TYPE DECIMAL(18,10);
ALTER TABLE "sale_items"         ALTER COLUMN "costPerInch"     TYPE DECIMAL(18,10);
ALTER TABLE "purchase_items"     ALTER COLUMN "costPerInch"     TYPE DECIMAL(18,10);
ALTER TABLE "online_order_items" ALTER COLUMN "costPerInch"     TYPE DECIMAL(18,10);

-- 2. Stock is valued at the product's CURRENT purchase price (cost basis set on
--    the product). Resync existing stock rows so prices entered or edited after
--    stock was received take effect.
UPDATE "inventory" AS i
SET "avgCostPerInch" = ROUND(p."purchaseRate" / mu."inchesPerUnit", 10),
    "updatedAt" = now()
FROM "products" AS p
JOIN "measurement_units" AS mu
  ON mu."shopId" = p."shopId" AND mu."code" = p."priceUnitCode" AND mu."isActive"
WHERE i."productId" = p."id"
  AND p."purchaseRate" IS NOT NULL
  AND p."purchaseRate" > 0;
