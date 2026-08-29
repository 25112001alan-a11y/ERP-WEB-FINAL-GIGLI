import 'dotenv/config';
import { app } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`nexus-erp-api listening on http://localhost:${PORT}`);
});