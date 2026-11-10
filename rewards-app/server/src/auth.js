import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

export const PUBLIC_USER = `id, employee_code, username, email, display_name, department, position, branch,
  phone, birth_date, avatar_url, role, tier, status, points, points_expire_at, terms_accepted_at, created_at`;

function decode(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const payload = decode(req);
  if (!payload) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  req.user = payload;
  next();
}

export function requireAdmin(req, res, next) {
  const payload = decode(req);
  if (!payload) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
  if (payload.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  req.user = payload;
  next();
}

const router = Router();

// รองรับทั้งช่อง "รหัสพนักงาน" ของพนักงานและ "ชื่อผู้ใช้/อีเมล" ของแอดมิน
router.post('/login', async (req, res, next) => {
  try {
    const { identifier, password, role = 'user' } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({ error: 'กรอกข้อมูลให้ครบก่อนเข้าสู่ระบบ' });
    }

    const { rows } = await query(
      `SELECT ${PUBLIC_USER}, password_hash FROM users
       WHERE lower(employee_code) = lower($1) OR lower(username) = lower($1) OR lower(email) = lower($1)`,
      [identifier.trim()]
    );
    const user = rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: 'รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    if (user.status !== 'Active') return res.status(403).json({ error: 'บัญชีนี้ถูกระงับการใช้งาน' });
    if (role === 'admin' && user.role !== 'admin') {
      return res.status(403).json({ error: 'บัญชีนี้ไม่มีสิทธิ์เข้าหน้าผู้ดูแลระบบ' });
    }

    delete user.password_hash;
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบบัญชีนี้' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

// บันทึกเวลาที่กดยอมรับ PDPA เพื่อไม่ต้องแสดงหน้าข้อตกลงซ้ำ
router.post('/accept-terms', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE users SET terms_accepted_at = now() WHERE id = $1 RETURNING ${PUBLIC_USER}`,
      [req.user.id]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
