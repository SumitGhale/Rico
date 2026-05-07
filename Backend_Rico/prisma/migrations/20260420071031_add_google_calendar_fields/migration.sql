-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "googleEventId" TEXT;

-- CreateTable
CREATE TABLE "GoogleToken" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiryDate" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleToken_pkey" PRIMARY KEY ("id")
);
