# Builder stage: installs full (dev+prod) dependencies so bcrypt's native
# addon can compile and the Nest/Prisma CLIs are available, then produces the
# compiled dist/ output and the generated Prisma client.
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# python3/make/g++ are required to build bcrypt's native binding from
# source; openssl is required by the Prisma query engine (absent from the
# slim base image, which otherwise makes Prisma silently pick the wrong
# engine target).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# Runtime stage: no compilers, just the built app plus the full node_modules
# copied from the builder. node_modules is kept un-pruned (devDependencies
# included) because `prisma migrate deploy` needs the Prisma CLI at
# container startup to bring the database schema up to date before the API
# starts serving traffic.
FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
