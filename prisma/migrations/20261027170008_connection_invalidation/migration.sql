-- AlterTable
ALTER TABLE "SocialConnection" ADD COLUMN     "invalidatedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT;
