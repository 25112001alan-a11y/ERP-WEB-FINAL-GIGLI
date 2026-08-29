import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

export const app = express();

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
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nexus-erp-api' });
});

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

// Central error handler: converts rejected handlers (Express 5) into JSON.
// Business errors carry a `status` property; anything else is a 500.
app.use((err: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});