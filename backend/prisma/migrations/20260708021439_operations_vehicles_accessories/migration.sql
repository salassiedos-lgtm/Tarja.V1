-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('ROLL_ON_ROLL_OFF', 'DESCONSOLIDADO');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('ACTIVA', 'PAUSADA', 'CERRADA');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'TARJADO', 'OBSERVADO', 'REABIERTO', 'BLOQUEADO', 'NO_PLANIFICADO');

-- CreateTable
CREATE TABLE "operations" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "ship_name" TEXT NOT NULL,
    "operation_type" "OperationType" NOT NULL,
    "operation_date" TIMESTAMP(3),
    "port_discharge" TEXT,
    "status" "OperationStatus" NOT NULL DEFAULT 'ACTIVA',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills_of_lading" (
    "id" SERIAL NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "bl_number" TEXT NOT NULL,
    "booking_number" TEXT,
    "port_loading" TEXT,
    "port_discharge" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_of_lading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "bill_of_lading_id" INTEGER,
    "vin" TEXT NOT NULL,
    "chassis_number" TEXT,
    "brand" TEXT,
    "weight" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "VehicleStatus" NOT NULL DEFAULT 'PENDIENTE',
    "is_unplanned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accessories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_imports" (
    "id" SERIAL NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "invalid_rows" INTEGER NOT NULL,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operation_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operations_code_key" ON "operations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_lading_operation_id_bl_number_key" ON "bills_of_lading"("operation_id", "bl_number");

-- CreateIndex
CREATE INDEX "vehicles_operation_id_idx" ON "vehicles"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_operation_id_vin_key" ON "vehicles"("operation_id", "vin");

-- CreateIndex
CREATE UNIQUE INDEX "accessories_name_key" ON "accessories"("name");

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_lading" ADD CONSTRAINT "bills_of_lading_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_bill_of_lading_id_fkey" FOREIGN KEY ("bill_of_lading_id") REFERENCES "bills_of_lading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_imports" ADD CONSTRAINT "operation_imports_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_imports" ADD CONSTRAINT "operation_imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
