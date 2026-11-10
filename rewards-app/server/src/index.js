import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './auth.js';
import appRoutes from './routes/app.js';
import adminRoutes from './routes/admin.js';
import contentRoutes from './routes/content.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/app', appRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', contentRoutes);

app.use((req, res) => res.status(404).json({ error: `ไม่มีเส้นทาง ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่อีกครั้ง' });
});

const port = process.env.PORT || 4007;
app.listen(port, '0.0.0.0', () => console.log(`API ทำงานที่ http://localhost:${port}`));
