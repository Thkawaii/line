import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAdmin, PUBLIC_USER } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();
router.use(requireAdmin);

/* ---------- Banner ---------- */

router.get('/banners', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, title, image_url, link_url, sort_order, active FROM banners ORDER BY sort_order, id'
    );
    res.json({ banners: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/banners', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.title) return res.status(400).json({ error: 'กรอกชื่อแบนเนอร์' });
    const { rows } = await query(
      `INSERT INTO banners (title, image_url, link_url, sort_order, active)
       VALUES ($1,$2,$3,COALESCE($4::int,0),COALESCE($5::boolean,true)) RETURNING *`,
      [b.title, b.imageUrl || null, b.linkUrl || null, b.sortOrder, b.active]
    );
    await logAudit(req.user.id, 'banner.create', b.title);
    res.status(201).json({ banner: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/banners/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE banners SET
         title = COALESCE($2::varchar, title),
         image_url = COALESCE($3::text, image_url),
         link_url = COALESCE($4::text, link_url),
         sort_order = COALESCE($5::int, sort_order),
         active = COALESCE($6::boolean, active)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.title ?? null, b.imageUrl ?? null, b.linkUrl ?? null, b.sortOrder ?? null, b.active ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบแบนเนอร์นี้' });
    await logAudit(req.user.id, 'banner.update', rows[0].title);
    res.json({ banner: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/banners/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM banners WHERE id = $1 RETURNING title', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบแบนเนอร์นี้' });
    await logAudit(req.user.id, 'banner.delete', rows[0].title);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------- FAQ ---------- */

router.get('/faqs', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, question, answer, sort_order FROM faqs ORDER BY sort_order, id');
    res.json({ faqs: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/faqs', async (req, res, next) => {
  try {
    const { question, answer, sortOrder } = req.body || {};
    if (!question || !answer) return res.status(400).json({ error: 'กรอกคำถามและคำตอบให้ครบ' });
    const { rows } = await query(
      'INSERT INTO faqs (question, answer, sort_order) VALUES ($1,$2,COALESCE($3::int,0)) RETURNING *',
      [question, answer, sortOrder]
    );
    await logAudit(req.user.id, 'faq.create', question);
    res.status(201).json({ faq: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/faqs/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE faqs SET question = COALESCE($2::varchar, question),
                       answer = COALESCE($3::text, answer),
                       sort_order = COALESCE($4::int, sort_order)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.question ?? null, b.answer ?? null, b.sortOrder ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบคำถามนี้' });
    await logAudit(req.user.id, 'faq.update', rows[0].question);
    res.json({ faq: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/faqs/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM faqs WHERE id = $1 RETURNING question', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบคำถามนี้' });
    await logAudit(req.user.id, 'faq.delete', rows[0].question);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/* ---------- Terms & Policy ---------- */

router.get('/policies', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT key, title, content, updated_at FROM policies ORDER BY key');
    res.json({ policies: rows });
  } catch (err) {
    next(err);
  }
});

router.put('/policies/:key', async (req, res, next) => {
  try {
    const { title, content } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'กรอกหัวข้อและเนื้อหาให้ครบ' });
    const { rows } = await query(
      `INSERT INTO policies (key, title, content, updated_at) VALUES ($1,$2,$3, now())
       ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = now()
       RETURNING *`,
      [req.params.key, title, content]
    );
    await logAudit(req.user.id, 'policy.update', rows[0].title);
    res.json({ policy: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ---------- Membership ---------- */

router.get('/tiers', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*, (SELECT count(*)::int FROM users u WHERE u.role = 'user' AND u.tier = t.key) AS member_count
       FROM tiers t ORDER BY t.sort_order`
    );
    res.json({ tiers: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/tiers/:key', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE tiers SET name = COALESCE($2::varchar, name),
                        min_points = COALESCE($3::int, min_points),
                        benefits = COALESCE($4::text, benefits),
                        color = COALESCE($5::varchar, color)
       WHERE key = $1 RETURNING *`,
      [req.params.key, b.name ?? null, b.minPoints ?? null, b.benefits ?? null, b.color ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบระดับสมาชิกนี้' });
    await logAudit(req.user.id, 'tier.update', rows[0].name, `เกณฑ์ ${rows[0].min_points} คะแนน`);
    res.json({ tier: rows[0] });
  } catch (err) {
    next(err);
  }
});

// คำนวณระดับสมาชิกใหม่ทั้งระบบตามเกณฑ์คะแนนล่าสุด
router.post('/tiers/recalculate', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE users u SET tier = COALESCE(
         (SELECT t.key FROM tiers t WHERE u.points >= t.min_points ORDER BY t.min_points DESC LIMIT 1),
         u.tier)
       WHERE u.role = 'user' RETURNING u.id`
    );
    await logAudit(req.user.id, 'tier.recalculate', 'พนักงานทั้งหมด', `${rows.length} บัญชี`);
    res.json({ updated: rows.length });
  } catch (err) {
    next(err);
  }
});

/* ---------- Admin Accounts ---------- */

router.get('/admins', async (_req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${PUBLIC_USER} FROM users WHERE role = 'admin' ORDER BY created_at`);
    res.json({ admins: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/admins', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.username || !b.email || !b.displayName || !b.password) {
      return res.status(400).json({ error: 'กรอกชื่อผู้ใช้ อีเมล ชื่อที่แสดง และรหัสผ่านให้ครบ' });
    }
    if (b.password.length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });

    const hash = await bcrypt.hash(b.password, 10);
    const { rows } = await query(
      `INSERT INTO users (employee_code, username, email, password_hash, display_name, department, position, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'admin') RETURNING ${PUBLIC_USER}`,
      [
        b.employeeCode || b.username.toUpperCase(),
        b.username,
        b.email,
        hash,
        b.displayName,
        b.department || '',
        b.position || 'ผู้ดูแลระบบ',
      ]
    );
    await logAudit(req.user.id, 'admin.create', b.username);
    res.status(201).json({ admin: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'ชื่อผู้ใช้ อีเมล หรือรหัสนี้ถูกใช้แล้ว' });
    next(err);
  }
});

router.patch('/admins/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (String(req.params.id) === String(req.user.id) && b.status === 'Inactive') {
      return res.status(400).json({ error: 'ระงับบัญชีของตัวเองไม่ได้' });
    }

    let hash = null;
    if (b.password) {
      if (b.password.length < 8) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });
      hash = await bcrypt.hash(b.password, 10);
    }

    const { rows } = await query(
      `UPDATE users SET display_name = COALESCE($2::varchar, display_name),
                        email = COALESCE($3::varchar, email),
                        department = COALESCE($4::varchar, department),
                        position = COALESCE($5::varchar, position),
                        status = COALESCE($6::varchar, status),
                        password_hash = COALESCE($7::text, password_hash)
       WHERE id = $1 AND role = 'admin' RETURNING ${PUBLIC_USER}`,
      [req.params.id, b.displayName ?? null, b.email ?? null, b.department ?? null, b.position ?? null, b.status ?? null, hash]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบบัญชีผู้ดูแลนี้' });
    await logAudit(req.user.id, 'admin.update', rows[0].username, b.password ? 'เปลี่ยนรหัสผ่าน' : '');
    res.json({ admin: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ---------- System Settings ---------- */

router.get('/settings', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT key, value, label, kind, updated_at FROM settings ORDER BY key');
    res.json({ settings: rows });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const entries = Object.entries(req.body?.values || {});
    if (!entries.length) return res.status(400).json({ error: 'ไม่มีค่าที่จะบันทึก' });

    for (const [key, value] of entries) {
      await query(
        `UPDATE settings SET value = $2, updated_at = now() WHERE key = $1`,
        [key, String(value)]
      );
    }
    await logAudit(req.user.id, 'settings.update', 'ตั้งค่าระบบ', entries.map(([k]) => k).join(', '));

    const { rows } = await query('SELECT key, value, label, kind, updated_at FROM settings ORDER BY key');
    res.json({ settings: rows });
  } catch (err) {
    next(err);
  }
});

/* ---------- Audit Logs ---------- */

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;
    const params = [];
    let clause = '';
    if (q) {
      params.push(`%${q}%`);
      clause = `WHERE (l.action ILIKE $1 OR l.target ILIKE $1 OR u.display_name ILIKE $1)`;
    }
    const take = Math.min(100, Number(limit) || 20);
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [rows, count] = await Promise.all([
      query(
        `SELECT l.id, l.action, l.target, l.detail, l.created_at, u.display_name AS actor_name, u.username AS actor_username
         FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
         ${clause} ORDER BY l.created_at DESC LIMIT ${take} OFFSET ${skip}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ${clause}`, params),
    ]);

    res.json({ logs: rows.rows, total: count.rows[0].n, page: Number(page) || 1, limit: take });
  } catch (err) {
    next(err);
  }
});

/* ---------- Systems Event (เทมเพลตแจ้งเตือนอัตโนมัติ) ---------- */

router.get('/notification-events', async (_req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT key, name, description, in_app, email, active, updated_at FROM notification_events ORDER BY sort_order'
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

router.patch('/notification-events/:key', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE notification_events SET
         in_app = COALESCE($2::boolean, in_app),
         email  = COALESCE($3::boolean, email),
         active = COALESCE($4::boolean, active),
         updated_at = now()
       WHERE key = $1 RETURNING *`,
      [req.params.key, b.inApp ?? null, b.email ?? null, b.active ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบรายการนี้' });
    await logAudit(req.user.id, 'notification-event.update', rows[0].name);
    res.json({ event: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
