import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import productsRoutes from './routes/products.routes.js';
import stockRoutes from './routes/stock.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import suppliersRoutes from './routes/suppliers.routes.js';
import documentsRoutes from './routes/documents.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import financeRoutes from './routes/finance.routes.js';
import usersRoutes from './routes/users.routes.js';
import auditRoutes from './routes/audit.routes.js';
import companyRoutes from './routes/company.routes.js';
import publicRoutes from './routes/public.routes.js';
import billingRoutes from './routes/billing.routes.js';
import { apiLimiter, loginLimiter, registerLimiter, publicLimiter } from './middleware/rateLimit.js';

export const app = express();

// Railway terminates TLS in front of the container: trust exactly one proxy hop
// so req.ip (and therefore rate limiting) sees the real client address.
app.set('trust proxy', 1);

// Security headers. The frontend lives on another origin, so cross-origin
// resource loading stays allowed; nosniff is what matters for uploaded files.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Allowed browser origins. Dev default: the Vite dev server on :3000.
// Extend with CORS_ORIGINS (comma separated) for deployed frontends.
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header (curl, server-to-server, tests) are served without CORS headers.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Deny silently: no CORS headers means the browser rejects the response.
      callback(null, false);
    },
  }),
);

// 1 MB covers every JSON payload this API accepts (documents with lines).
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'nexus-erp-api' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nexus-erp-api' });
});

// Baseline limit for the whole API, with stricter windows on the sensitive
// entry points. /api/documents/:id/external/attachment is served by its route
// with an authenticated, tenant-checked request (no public static directory).
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/register', registerLimiter);
app.use('/api/public', publicLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/billing', billingRoutes);

// Central error handler: converts rejected handlers (Express 5) into JSON.
// 4xx keeps the actionable business message; 5xx is logged in full server-side
// and answered generically so internal/database details never reach clients.
app.use(
  (
    err: { status?: number; message?: string; name?: string; code?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // Upload errors (multer) are client errors, not server faults.
    if (err?.name === 'MulterError') {
      const tooLarge = err.code === 'LIMIT_FILE_SIZE';
      res
        .status(tooLarge ? 413 : 400)
        .json({ error: tooLarge ? 'El archivo supera el tamaño máximo (10 MB)' : 'Error al subir el archivo' });
      return;
    }

    // Prisma unique-constraint violations surface as a clean conflict.
    if (err?.code === 'P2002') {
      res.status(409).json({ error: 'El registro ya existe' });
      return;
    }

    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) {
      console.error(err);
      res.status(500).json({ error: 'Error interno del servidor' });
      return;
    }

    res.status(status).json({ error: err?.message || 'Error en la solicitud' });
  },
);
