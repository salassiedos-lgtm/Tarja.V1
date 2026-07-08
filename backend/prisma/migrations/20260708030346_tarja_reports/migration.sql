-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('BORRADOR', 'FINALIZADO', 'CON_DANO', 'ANULADO', 'REEMPLAZADO');

-- CreateEnum
CREATE TYPE "DamageSource" AS ENUM ('CAUSADO', 'ENCONTRADO');

-- CreateEnum
CREATE TYPE "DamageOperation" AS ENUM ('DESCARGA', 'EMBARQUE', 'TRANSITO', 'REESTIBA');

-- CreateEnum
CREATE TYPE "DamageAffects" AS ENUM ('CARGA_CHANCAY', 'CARGA_TRANSITO');

-- CreateEnum
CREATE TYPE "DamageMoment" AS ENUM ('ANTES_DESCARGA', 'DURANTE_DESCARGA', 'POSTERIOR_DESCARGA', 'ANTES_EMBARQUE', 'DURANTE_EMBARQUE', 'OTROS');

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "current_report_id" INTEGER,
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "locked_by" INTEGER;

-- CreateTable
CREATE TABLE "tarja_reports" (
    "id" SERIAL NOT NULL,
    "report_code" TEXT NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "bill_of_lading_id" INTEGER,
    "tarjador_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "has_damage" BOOLEAN NOT NULL DEFAULT false,
    "damage_source" "DamageSource",
    "damage_operation" "DamageOperation",
    "damage_affects" "DamageAffects",
    "damage_moment" "DamageMoment",
    "damage_moment_other" TEXT,
    "details" TEXT,
    "tarjador_initials" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'BORRADOR',
    "replaced_by_report_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarja_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarja_report_accessories" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "accessory_id" INTEGER NOT NULL,
    "has_accessory" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarja_report_accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarja_report_damages" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarja_report_damages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarja_report_annulments" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "tarjador_id" INTEGER,
    "supervisor_id" INTEGER,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "previous_report_status" TEXT,
    "new_report_status" TEXT,
    "annulled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarja_report_annulments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarja_reports_report_code_key" ON "tarja_reports"("report_code");

-- CreateIndex
CREATE UNIQUE INDEX "tarja_report_accessories_report_id_accessory_id_key" ON "tarja_report_accessories"("report_id", "accessory_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_current_report_id_key" ON "vehicles"("current_report_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_report_id_fkey" FOREIGN KEY ("current_report_id") REFERENCES "tarja_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_reports" ADD CONSTRAINT "tarja_reports_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_reports" ADD CONSTRAINT "tarja_reports_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_reports" ADD CONSTRAINT "tarja_reports_bill_of_lading_id_fkey" FOREIGN KEY ("bill_of_lading_id") REFERENCES "bills_of_lading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_reports" ADD CONSTRAINT "tarja_reports_tarjador_id_fkey" FOREIGN KEY ("tarjador_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_reports" ADD CONSTRAINT "tarja_reports_replaced_by_report_id_fkey" FOREIGN KEY ("replaced_by_report_id") REFERENCES "tarja_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_report_accessories" ADD CONSTRAINT "tarja_report_accessories_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "tarja_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_report_accessories" ADD CONSTRAINT "tarja_report_accessories_accessory_id_fkey" FOREIGN KEY ("accessory_id") REFERENCES "accessories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_report_damages" ADD CONSTRAINT "tarja_report_damages_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "tarja_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_report_annulments" ADD CONSTRAINT "tarja_report_annulments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "tarja_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_report_annulments" ADD CONSTRAINT "tarja_report_annulments_tarjador_id_fkey" FOREIGN KEY ("tarjador_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_report_annulments" ADD CONSTRAINT "tarja_report_annulments_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex (manual): una sola tarja valida por vehiculo (estados validos)
CREATE UNIQUE INDEX "uniq_valid_tarja_per_vehicle"
ON "tarja_reports" ("vehicle_id")
WHERE status IN ('BORRADOR', 'FINALIZADO', 'CON_DANO');
