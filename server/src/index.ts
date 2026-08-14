import 'dotenv/config';
import express from 'express';

const app = express();

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nexus-erp-api' });
});

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`nexus-erp-api listening on http://localhost:${PORT}`);
});
