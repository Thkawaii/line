import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../db.js';
import { requireAdmin, PUBLIC_USER } from '../auth.js';
import { logAudit } from '../audit.js';

const router = Router();
router.use(requireAdmin);

/* ---------- ภาพรวม ---------- */

router.get('/overview', async (_req, res, next) => {
  try {
    const [staff, events, wallet, tiers, pending, lowStock, outStock, eventStats, pickups] =
      await Promise.all([
        query(`SELECT count(*)::int AS n FROM users WHERE role = 'user'`),
        query(`SELECT count(*)::int AS n FROM events WHERE status = 'open'`),
        query(`SELECT COALESCE(sum(points),0)::int AS n FROM users WHERE role = 'user'`),
        query(`SELECT tier, count(*)::int AS n FROM users WHERE role = 'user' GROUP BY tier`),
        query(`SELECT count(*)::int AS n FROM redemptions WHERE status = 'pending'`),
        query(`SELECT count(*)::int AS n FROM rewards WHERE status='active' AND stock BETWEEN 1 AND 5`),
        query(`SELECT count(*)::int AS n FROM rewards WHERE status='active' AND stock = 0`),
        query(`SELECT e.id, e.title, e.event_date, e.capacity,
                      (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS joined
               FROM events e WHERE e.status = 'open' ORDER BY e.event_date LIMIT 5`),
        query(`SELECT d.id, d.ref_code, d.points_used, d.redeemed_at,
                      u.display_name, u.department, r.name AS reward_name
               FROM redemptions d
               JOIN users u ON u.id = d.user_id
               JOIN rewards r ON r.id = d.reward_id
               WHERE d.status = 'pending' ORDER BY d.redeemed_at DESC LIMIT 5`),
      ]);

    const tierMap = { Member: 0, Silver: 0, Elite: 0 };
    tiers.rows.forEach((r) => (tierMap[r.tier] = r.n));

    res.json({
      staffCount: staff.rows[0].n,
      eventCount: events.rows[0].n,
      walletPoints: wallet.rows[0].n,
      tiers: tierMap,
      todo: { pending: pending.rows[0].n, lowStock: lowStock.rows[0].n, outStock: outStock.rows[0].n },
      events: eventStats.rows,
      pickups: pickups.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', async (_req, res, next) => {
  try {
    const [registrations, attended, pointsOut, pointsIn, topEvents, topRewards, rewardSplit] =
      await Promise.all([
        query(`SELECT count(*)::int AS n FROM event_registrations`),
        query(`SELECT count(*)::int AS n FROM event_registrations WHERE status = 'attended'`),
        query(`SELECT COALESCE(sum(points),0)::int AS n FROM point_transactions WHERE points > 0`),
        query(`SELECT COALESCE(sum(-points),0)::int AS n FROM point_transactions WHERE points < 0`),
        query(`SELECT e.title, count(r.id)::int AS joined, e.capacity
               FROM events e LEFT JOIN event_registrations r ON r.event_id = e.id
               GROUP BY e.id ORDER BY joined DESC LIMIT 5`),
        query(`SELECT r.name, count(d.id)::int AS redeemed, COALESCE(sum(d.points_used),0)::int AS points
               FROM rewards r LEFT JOIN redemptions d ON d.reward_id = r.id
               GROUP BY r.id ORDER BY redeemed DESC LIMIT 5`),
        query(`SELECT r.category, count(d.id)::int AS n
               FROM redemptions d JOIN rewards r ON r.id = d.reward_id
               GROUP BY r.category ORDER BY n DESC`),
      ]);

    const monthly = await query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
              COALESCE(sum(points) FILTER (WHERE points > 0),0)::int AS earned,
              COALESCE(sum(-points) FILTER (WHERE points < 0),0)::int AS spent
       FROM point_transactions
       WHERE created_at > now() - interval '6 months'
       GROUP BY 1 ORDER BY 1`
    );

    res.json({
      registrations: registrations.rows[0].n,
      attended: attended.rows[0].n,
      pointsOut: pointsOut.rows[0].n,
      pointsIn: pointsIn.rows[0].n,
      topEvents: topEvents.rows,
      topRewards: topRewards.rows,
      rewardSplit: rewardSplit.rows,
      monthly: monthly.rows,
    });
  } catch (err) {
    next(err);
  }
});

/* ---------- พนักงาน ---------- */

router.get('/employees', async (req, res, next) => {
  try {
    const { q = '', department = '', branch = '', status = '', tier = '', page = 1, limit = 20 } = req.query;
    const where = [`role = 'user'`];
    const params = [];
    const add = (value, sql) => {
      params.push(value);
      where.push(sql(params.length));
    };

    if (q) add(`%${q}%`, (n) => `(display_name ILIKE $${n} OR employee_code ILIKE $${n})`);
    if (department) add(department, (n) => `department = $${n}`);
    if (branch) add(branch, (n) => `branch = $${n}`);
    if (status) add(status, (n) => `status = $${n}`);
    if (tier) add(tier, (n) => `tier = $${n}`);

    const clause = `WHERE ${where.join(' AND ')}`;
    const take = Math.min(100, Number(limit) || 20);
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [rows, count, filters] = await Promise.all([
      query(
        `SELECT ${PUBLIC_USER} FROM users ${clause} ORDER BY employee_code LIMIT ${take} OFFSET ${skip}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM users ${clause}`, params),
      query(`SELECT DISTINCT department, branch FROM users WHERE role = 'user'`),
    ]);

    res.json({
      employees: rows.rows,
      total: count.rows[0].n,
      page: Number(page) || 1,
      limit: take,
      departments: [...new Set(filters.rows.map((r) => r.department))].filter(Boolean).sort(),
      branches: [...new Set(filters.rows.map((r) => r.branch))].filter(Boolean).sort(),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/employees/:id', async (req, res, next) => {
  try {
    const [user, points, events, rewards] = await Promise.all([
      query(`SELECT ${PUBLIC_USER} FROM users WHERE id = $1`, [req.params.id]),
      query(
        `SELECT id, kind, source, title, points, created_at FROM point_transactions
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.params.id]
      ),
      query(
        `SELECT e.title, e.event_date, e.points, r.status, r.created_at
         FROM event_registrations r JOIN events e ON e.id = r.event_id
         WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
        [req.params.id]
      ),
      query(
        `SELECT d.ref_code, d.points_used, d.status, d.redeemed_at, r.name
         FROM redemptions d JOIN rewards r ON r.id = d.reward_id
         WHERE d.user_id = $1 ORDER BY d.redeemed_at DESC LIMIT 50`,
        [req.params.id]
      ),
    ]);
    if (!user.rows[0]) return res.status(404).json({ error: 'ไม่พบพนักงานคนนี้' });
    res.json({
      user: user.rows[0],
      transactions: points.rows,
      events: events.rows,
      redemptions: rewards.rows,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/employees', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.employeeCode || !b.displayName || !b.email) {
      return res.status(400).json({ error: 'กรอกรหัสพนักงาน ชื่อ-นามสกุล และอีเมลให้ครบ' });
    }
    const hash = await bcrypt.hash(b.password || 'password123', 10);
    const { rows } = await query(
      `INSERT INTO users (employee_code, username, email, password_hash, display_name, department,
                          position, branch, phone, birth_date, tier, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,COALESCE($11::varchar,'Member'),
               COALESCE($12::varchar,'Active'))
       RETURNING ${PUBLIC_USER}`,
      [
        b.employeeCode,
        b.username || b.employeeCode.toLowerCase(),
        b.email,
        hash,
        b.displayName,
        b.department || '',
        b.position || '',
        b.branch || '',
        b.phone || '',
        b.birthDate || null,
        b.tier,
        b.status,
      ]
    );
    await logAudit(req.user.id, 'employee.create', b.employeeCode, b.displayName);
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'รหัสพนักงาน อีเมล หรือชื่อผู้ใช้นี้ถูกใช้แล้ว' });
    next(err);
  }
});

router.patch('/employees/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         department   = COALESCE($3, department),
         position     = COALESCE($4, position),
         branch       = COALESCE($5, branch),
         phone        = COALESCE($6, phone),
         email        = COALESCE($7, email),
         birth_date   = COALESCE($8::date, birth_date),
         tier         = COALESCE($9::varchar, tier),
         status       = COALESCE($10::varchar, status)
       WHERE id = $1 RETURNING ${PUBLIC_USER}`,
      [
        req.params.id,
        b.displayName ?? null,
        b.department ?? null,
        b.position ?? null,
        b.branch ?? null,
        b.phone ?? null,
        b.email ?? null,
        b.birthDate ?? null,
        b.tier ?? null,
        b.status ?? null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบพนักงานคนนี้' });
    await logAudit(req.user.id, 'employee.update', rows[0].employee_code, rows[0].display_name);
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ---------- คะแนน ---------- */

router.get('/points', async (req, res, next) => {
  try {
    const { q = '', kind = '', page = 1, limit = 20 } = req.query;
    const where = [];
    const params = [];
    if (q) {
      params.push(`%${q}%`);
      where.push(`(u.display_name ILIKE $${params.length} OR u.employee_code ILIKE $${params.length})`);
    }
    if (kind) {
      params.push(kind);
      where.push(`t.kind = $${params.length}`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const take = Math.min(100, Number(limit) || 20);
    const skip = (Math.max(1, Number(page) || 1) - 1) * take;

    const [rows, count] = await Promise.all([
      query(
        `SELECT t.id, t.kind, t.source, t.title, t.points, t.created_at,
                u.display_name, u.employee_code, u.department
         FROM point_transactions t JOIN users u ON u.id = t.user_id
         ${clause} ORDER BY t.created_at DESC LIMIT ${take} OFFSET ${skip}`,
        params
      ),
      query(`SELECT count(*)::int AS n FROM point_transactions t JOIN users u ON u.id = t.user_id ${clause}`, params),
    ]);

    res.json({ transactions: rows.rows, total: count.rows[0].n, page: Number(page) || 1, limit: take });
  } catch (err) {
    next(err);
  }
});

// ปรับคะแนนด้วยมือ เช่น ให้คะแนนย้อนหลังหรือหักคืน
router.post('/points/adjust', async (req, res, next) => {
  try {
    const { userId, points, title } = req.body || {};
    const amount = Number(points);
    if (!userId || !amount) return res.status(400).json({ error: 'ระบุพนักงานและจำนวนคะแนน' });

    await withTransaction(async (client) => {
      await client.query('UPDATE users SET points = GREATEST(points + $2, 0) WHERE id = $1', [userId, amount]);
      await client.query(
        `INSERT INTO point_transactions (user_id, kind, source, title, points)
         VALUES ($1,'adjust','system',$2,$3)`,
        [userId, title || 'ปรับคะแนนโดยผู้ดูแลระบบ', amount]
      );
    });
    await logAudit(req.user.id, 'points.adjust', `user #${userId}`, `${amount} คะแนน`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------- ของรางวัลและการรับของ ---------- */

router.get('/rewards', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT r.*, (SELECT count(*)::int FROM redemptions d WHERE d.reward_id = r.id) AS redeemed
       FROM rewards r ORDER BY r.created_at DESC`
    );
    res.json({ rewards: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/rewards', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.points) return res.status(400).json({ error: 'กรอกชื่อและคะแนนที่ใช้แลก' });
    const { rows } = await query(
      `INSERT INTO rewards (name, description, how_to, conditions, category, points, old_points, stock, status)
       VALUES ($1,$2,$3,$4,COALESCE($5::varchar,'ทั่วไป'),$6::int,$7::int,
               COALESCE($8::int,0),COALESCE($9::varchar,'active')) RETURNING *`,
      [b.name, b.description || '', b.howTo || '', b.conditions || '', b.category, b.points, b.oldPoints || null, b.stock, b.status]
    );
    await logAudit(req.user.id, 'reward.create', rows[0].name);
    res.status(201).json({ reward: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/rewards/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE rewards SET
         name = COALESCE($2,name), description = COALESCE($3,description),
         how_to = COALESCE($4,how_to), conditions = COALESCE($5,conditions),
         category = COALESCE($6::varchar,category), points = COALESCE($7::int,points),
         old_points = COALESCE($8::int,old_points), stock = COALESCE($9::int,stock),
         status = COALESCE($10::varchar,status)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.name ?? null, b.description ?? null, b.howTo ?? null, b.conditions ?? null,
       b.category ?? null, b.points ?? null, b.oldPoints ?? null, b.stock ?? null, b.status ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบของรางวัลนี้' });
    await logAudit(req.user.id, 'reward.update', rows[0].name);
    res.json({ reward: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/redemptions', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await query(
      `SELECT d.id, d.ref_code, d.points_used, d.status, d.redeemed_at, d.received_at,
              u.display_name, u.employee_code, u.department, r.name AS reward_name
       FROM redemptions d
       JOIN users u ON u.id = d.user_id
       JOIN rewards r ON r.id = d.reward_id
       WHERE ($1 = 'all' OR d.status = $1)
       ORDER BY d.redeemed_at DESC LIMIT 200`,
      [status]
    );
    res.json({ redemptions: rows });
  } catch (err) {
    next(err);
  }
});

// ยืนยันว่าพนักงานมารับของแล้ว
router.post('/redemptions/:id/receive', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE redemptions SET status = 'received', received_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING user_id, ref_code`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(409).json({ error: 'รายการนี้ถูกยืนยันไปแล้วหรือไม่มีอยู่' });

    await query(
      `INSERT INTO notifications (user_id, category, title, body)
       VALUES ($1,'reward','รับของรางวัลเรียบร้อย',$2)`,
      [rows[0].user_id, `ยืนยันการรับของรางวัลรหัส ${rows[0].ref_code} แล้ว`]
    );
    await logAudit(req.user.id, 'redemption.receive', rows[0].ref_code);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------- กิจกรรม ---------- */

router.get('/events', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT e.*, (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS joined
       FROM events e ORDER BY e.event_date DESC`
    );
    res.json({ events: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/events', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.title || !b.eventDate) return res.status(400).json({ error: 'กรอกชื่อกิจกรรมและวันที่จัด' });
    const { rows } = await query(
      `INSERT INTO events (title, description, agenda, location, event_date, start_time, end_time,
                           points, kind, capacity, status)
       VALUES ($1,$2,$3,$4,$5::date,COALESCE($6::time,'09:00'),COALESCE($7::time,'12:00'),
               COALESCE($8::int,0),COALESCE($9::varchar,'register'),COALESCE($10::int,0),
               COALESCE($11::varchar,'open')) RETURNING *`,
      [b.title, b.description || '', b.agenda || '', b.location || '', b.eventDate, b.startTime,
       b.endTime, b.points, b.kind, b.capacity, b.status]
    );
    await logAudit(req.user.id, 'event.create', rows[0].title);
    res.status(201).json({ event: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/events/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE events SET
         title = COALESCE($2,title), description = COALESCE($3,description), agenda = COALESCE($4,agenda),
         location = COALESCE($5::varchar,location), event_date = COALESCE($6::date,event_date),
         start_time = COALESCE($7::time,start_time), end_time = COALESCE($8::time,end_time),
         points = COALESCE($9::int,points), kind = COALESCE($10::varchar,kind),
         capacity = COALESCE($11::int,capacity), status = COALESCE($12::varchar,status)
       WHERE id = $1 RETURNING *`,
      [req.params.id, b.title ?? null, b.description ?? null, b.agenda ?? null, b.location ?? null,
       b.eventDate ?? null, b.startTime ?? null, b.endTime ?? null, b.points ?? null, b.kind ?? null,
       b.capacity ?? null, b.status ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'ไม่พบกิจกรรมนี้' });
    await logAudit(req.user.id, 'event.update', rows[0].title);
    res.json({ event: rows[0] });
  } catch (err) {
    next(err);
  }
});

// เช็คอินหน้างานด้วย QR ของพนักงาน แล้วจ่ายคะแนนให้ทันที
router.post('/events/:id/check-in', async (req, res, next) => {
  try {
    const { employeeCode } = req.body || {};
    if (!employeeCode) return res.status(400).json({ error: 'ระบุรหัสพนักงาน' });

    const result = await withTransaction(async (client) => {
      const { rows: users } = await client.query(
        `SELECT id, display_name FROM users WHERE employee_code = $1`,
        [employeeCode]
      );
      if (!users[0]) return { code: 404, body: { error: 'ไม่พบพนักงานรหัสนี้' } };

      const { rows: events } = await client.query('SELECT id, title, points FROM events WHERE id = $1', [
        req.params.id,
      ]);
      if (!events[0]) return { code: 404, body: { error: 'ไม่พบกิจกรรมนี้' } };

      const { rows: reg } = await client.query(
        `UPDATE event_registrations SET status = 'attended', checked_in_at = now()
         WHERE event_id = $1 AND user_id = $2 AND status = 'registered' RETURNING id`,
        [events[0].id, users[0].id]
      );
      if (!reg[0]) return { code: 409, body: { error: 'พนักงานคนนี้ยังไม่ได้ลงทะเบียน หรือเช็คอินไปแล้ว' } };

      if (events[0].points > 0) {
        await client.query('UPDATE users SET points = points + $2 WHERE id = $1', [
          users[0].id,
          events[0].points,
        ]);
        await client.query(
          `INSERT INTO point_transactions (user_id, kind, source, title, points)
           VALUES ($1,'earn','event',$2,$3)`,
          [users[0].id, `เข้าร่วม ${events[0].title}`, events[0].points]
        );
        await client.query(
          `INSERT INTO notifications (user_id, category, title, body) VALUES ($1,'point',$2,$3)`,
          [users[0].id, `คุณได้รับ ${events[0].points} คะแนน`, `จากการเข้าร่วมกิจกรรม ${events[0].title}`]
        );
      }
      return { code: 200, body: { ok: true, name: users[0].display_name, points: events[0].points } };
    });

    if (result.code === 200) await logAudit(req.user.id, 'event.check-in', employeeCode, result.body.name);
    res.status(result.code).json(result.body);
  } catch (err) {
    next(err);
  }
});

/* ---------- ประกาศ ---------- */

router.get('/notifications', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT n.id, n.category, n.title, n.body, n.channel, n.created_at,
              u.display_name AS target_name
       FROM notifications n LEFT JOIN users u ON u.id = n.user_id
       ORDER BY n.created_at DESC LIMIT 200`
    );
    res.json({ notifications: rows });
  } catch (err) {
    next(err);
  }
});

router.post('/notifications', async (req, res, next) => {
  try {
    const { title, body, category = 'announce', channel = 'in-app', userId = null } = req.body || {};
    if (!title) return res.status(400).json({ error: 'กรอกหัวข้อประกาศ' });
    const { rows } = await query(
      `INSERT INTO notifications (user_id, category, title, body, channel)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, category, title, body || '', channel]
    );
    await logAudit(req.user.id, 'notification.create', title);
    res.status(201).json({ notification: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
