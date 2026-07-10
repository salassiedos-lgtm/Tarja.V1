-- CreateEnum
CREATE TYPE "WorkShift" AS ENUM ('DIA', 'NOCHE');

-- AlterTable
ALTER TABLE "tarja_reports"
  ADD COLUMN "work_shift" "WorkShift",
  ADD COLUMN "report_date" DATE;
