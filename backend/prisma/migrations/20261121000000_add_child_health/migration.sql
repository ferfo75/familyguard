-- AlterTable
ALTER TABLE "ChildDevice" ADD COLUMN     "healthAppVersion" TEXT,
ADD COLUMN     "healthAt" TIMESTAMP(3),
ADD COLUMN     "healthBackgroundLocation" BOOLEAN,
ADD COLUMN     "healthBatteryUnrestricted" BOOLEAN,
ADD COLUMN     "healthLocationEnabled" BOOLEAN,
ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3);
