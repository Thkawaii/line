import { Router } from 'express';
import crypto from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

// เกณฑ์ระดับสมาชิกอ่านจากตาราง tiers เพื่อให้แอดมินแก้ได้จากหน้าตั้งค่า
async function tierProgress(tier) {
  const { rows } = await query('SELECT key, name, min_points FROM tiers ORDER BY min_points');
  const index = rows.findIndex((t) => t.key === tier);
  const next = index >= 0 ? rows[index + 1] : null;
  return { tierTarget: next ? next.min_points : null, nextTier: next ? next.name : null };
}

async function setting(key, fallback) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? fallback;
}

/* ---------- หน้าแรก ---------- */

router.get('/home', async (req, res, next) => {
  try {
    const [me, banners, rewards, events] = await Promise.all([
      query('SELECT display_name, tier, points, points_expire_at FROM users WHERE id = $1', [req.user.id]),
      query('SELECT id, title, image_url, link_url FROM banners WHERE active ORDER BY sort_order'),
      query(`SELECT id, name, image_url, points, old_points, stock FROM rewards
             WHERE status = 'active' ORDER BY created_at DESC LIMIT 6`),
      query(`SELECT id, title, image_url, event_date, start_time, end_time, location, points, kind
             FROM events WHERE status = 'open' ORDER BY event_date LIMIT 3`),
    ]);

    const user = me.rows[0];
    const progress = await tierProgress(user.tier);
    res.json({
      user,
      ...progress,
      banners: banners.rows,
      rewards: rewards.rows,
      events: events.rows,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- คะแนน ---------- */

router.get('/points', async (req, res, next) => {
  try {
    const [me, recent, joined, expiring] = await Promise.all([
      query('SELECT display_name, employee_code, tier, points, points_expire_at FROM users WHERE id = $1', [req.user.id]),
      query(`SELECT id, kind, source, title, points, created_at FROM point_transactions
             WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`, [req.user.id]),
      query(`SELECT count(*)::int AS n FROM event_registrations WHERE user_id = $1`, [req.user.id]),
      query(`SELECT COALESCE(sum(points),0)::int AS n FROM point_transactions
             WHERE user_id = $1 AND kind = 'earn' AND created_at < now() - interval '11 months'`, [req.user.id]),
    ]);

    res.json({
      user: me.rows[0],
      recent: recent.rows,
      joinedCount: joined.rows[0].n,
      expiringPoints: expiring.rows[0].n,
    });
  } catch (err) {
    next(err);
  }
});

// filter: all | redeem | earn | spend
router.get('/points/history', async (req, res, next) => {
  try {
    const filter = req.query.filter || 'all';
    const map = {
      redeem: `AND source = 'reward'`,
      earn: `AND points > 0`,
      spend: `AND points < 0`,
    };
    const { rows } = await query(
      `SELECT t.id, t.kind, t.source, t.title, t.points, t.created_at, r.status AS redemption_status
       FROM point_transactions t
       LEFT JOIN redemptions r ON r.ref_code = t.ref_code
       WHERE t.user_id = $1 ${map[filter] || ''}
       ORDER BY t.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ transactions: rows });
  } catch (err) {
    next(err);
  }
});

/* ---------- กิจกรรม ---------- */

router.get('/events', async (req, res, next) => {
  try {
    const { filter = 'all', q = '' } = req.query;
    const where = [`e.status = 'open'`];
    const params = [req.user.id];

    if (q) {
      params.push(`%${q}%`);
      where.push(`e.title ILIKE $${params.length}`);
    }
    if (filter === 'soon') where.push(`e.event_date >= current_date`);
    if (filter === 'joined') where.push(`r.id IS NOT NULL`);
    if (filter === 'not-joined') where.push(`r.id IS NULL`);

    const { rows } = await query(
      `SELECT e.id, e.title, e.description, e.agenda, e.image_url, e.location, e.event_date,
              e.start_time, e.end_time, e.points, e.kind, e.capacity,
              (r.id IS NOT NULL) AS joined,
              (f.user_id IS NOT NULL) AS favorite,
              (SELECT count(*)::int FROM event_registrations x WHERE x.event_id = e.id) AS joined_count
       FROM events e
       LEFT JOIN event_registrations r ON r.event_id = e.id AND r.user_id = $1
       LEFT JOIN favorites f ON f.target_type = 'event' AND f.target_id = e.id AND f.user_id = $1
       WHERE ${where.join(' AND ')}
       ORDER BY e.event_date`,
      params
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/events/:id/register', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, title, points, capacity, kind FROM events WHERE id = $1 AND status = 'open' FOR UPDATE`,
        [req.params.id]
      );
      const event = rows[0];
      if (!event) return { code: 404, body: { error: 'ไม่พบกิจกรรมนี้' } };

      const dup = await client.query(
        'SELECT 1 FROM event_registrations WHERE event_id = $1 AND user_id = $2',
        [event.id, req.user.id]
      );
      if (dup.rowCount) return { code: 409, body: { error: 'คุณลงทะเบียนกิจกรรมนี้ไว้แล้ว' } };

      if (event.capacity > 0) {
        const { rows: cnt } = await client.query(
          'SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1',
          [event.id]
        );
        if (cnt[0].n >= event.capacity) return { code: 409, body: { error: 'กิจกรรมนี้เต็มแล้ว' } };
      }

      await client.query('INSERT INTO event_registrations (event_id, user_id) VALUES ($1,$2)', [
        event.id,
        req.user.id,
      ]);

      // กิจกรรมแบบโหวตให้คะแนนทันที ส่วนกิจกรรมทั่วไปรอเช็คอินหน้างาน
      if (event.kind === 'vote' && event.points > 0) {
        await client.query('UPDATE users SET points = points + $2 WHERE id = $1', [req.user.id, event.points]);
        await client.query(
          `INSERT INTO point_transactions (user_id, kind, source, title, points) VALUES ($1,'earn','vote',$2,$3)`,
          [req.user.id, event.title, event.points]
        );
        await client.query(
          `INSERT INTO notifications (user_id, category, title, body)
           VALUES ($1,'point',$2,$3)`,
          [req.user.id, `คุณได้รับ ${event.points} คะแนน`, `จากการร่วมกิจกรรม ${event.title}`]
        );
      }

      return { code: 200, body: { ok: true, kind: event.kind, points: event.points } };
    });

    res.status(result.code).json(result.body);
  } catch (err) {
    next(err);
  }
});

/* ---------- ของรางวัล ---------- */

router.get('/rewards', async (req, res, next) => {
  try {
    const { q = '', category = '' } = req.query;
    const params = [req.user.id];
    const where = [`r.status = 'active'`];

    if (q) {
      params.push(`%${q}%`);
      where.push(`r.name ILIKE $${params.length}`);
    }
    if (category && category !== 'ทั้งหมด') {
      params.push(category);
      where.push(`r.category = $${params.length}`);
    }

    const [rewards, categories, me] = await Promise.all([
      query(
        `SELECT r.id, r.name, r.description, r.how_to, r.conditions, r.image_url, r.category,
                r.points, r.old_points, r.stock, (f.user_id IS NOT NULL) AS favorite
         FROM rewards r
         LEFT JOIN favorites f ON f.target_type = 'reward' AND f.target_id = r.id AND f.user_id = $1
         WHERE ${where.join(' AND ')}
         ORDER BY r.points`,
        params
      ),
      query(`SELECT DISTINCT category FROM rewards WHERE status = 'active' ORDER BY category`),
      query('SELECT points FROM users WHERE id = $1', [req.user.id]),
    ]);

    res.json({
      rewards: rewards.rows,
      categories: categories.rows.map((r) => r.category),
      points: me.rows[0].points,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/rewards/:id/redeem', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, name, points, stock FROM rewards WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [req.params.id]
      );
      const reward = rows[0];
      if (!reward) return { code: 404, body: { error: 'ไม่พบของรางวัลนี้' } };
      if (reward.stock <= 0) return { code: 409, body: { error: 'ของรางวัลหมดแล้ว' } };

      const { rows: userRows } = await client.query('SELECT points FROM users WHERE id = $1 FOR UPDATE', [
        req.user.id,
      ]);
      if (userRows[0].points < reward.points) {
        return { code: 400, body: { error: 'คะแนนของคุณไม่พอแลกของรางวัลนี้' } };
      }

      const refCode = `RW-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;

      await client.query('UPDATE rewards SET stock = stock - 1 WHERE id = $1', [reward.id]);
      await client.query('UPDATE users SET points = points - $2 WHERE id = $1', [req.user.id, reward.points]);
      await client.query(
        `INSERT INTO redemptions (user_id, reward_id, ref_code, points_used) VALUES ($1,$2,$3,$4)`,
        [req.user.id, reward.id, refCode, reward.points]
      );
      await client.query(
        `INSERT INTO point_transactions (user_id, kind, source, title, points, ref_code)
         VALUES ($1,'redeem','reward',$2,$3,$4)`,
        [req.user.id, `แลก${reward.name}`, -reward.points, refCode]
      );
      await client.query(
        `INSERT INTO notifications (user_id, category, title, body)
         VALUES ($1,'reward','แลกคะแนนสำเร็จ',$2)`,
        [req.user.id, `คุณได้ใช้ ${reward.points} คะแนน สำหรับการแลก ${reward.name}`]
      );

      return { code: 201, body: { ok: true, refCode } };
    });

    res.status(result.code).json(result.body);
  } catch (err) {
    next(err);
  }
});

router.get('/my-rewards', async (req, res, next) => {
  try {
    const status = req.query.status === 'received' ? 'received' : 'pending';
    const { rows } = await query(
      `SELECT d.id, d.ref_code, d.points_used, d.status, d.redeemed_at, d.received_at,
              r.name, r.image_url
       FROM redemptions d JOIN rewards r ON r.id = d.reward_id
       WHERE d.user_id = $1 AND d.status = $2
       ORDER BY d.redeemed_at DESC`,
      [req.user.id, status]
    );
    res.json({ redemptions: rows });
  } catch (err) {
    next(err);
  }
});

/* ---------- รายการโปรด ---------- */

router.get('/favorites', async (req, res, next) => {
  try {
    const type = req.query.type === 'event' ? 'event' : 'reward';
    const sql =
      type === 'reward'
        ? `SELECT r.id, r.name, r.image_url, r.points, r.old_points, r.stock
           FROM favorites f JOIN rewards r ON r.id = f.target_id
           WHERE f.user_id = $1 AND f.target_type = 'reward' ORDER BY f.created_at DESC`
        : `SELECT e.id, e.title, e.image_url, e.event_date, e.start_time, e.end_time, e.location, e.points, e.kind
           FROM favorites f JOIN events e ON e.id = f.target_id
           WHERE f.user_id = $1 AND f.target_type = 'event' ORDER BY f.created_at DESC`;
    const { rows } = await query(sql, [req.user.id]);
    res.json({ type, items: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/favorites/toggle', async (req, res, next) => {
  try {
    const { type, id } = req.body || {};
    if (!['reward', 'event'].includes(type) || !id) {
      return res.status(400).json({ error: 'ข้อมูลรายการโปรดไม่ถูกต้อง' });
    }
    const existing = await query(
      'DELETE FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3 RETURNING 1',
      [req.user.id, type, id]
    );
    if (existing.rowCount) return res.json({ favorite: false });

    await query('INSERT INTO favorites (user_id, target_type, target_id) VALUES ($1,$2,$3)', [
      req.user.id,
      type,
      id,
    ]);
    res.json({ favorite: true });
  } catch (err) {
    next(err);
  }
});

/* ---------- แจ้งเตือนและเนื้อหา ---------- */

router.get('/notifications', async (req, res, next) => {
  try {
    const category = req.query.category;
    const params = [req.user.id];
    let filter = '';
    if (category && category !== 'all') {
      params.push(category);
      filter = `AND category = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT id, category, title, body, read_at, created_at FROM notifications
       WHERE (user_id = $1 OR user_id IS NULL) ${filter}
       ORDER BY created_at DESC LIMIT 100`,
      params
    );
    const unread = rows.filter((n) => !n.read_at).length;
    res.json({ notifications: rows, unread });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications/read-all', async (req, res, next) => {
  try {
    await query(
      `UPDATE notifications SET read_at = now() WHERE read_at IS NULL AND (user_id = $1 OR user_id IS NULL)`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/faqs', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT id, question, answer FROM faqs ORDER BY sort_order');
    res.json({ faqs: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/policies/:key', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT key, title, content, updated_at FROM policies WHERE key = $1', [
      req.params.key,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบเอกสารนี้' });
    res.json({ policy: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ---------- ระดับสมาชิก ---------- */

router.get('/tiers', async (req, res, next) => {
  try {
    const [tiers, me] = await Promise.all([
      query('SELECT key, name, min_points, benefits, color FROM tiers ORDER BY min_points'),
      query('SELECT tier, points FROM users WHERE id = $1', [req.user.id]),
    ]);
    const progress = await tierProgress(me.rows[0].tier);
    res.json({ tiers: tiers.rows, current: me.rows[0], ...progress });
  } catch (err) {
    next(err);
  }
});

/* ---------- QR ประจำตัว ---------- */

// โทเค็นอายุสั้นสำหรับให้เจ้าหน้าที่สแกนเช็คอิน
router.get('/qr-token', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT employee_code, display_name, department FROM users WHERE id = $1', [
      req.user.id,
    ]);
    const expiresIn = Number(await setting('qr_ttl_seconds', 300)) || 300;
    const payload = `${req.user.id}.${Date.now() + expiresIn * 1000}`;
    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(payload)
      .digest('hex')
      .slice(0, 16);

    res.json({ ...rows[0], token: `${payload}.${signature}`, expiresIn });
  } catch (err) {
    next(err);
  }
});

export default router;
