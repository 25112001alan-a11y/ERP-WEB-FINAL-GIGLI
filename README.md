<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Nexus ERP

Sistema de gestión empresarial integral (SaaS ERP) con inventario, POS, compras, ventas, finanzas, pedidos públicos, reportes y configuración.

View your app in AI Studio: https://ai.studio/apps/4b039737-0080-4aa5-8684-7b4de8e69ba4

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Create your environment file from the example and set the values:
   `copy .env.example .env`
   - `GEMINI_API_KEY`: your Gemini API key, required for Gemini AI API calls.
   - `APP_URL`: the URL where the app is hosted, used for self-referential links and API endpoints.
3. Run the app in development mode (served at http://localhost:3000):
   `npm run dev`

## Available Scripts

- `npm run dev` — start the Vite dev server on port 3000 (0.0.0.0).
- `npm run build` — build the app for production.
- `npm run preview` — preview the production build locally.
- `npm run lint` — type-check with `tsc --noEmit`.
- `npm run clean` — remove `dist` and `server.js`.

## Deploy

When hosted in AI Studio, `GEMINI_API_KEY` and `APP_URL` are injected automatically at runtime from user secrets; no local `.env` is required in that environment.
