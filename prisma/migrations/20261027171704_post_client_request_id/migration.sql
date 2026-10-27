-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Post_userId_clientRequestId_key" ON "Post"("userId", "clientRequestId");

