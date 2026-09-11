# syntax=docker/dockerfile:1
# Nexus ERP API — multi-stage build.
# Railway (Railpack) runs this Dockerfile because it sits in the service root directory (server/).

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Prisma needs OpenSSL at both build and runtime on glibc images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# --include=dev keeps TypeScript available for the build even with NODE_ENV=production.
RUN npm ci --include=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# Railway injects PORT (default 8080); the app falls back to 3001 locally.
EXPOSE 8080
CMD ["node", "dist/index.js"]