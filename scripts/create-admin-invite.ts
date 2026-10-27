// Creates a one-time ADMIN invite code, used to set up the first account.
// Usage: npm run admin:invite -- [email]
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { generateInviteCode, hashInviteCode } from "../src/lib/crypto";

const EXPIRES_IN_DAYS = 7;

async function main() {
  const email = process.argv[2]?.trim().toLowerCase() || null;
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const code = generateInviteCode();
  await db.inviteCode.create({
    data: {
      codeHash: hashInviteCode(code),
      email,
      role: "ADMIN",
      note: "Bootstrap (CLI)",
      expiresAt: new Date(Date.now() + EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  await db.$disconnect();

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  console.log(`Admin invite code${email ? ` for ${email}` : ""} (valid ${EXPIRES_IN_DAYS} days):\n`);
  console.log(`  ${code}\n`);
  console.log(`Register at ${appUrl}/register`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
