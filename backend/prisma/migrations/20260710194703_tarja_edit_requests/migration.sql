-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'COMPLETADA');

-- AlterTable
ALTER TABLE "tarja_reports" ADD COLUMN     "edit_snapshot" JSONB;

-- CreateTable
CREATE TABLE "tarja_edit_requests" (
    "id" SERIAL NOT NULL,
    "report_id" INTEGER NOT NULL,
    "requested_by" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDIENTE',
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "resolve_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarja_edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarja_edit_requests_status_idx" ON "tarja_edit_requests"("status");

-- CreateIndex
CREATE INDEX "tarja_edit_requests_report_id_idx" ON "tarja_edit_requests"("report_id");

-- AddForeignKey
ALTER TABLE "tarja_edit_requests" ADD CONSTRAINT "tarja_edit_requests_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "tarja_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_edit_requests" ADD CONSTRAINT "tarja_edit_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarja_edit_requests" ADD CONSTRAINT "tarja_edit_requests_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
