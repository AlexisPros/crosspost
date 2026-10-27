// Creates two local test accounts: an admin and a regular user. Development only.
// Usage: npm run db:seed-dev   (in Docker: docker compose exec app npm run db:seed-dev)
// Re-running resets their passwords and roles. Logins are listed in dev-accounts.txt.
import "dotenv/config";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const ACCOUNTS = [
  { email: "admin@example.com", password: "TestAdmin-2026!", role: "ADMIN" },
  { email: "user@example.com", password: "TestUser-2026!", role: "USER" },
] as const;

async function main() {
  // Known passwords must never reach a real deployment.
  const appUrl = process.env.APP_URL ?? "";
  if (process.env.NODE_ENV === "production" || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl)) {
    throw new Error("Refusing to create test accounts: APP_URL must be http://localhost (local development only).");
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  for (const account of ACCOUNTS) {
    const passwordHash = await hash(account.password);
    await db.user.upsert({
      where: { email: account.email },
      create: { email: account.email, passwordHash, role: account.role },
      update: { passwordHash, role: account.role },
    });
    console.log(`${account.role.padEnd(5)}  ${account.email}`);
  }
  await db.$disconnect();
  console.log("\nTest accounts ready. Passwords: dev-accounts.txt");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
