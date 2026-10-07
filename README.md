# Nexus ERP

An ERP web app with inventory, sales, purchasing, finance, and a separate Express API.

## Run locally

You need Node.js 22.12+ (22.x) or 24+, npm, and a local MySQL database for the API. The frontend and API have separate dependency trees and lockfiles.

1. Install dependencies from the repository root:

   ```sh
   npm ci
   npm ci --prefix server
   ```

2. Create `server/.env` (see `server/.env.example`) and set `DATABASE_URL` for your MySQL database and `JWT_SECRET` for signing tokens. The server reads its environment from the `server` working directory. On startup it applies pending migrations and seeds an empty database unless disabled by `SKIP_MIGRATIONS=true` or `SKIP_SEED=true`.

3. In separate terminals, from the repository root:

   ```sh
   npm --prefix server run dev
   npm run dev
   ```

   Open http://localhost:3000. The API listens on http://localhost:3001 (`/api/health`). The frontend calls that API directly; Vite does not proxy requests. To use another API address, set `VITE_API_URL` for the frontend. If the frontend runs on a different origin, include it in the API's `CORS_ORIGINS` (comma-separated; default: `http://localhost:3000`).

Use the server-prefixed command above to start the API: the root `npm run dev:server` script runs from the repository root, while the API bootstrap looks for Prisma under its working directory's `node_modules`.

## Scripts

| From the repository root | Purpose |
| --- | --- |
| `npm run dev` | Vite frontend on port 3000 |
| `npm --prefix server run dev` | API on port 3001 by default |
| `npm run build` / `npm run build:server` | Type-check and build frontend / compile API |
| `npm run lint` / `npm run lint:server` | Type-check frontend / API |
| `npm test` / `npm run test:server` | Run frontend / API tests |
| `npm run preview` | Preview the built frontend (allow its origin in API CORS when needed) |
| `npm run clean` | Remove build artifacts (uses `rm -rf`; requires a Unix-compatible shell) |
