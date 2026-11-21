-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childDeviceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reward" TEXT NOT NULL DEFAULT '',
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "hasPhoto" BOOLEAN NOT NULL DEFAULT false,
    "photoBase64" TEXT,
    "doneAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedEvent" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childDeviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_childDeviceId_status_idx" ON "Task"("childDeviceId", "status");

-- CreateIndex
CREATE INDEX "Task_parentId_status_idx" ON "Task"("parentId", "status");

-- CreateIndex
CREATE INDEX "FeedEvent_parentId_createdAt_idx" ON "FeedEvent"("parentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedEvent" ADD CONSTRAINT "FeedEvent_childDeviceId_fkey" FOREIGN KEY ("childDeviceId") REFERENCES "ChildDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

