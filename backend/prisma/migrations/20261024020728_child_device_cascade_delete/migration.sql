-- DropForeignKey
ALTER TABLE "AppUsageRecord" DROP CONSTRAINT "AppUsageRecord_childDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "BlockedApp" DROP CONSTRAINT "BlockedApp_childDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "Geofence" DROP CONSTRAINT "Geofence_childDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "GeofenceEvent" DROP CONSTRAINT "GeofenceEvent_childDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "GeofenceEvent" DROP CONSTRAINT "GeofenceEvent_geofenceId_fkey";

-- DropForeignKey
ALTER TABLE "LocationPing" DROP CONSTRAINT "LocationPing_childDeviceId_fkey";

-- DropForeignKey
ALTER TABLE "SosAlert" DROP CONSTRAINT "SosAlert_childDeviceId_fkey";

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_geofenceId_fkey" FOREIGN KEY ("geofenceId") REFERENCES "Geofence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeofenceEvent" ADD CONSTRAINT "GeofenceEvent_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppUsageRecord" ADD CONSTRAINT "AppUsageRecord_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedApp" ADD CONSTRAINT "BlockedApp_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SosAlert" ADD CONSTRAINT "SosAlert_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
