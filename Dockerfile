# Development image used by docker-compose.yml: runs `next dev` with the source bind-mounted.
FROM node:22-bookworm-slim

# Prisma's schema engine (used by migrations) links against OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so this layer is cached until package*.json changes.
# postinstall runs `prisma generate`, which needs the schema and some DATABASE_URL (it does not connect).
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://placeholder@localhost:5432/placeholder" npm ci

EXPOSE 3000

# The bind mount hides the client generated during the build, so generate it again,
# apply pending migrations, then start the dev server on all interfaces.
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev -- --hostname 0.0.0.0 --port 3000"]
