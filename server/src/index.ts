import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth.routes.js';
import productsRoutes from './routes/products.routes.js';
import stockRoutes from './routes/stock.routes.js';
import clientsRoutes from './routes/clients.routes.js';
import suppliersRoutes from './routes/suppliers.routes.js';
import documentsRoutes from './routes/documents.routes.js';

const app = express();

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

// Central error handler: converts rejected handlers (Express 5) into JSON.
// Business errors carry a `status` property; anything else is a 500.
app.use((err: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof err.status === 'number' ? err.status : 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`nexus-erp-api listening on http://localhost:${PORT}`);
});
