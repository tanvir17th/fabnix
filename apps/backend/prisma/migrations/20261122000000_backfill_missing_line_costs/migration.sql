-- COGS fix (Nov 2026): lines sold while a fabric had no purchase price were
-- recorded with cost 0, so profit counted them as free. Fill ONLY those missing
-- costs from the fabric's current purchase price. Recorded costs are untouched.
-- (stock_movements are append-only by design and are not modified.)
UPDATE "sale_items" AS si
SET "costPerInch" = ROUND(p."purchaseRate" / mu."inchesPerUnit", 10)
FROM "products" AS p
JOIN "measurement_units" AS mu
  ON mu."shopId" = p."shopId" AND mu."code" = p."priceUnitCode" AND mu."isActive"
WHERE si."productId" = p."id"
  AND (si."costPerInch" IS NULL OR si."costPerInch" = 0)
  AND p."purchaseRate" > 0;

UPDATE "online_order_items" AS oi
SET "costPerInch" = ROUND(p."purchaseRate" / mu."inchesPerUnit", 10)
FROM "products" AS p
JOIN "measurement_units" AS mu
  ON mu."shopId" = p."shopId" AND mu."code" = p."priceUnitCode" AND mu."isActive"
WHERE oi."productId" = p."id"
  AND (oi."costPerInch" IS NULL OR oi."costPerInch" = 0)
  AND p."purchaseRate" > 0;
