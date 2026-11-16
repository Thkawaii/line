package controllers

import (
	"net/http"

	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
แบบประเมินความพึงพอใจหลังกิจกรรม

ขึ้นให้ตอบก่อนกิจกรรมจบตามจำนวนชั่วโมงที่ตั้งไว้ในหน้าตั้งค่าระบบ
เหตุผลที่ขึ้นก่อนจบ ไม่ใช่หลังจบ เพราะคนยังอยู่ในงานและยังจำบรรยากาศได้
ถ้ารอจนกลับบ้านแล้วค่อยส่ง อัตราการตอบจะตกลงมาก

ตอบได้เฉพาะคนที่ลงทะเบียนกิจกรรมนั้นจริง และตอบได้ครั้งเดียว
*/

// feedbackWindow คืนเงื่อนไข SQL ของช่วงเวลาที่เปิดให้ตอบ
//
// เวลาจบกิจกรรมคิดจากวันสุดท้ายของงานบวกเวลาเลิก
// กิจกรรมหลายวันจึงใช้วันสุดท้าย ไม่ใช่วันแรก
const feedbackWindow = `
	(COALESCE(e.end_date, e.event_date) + e.end_time) - make_interval(hours => $2) <= now()
	AND now() < (COALESCE(e.end_date, e.event_date) + e.end_time) + make_interval(days => $3)`

/* ---------- ฝั่งพนักงาน ---------- */

// PendingFeedback ส่งกิจกรรมที่ถึงเวลาให้ประเมินแล้วแต่ยังไม่ได้ตอบ
func PendingFeedback(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	lead := settingInt("event.feedbackLeadHours", 1, 0, 720)
	open := settingInt("event.feedbackOpenDays", 7, 1, 365)

	rows, err := store.Query(`
		SELECT e.id, e.title, e.image_url, e.location,
		       COALESCE(e.end_date, e.event_date) AS last_day, e.end_time
		FROM events e
		JOIN event_registrations r ON r.event_id = e.id AND r.user_id = $1
		LEFT JOIN event_feedback f ON f.event_id = e.id AND f.user_id = $1
		WHERE f.id IS NULL AND`+feedbackWindow+`
		ORDER BY COALESCE(e.end_date, e.event_date), e.end_time`,
		claims.ID, lead, open)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"events": rows})
}

// SubmitFeedback รับคำตอบแบบประเมิน
func SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	eventID, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสกิจกรรมไม่ถูกต้อง")
		return
	}

	var body struct {
		Q1      int    `json:"q1"`
		Q2      int    `json:"q2"`
		Q3      int    `json:"q3"`
		Q4      int    `json:"q4"`
		Q5      int    `json:"q5"`
		Comment string `json:"comment"`
	}
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	// ตรวจที่เซิร์ฟเวอร์ด้วย ไม่พึ่งหน้าเว็บอย่างเดียว เพราะเรียก API ตรงได้
	for _, score := range []int{body.Q1, body.Q2, body.Q3, body.Q4, body.Q5} {
		if score < 1 || score > 5 {
			web.Error(w, http.StatusBadRequest, "กรุณาให้คะแนนครบทุกข้อ")
			return
		}
	}

	// ต้องเป็นคนที่ลงทะเบียนกิจกรรมนี้ และยังอยู่ในช่วงที่เปิดให้ตอบ
	lead := settingInt("event.feedbackLeadHours", 1, 0, 720)
	open := settingInt("event.feedbackOpenDays", 7, 1, 365)

	allowed, err := store.QueryOne(`
		SELECT e.id FROM events e
		JOIN event_registrations r ON r.event_id = e.id AND r.user_id = $4
		WHERE e.id = $1 AND`+feedbackWindow,
		eventID, lead, open, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if allowed == nil {
		web.Error(w, http.StatusForbidden, "ยังไม่ถึงเวลาประเมิน หรือหมดเวลาแล้ว")
		return
	}

	saved, err := store.QueryOne(`
		INSERT INTO event_feedback (event_id, user_id, q1, q2, q3, q4, q5, comment)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (event_id, user_id) DO NOTHING
		RETURNING id`,
		eventID, claims.ID, body.Q1, body.Q2, body.Q3, body.Q4, body.Q5, body.Comment)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if saved == nil {
		web.Error(w, http.StatusConflict, "คุณประเมินกิจกรรมนี้ไปแล้ว")
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

/* ---------- ฝั่งผู้ดูแลระบบ ---------- */

// AdminEventFeedback สรุปผลประเมินของกิจกรรมหนึ่ง
//
// ไม่ส่งชื่อผู้ตอบออกไป เพราะความเห็นเรื่องคุณภาพงานจะตรงไปตรงมาก็ต่อเมื่อ
// คนตอบมั่นใจว่าไม่ถูกตามไปถาม ส่งแค่ค่าเฉลี่ยรายข้อกับข้อเสนอแนะ
func AdminEventFeedback(w http.ResponseWriter, r *http.Request) {
	eventID, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสกิจกรรมไม่ถูกต้อง")
		return
	}

	summary, err := store.QueryOne(`
		SELECT count(*)::int AS answers,
		       round(avg(q1)::numeric, 2)::float AS q1,
		       round(avg(q2)::numeric, 2)::float AS q2,
		       round(avg(q3)::numeric, 2)::float AS q3,
		       round(avg(q4)::numeric, 2)::float AS q4,
		       round(avg(q5)::numeric, 2)::float AS q5,
		       round(avg((q1+q2+q3+q4+q5) / 5.0)::numeric, 2)::float AS overall
		FROM event_feedback WHERE event_id = $1`, eventID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	comments, err := store.Query(`
		SELECT comment, created_at FROM event_feedback
		WHERE event_id = $1 AND TRIM(comment) <> ''
		ORDER BY created_at DESC`, eventID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"summary": summary, "comments": comments})
}

/*
AdminFeedbackOverview รวมผลประเมินของทุกกิจกรรมในช่วงเวลาที่เลือก

ตอบสี่ก้อน

	summary   ค่าเฉลี่ยรายข้อและจำนวนผู้ตอบทั้งหมด
	trend     ค่าเฉลี่ยรวมรายเดือน ใช้ดูว่าคุณภาพงานดีขึ้นหรือแย่ลง
	events    รายกิจกรรม เรียงจากคะแนนต่ำไปสูง งานที่ต้องปรับปรุงจะอยู่บนสุด
	comments  ข้อเสนอแนะทั้งหมด ไม่มีชื่อผู้เขียน

ทุกก้อนไม่มีตัวระบุตัวตนของผู้ตอบเลย แม้แต่รหัสพนักงาน
ไม่ใช่แค่ไม่แสดงที่หน้าจอ แต่ไม่ถูกดึงออกจากฐานข้อมูลตั้งแต่แรก
*/
func AdminFeedbackOverview(w http.ResponseWriter, r *http.Request) {
	f := readFilter(r)
	args := []any{f.since, f.until}

	/*
		กรองเฉพาะกิจกรรมเดียวได้

		ส่ง eventId มาเป็น 0 หรือไม่ส่งเลย = ดูทุกกิจกรรมในปีนั้น
		ใช้พารามิเตอร์ตัวเดียวกันทุกคิวรี เงื่อนไขจึงเขียนไว้ครั้งเดียวแล้วต่อท้ายได้
	*/
	eventID := intParam(r, "eventId", 0, 0, 1<<31)
	args = append(args, eventID)
	eventClause := " AND ($3 = 0 OR f.event_id = $3)"

	summary, err := store.QueryOne(`
		SELECT count(*)::int AS answers,
		       count(DISTINCT f.event_id)::int AS events,
		       round(avg(f.q1)::numeric, 2)::float AS q1,
		       round(avg(f.q2)::numeric, 2)::float AS q2,
		       round(avg(f.q3)::numeric, 2)::float AS q3,
		       round(avg(f.q4)::numeric, 2)::float AS q4,
		       round(avg(f.q5)::numeric, 2)::float AS q5,
		       round(avg((f.q1+f.q2+f.q3+f.q4+f.q5) / 5.0)::numeric, 2)::float AS overall
		FROM event_feedback f
		WHERE f.created_at >= $1 AND f.created_at < $2`+eventClause, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	// เติมเดือนที่ไม่มีคนตอบให้ครบช่วง กราฟจะได้ไม่กระโดดข้ามเดือน
	trend, err := store.Query(`
		WITH months AS (
		  SELECT to_char(m, 'YYYY-MM') AS month
		  FROM generate_series(
		    date_trunc('month', $1::timestamptz),
		    date_trunc('month', $2::timestamptz - interval '1 day'),
		    interval '1 month'
		  ) AS m
		),
		scored AS (
		  SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
		         count(*)::int AS answers,
		         round(avg((q1+q2+q3+q4+q5) / 5.0)::numeric, 2)::float AS score
		  FROM event_feedback
		  WHERE created_at >= $1 AND created_at < $2
		    AND ($3 = 0 OR event_id = $3)
		  GROUP BY 1
		)
		SELECT months.month,
		       COALESCE(scored.answers, 0) AS answers,
		       COALESCE(scored.score, 0)   AS score,
		       (scored.month IS NOT NULL)  AS has_data
		FROM months LEFT JOIN scored USING (month)
		ORDER BY months.month`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	/*
		คะแนนรายเดือนแยกตามกิจกรรม

		ใช้วาดกราฟแท่งแบบจัดกลุ่ม เดือนหนึ่งมีกี่กิจกรรมก็มีกี่แท่ง
		ค่าเฉลี่ยรวมของทั้งเดือนบอกไม่ได้ว่างานไหนได้คะแนนน้อย
		เดือนที่มีงานดีมากกับงานแย่มากปนกัน จะเห็นเป็นคะแนนกลาง ๆ ซึ่งซ่อนปัญหาไว้
	*/
	trendByEvent, err := store.Query(`
		SELECT to_char(date_trunc('month', f.created_at), 'YYYY-MM') AS month,
		       e.id AS event_id, e.title,
		       count(*)::int AS answers,
		       round(avg((f.q1+f.q2+f.q3+f.q4+f.q5) / 5.0)::numeric, 2)::float AS score
		FROM event_feedback f
		JOIN events e ON e.id = f.event_id
		WHERE f.created_at >= $1 AND f.created_at < $2`+eventClause+`
		GROUP BY 1, e.id
		ORDER BY 1, e.title`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	events, err := store.Query(`
		SELECT e.id, e.title, e.event_date,
		       count(f.id)::int AS answers,
		       round(avg(f.q1)::numeric, 2)::float AS q1,
		       round(avg(f.q2)::numeric, 2)::float AS q2,
		       round(avg(f.q3)::numeric, 2)::float AS q3,
		       round(avg(f.q4)::numeric, 2)::float AS q4,
		       round(avg(f.q5)::numeric, 2)::float AS q5,
		       round(avg((f.q1+f.q2+f.q3+f.q4+f.q5) / 5.0)::numeric, 2)::float AS overall
		FROM event_feedback f
		JOIN events e ON e.id = f.event_id
		WHERE f.created_at >= $1 AND f.created_at < $2`+eventClause+`
		GROUP BY e.id
		ORDER BY overall DESC, answers DESC`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	comments, err := store.Query(`
		SELECT f.comment, f.created_at, e.title AS event_title
		FROM event_feedback f
		JOIN events e ON e.id = f.event_id
		WHERE f.created_at >= $1 AND f.created_at < $2 AND TRIM(f.comment) <> ''`+eventClause+`
		ORDER BY f.created_at DESC
		LIMIT 200`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	// รายชื่อกิจกรรมสำหรับช่องเลือก ดึงทุกกิจกรรมที่มีผลประเมินในปีนั้น
	// ไม่กรองด้วย eventID ไม่งั้นเลือกไปแล้วตัวเลือกอื่นจะหายหมด เปลี่ยนกลับไม่ได้
	options, err := store.Query(`
		SELECT DISTINCT e.id, e.title
		FROM event_feedback f JOIN events e ON e.id = f.event_id
		WHERE f.created_at >= $1 AND f.created_at < $2
		ORDER BY e.title`, f.since, f.until)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"summary": summary, "trend": trend, "trendByEvent": trendByEvent,
		"events": events, "comments": comments, "options": options,
	})
}
