import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { api } from './api.js';
import { config } from './config.js';
import { migrate } from './migrate.js';

const app = express();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit:'256kb' }));
app.use('/api', api);
app.use(express.static(resolve(root,'public')));
app.get('*', (req,res) => res.sendFile(resolve(root,'public/index.html')));
app.use((error,req,res,next) => {
  const status = error.status || (error.name === 'ZodError' ? 400 : 500);
  if (status >= 500) console.error(error);
  res.status(status).json({ error:error.message, details:error.issues || undefined });
});

if (config.autoMigrate) await migrate();
app.listen(config.port, () => console.log(`D&D Realm: http://localhost:${config.port}`));
