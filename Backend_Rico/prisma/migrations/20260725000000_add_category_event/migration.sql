-- CreateTable
CREATE TABLE "CategoryEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategoryEvent_userId_category_createdAt_idx"
ON "CategoryEvent"("userId", "category", "createdAt");

-- AddForeignKey
ALTER TABLE "CategoryEvent"
ADD CONSTRAINT "CategoryEvent_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
