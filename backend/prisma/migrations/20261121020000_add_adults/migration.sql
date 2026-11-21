-- CreateTable
CREATE TABLE "Adult" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Adult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdultInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdultInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Adult_email_key" ON "Adult"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdultInvite_code_key" ON "AdultInvite"("code");

-- AddForeignKey
ALTER TABLE "Adult" ADD CONSTRAINT "Adult_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdultInvite" ADD CONSTRAINT "AdultInvite_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

