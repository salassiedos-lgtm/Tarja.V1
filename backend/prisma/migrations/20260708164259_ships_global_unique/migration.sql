-- 1. Tabla ships
CREATE TABLE "ships" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ships_name_key" ON "ships"("name");

-- 2. Backfill desde operations.ship_name (normalizado a MAYUSCULAS)
INSERT INTO "ships" ("name", "updated_at")
SELECT DISTINCT UPPER(TRIM("ship_name")), CURRENT_TIMESTAMP
FROM "operations"
WHERE "ship_name" IS NOT NULL AND TRIM("ship_name") <> '';

-- 3. FK en operations
ALTER TABLE "operations" ADD COLUMN "ship_id" INTEGER;
UPDATE "operations" o SET "ship_id" = s."id"
FROM "ships" s WHERE s."name" = UPPER(TRIM(o."ship_name"));
ALTER TABLE "operations" ALTER COLUMN "ship_id" SET NOT NULL;
ALTER TABLE "operations" DROP COLUMN "ship_name";
ALTER TABLE "operations" ADD CONSTRAINT "operations_ship_id_fkey"
    FOREIGN KEY ("ship_id") REFERENCES "ships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Unicidad global
DROP INDEX IF EXISTS "bills_of_lading_operation_id_bl_number_key";
CREATE UNIQUE INDEX "bills_of_lading_bl_number_key" ON "bills_of_lading"("bl_number");
-- operation_id perdio su indice al dropear el unique compuesto; se restituye.
CREATE INDEX "bills_of_lading_operation_id_idx" ON "bills_of_lading"("operation_id");
DROP INDEX IF EXISTS "vehicles_operation_id_vin_key";
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- 5. Campos nuevos
ALTER TABLE "vehicles" ADD COLUMN "container_number" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "model" TEXT;
CREATE INDEX "vehicles_container_number_idx" ON "vehicles"("container_number");
