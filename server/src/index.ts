import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nexus-erp-api' });
});

app.use('/api/auth', authRoutes);

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`nexus-erp-api listening on http://localhost:${PORT}`);
});
