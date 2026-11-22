-- AlterTable
ALTER TABLE "ChildDevice" ADD COLUMN "fcmToken" TEXT,
ADD COLUMN "lastWakeAt" TIMESTAMP(3);
