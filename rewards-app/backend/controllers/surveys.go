package controllers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"rewards/config"
	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
หัวข้อลงทะเบียน / แบบสำรวจ / การแสดงความคิดเห็น

ความเป็นส่วนตัวคือหัวใจของไฟล์นี้ ขอเขียนให้ชัดว่าใครเห็นอะไร

	สรุปรายแผนก (summary)    ผู้ดูแลระบบและฝ่ายธุรการ (role ga)
	                         มีแต่ตัวเลข — กี่คน เสร็จกี่คน เหลือกี่ % ไม่มีชื่อใครเลย

	รายชื่อคนที่ยังไม่ทำ      เฉพาะ role admin
	(pending)                มีไว้เพื่อติดตามและแจ้งเตือนเท่านั้น
	                         การที่คนหนึ่ง "ยังไม่ทำ" ไม่ได้เปิดเผยคำตอบของใคร

	คำตอบและความคิดเห็น       เฉพาะ role admin และถ้าหัวข้อตั้ง anonymous = true
	(responses)              จะไม่ส่งชื่อผู้ตอบออกไปเลย แม้แต่กับผู้ดูแลระบบ
	                         เพราะเราสัญญากับพนักงานไว้ว่าตอบได้โดยไม่ต้องกลัว

ระบบยังเก็บ user_id ไว้ในตาราง เพราะจำเป็นสำหรับกันตอบซ้ำและนับยอดรายแผนก
แต่ไม่มี API ไหนส่งการจับคู่ "คนนี้ตอบอย่างนี้" ออกไปเมื่อหัวข้อเป็นแบบไม่ระบุตัวตน
*/

/* ---------- ตัวช่วย ---------- */

// เลือกเฉพาะพนักงานที่ยังทำงานอยู่ ไม่นับผู้ดูแลระบบและฝ่ายธุรการ
const activeEmployees = `u.role = 'user' AND u.status = 'Active'`

func topicByID(id int64) (store.Row, error) {
	return store.QueryOne(`
		SELECT id, title, heading, description, revision, as_of_label, kind, anonymous,
		       status, starts_at, ends_at, points, questions, translations, created_at
		FROM survey_topics WHERE id = $1`, id)
}

func isAdmin(r *http.Request) bool {
	claims := middleware.CurrentUser(r)
	return claims != nil && claims.Role == "admin"
}

/* ---------- ฝั่งผู้ดูแลระบบ / ฝ่ายธุรการ ---------- */

// AdminSurveys รายการหัวข้อทั้งหมด พร้อมยอดรวมคร่าว ๆ
func AdminSurveys(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT t.id, t.title, t.heading, t.description, t.revision, t.as_of_label,
		       t.kind, t.anonymous, t.status, t.starts_at, t.ends_at, t.points,
		       t.questions, t.created_at,
		       (SELECT count(*)::int FROM survey_responses s WHERE s.topic_id = t.id) AS completed,
		       (SELECT count(*)::int FROM users u WHERE ` + activeEmployees + `) AS manpower
		FROM survey_topics t
		ORDER BY t.status = 'closed', t.created_at DESC`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"topics": rows, "canSeeNames": isAdmin(r)})
}

type topicBody struct {
	Title       *string         `json:"title"`
	Heading     *string         `json:"heading"`
	Description *string         `json:"description"`
	Revision    *string         `json:"revision"`
	AsOfLabel   *string         `json:"asOfLabel"`
	Kind        *string         `json:"kind"`
	Anonymous   *bool           `json:"anonymous"`
	Status      *string         `json:"status"`
	StartsAt    *string         `json:"startsAt"`
	EndsAt      *string         `json:"endsAt"`
	Points      *int            `json:"points"`
	Questions   json.RawMessage `json:"questions"`
}

func AdminCreateSurvey(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body topicBody
	if err := web.Decode(r, &body); err != nil || body.Title == nil ||
		strings.TrimSpace(*body.Title) == "" {
		web.Error(w, http.StatusBadRequest, "กรอกชื่อหัวข้อก่อน")
		return
	}

	topic, err := store.QueryOne(`
		INSERT INTO survey_topics
		  (title, heading, description, revision, as_of_label, kind, anonymous,
		   status, starts_at, ends_at, points, questions)
		VALUES ($1, COALESCE($2,''), COALESCE($3,''), COALESCE($4,'Rev.01'), COALESCE($5,''),
		        COALESCE($6,'register'), COALESCE($7,true), COALESCE($8,'open'),
		        $9::date, $10::date, COALESCE($11,0), COALESCE($12::jsonb,'[]'::jsonb))
		RETURNING *`,
		strings.TrimSpace(*body.Title), body.Heading, body.Description, body.Revision,
		body.AsOfLabel, body.Kind, body.Anonymous, body.Status,
		emptyToNull(body.StartsAt), emptyToNull(body.EndsAt), body.Points,
		jsonOrNil(body.Questions))
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "survey.create", *body.Title, "")
	web.JSON(w, http.StatusCreated, web.Map{"topic": topic})
}

func AdminUpdateSurvey(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	var body topicBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	topic, err := store.QueryOne(`
		UPDATE survey_topics SET
		  title       = COALESCE($2::varchar, title),
		  heading     = COALESCE($3::varchar, heading),
		  description = COALESCE($4::text, description),
		  revision    = COALESCE($5::varchar, revision),
		  as_of_label = COALESCE($6::varchar, as_of_label),
		  kind        = COALESCE($7::varchar, kind),
		  anonymous   = COALESCE($8::boolean, anonymous),
		  status      = COALESCE($9::varchar, status),
		  starts_at   = COALESCE($10::date, starts_at),
		  ends_at     = COALESCE($11::date, ends_at),
		  points      = COALESCE($12::int, points),
		  questions   = COALESCE($13::jsonb, questions)
		WHERE id = $1 RETURNING *`,
		id, body.Title, body.Heading, body.Description, body.Revision, body.AsOfLabel,
		body.Kind, body.Anonymous, body.Status, emptyToNull(body.StartsAt),
		emptyToNull(body.EndsAt), body.Points, jsonOrNil(body.Questions))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if topic == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบหัวข้อนี้")
		return
	}

	title, _ := topic["title"].(string)
	logAudit(claims.ID, "survey.update", title, "")
	web.JSON(w, http.StatusOK, web.Map{"topic": topic})
}

func AdminDeleteSurvey(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`DELETE FROM survey_topics WHERE id = $1 RETURNING title`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบหัวข้อนี้")
		return
	}

	title, _ := row["title"].(string)
	logAudit(claims.ID, "survey.delete", title, "")
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

// AdminSurveySummary สรุปความคืบหน้ารายสาขาและรายแผนก
//
// ผลลัพธ์ไม่มีชื่อหรือรหัสพนักงานอยู่เลยแม้แต่ช่องเดียว จึงเปิดให้ฝ่ายธุรการดูได้
// รูปแบบตรงกับไฟล์ Excel ที่ใช้กันอยู่: Location / Section / Manpower /
// Completed / Not Complete / Completion Rate
func AdminSurveySummary(w http.ResponseWriter, r *http.Request) {
	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	topic, err := topicByID(id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if topic == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบหัวข้อนี้")
		return
	}

	rows, total, err := DepartmentProgress("survey_responses", "topic_id", id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"topic":       topic,
		"rows":        rows,
		"total":       total,
		"canSeeNames": isAdmin(r),
	})
}

/*
DepartmentProgress นับความคืบหน้ารายสาขาและรายแผนก

ใช้ร่วมกันระหว่างหัวข้อลงทะเบียน/แบบสำรวจ กับกิจกรรม เพราะทั้งสองอย่างตอบคำถามเดียวกัน
คือ "แผนกนี้มีกี่คน ทำไปแล้วกี่คน เหลือกี่คน คิดเป็นกี่เปอร์เซ็นต์"

doneTable  ตารางที่บันทึกว่าใครทำไปแล้ว (survey_responses หรือ event_registrations)
idColumn   คอลัมน์ที่ชี้กลับไปหาหัวข้อหรือกิจกรรม (topic_id หรือ event_id)

ตัวนับตั้งต้นจาก "พนักงานทั้งหมดที่ยังทำงานอยู่" ไม่ใช่จากคนที่ลงทะเบียนแล้ว
จึงบอกได้ว่าเหลืออีกกี่คน ไม่ใช่แค่ว่ามีกี่คนที่ทำไปแล้ว

หมายเหตุเรื่องความปลอดภัย: doneTable กับ idColumn ถูกต่อเข้าไปในคำสั่ง SQL ตรง ๆ
จึงต้องเป็นค่าที่เขียนไว้ในโปรแกรมเท่านั้น ห้ามรับมาจากผู้ใช้เด็ดขาด
*/
func DepartmentProgress(doneTable, idColumn string, id int64) ([]store.Row, web.Map, error) {
	rows, err := store.Query(`
		SELECT COALESCE(NULLIF(TRIM(u.branch), ''), '-')     AS location,
		       COALESCE(NULLIF(TRIM(u.department), ''), '-') AS section,
		       count(*)::int                                 AS manpower,
		       count(d.user_id)::int                         AS completed
		FROM users u
		LEFT JOIN `+doneTable+` d ON d.user_id = u.id AND d.`+idColumn+` = $1
		WHERE `+activeEmployees+`
		GROUP BY 1, 2
		ORDER BY 1, 2`, id)
	if err != nil {
		return nil, nil, err
	}

	totalManpower, totalDone := 0, 0
	for _, row := range rows {
		manpower := toInt(row["manpower"])
		completed := toInt(row["completed"])

		row["not_complete"] = manpower - completed
		row["rate"] = ratio(completed, manpower)

		totalManpower += manpower
		totalDone += completed
	}

	total := web.Map{
		"manpower": totalManpower, "completed": totalDone,
		"not_complete": totalManpower - totalDone,
		"rate":         ratio(totalDone, totalManpower),
	}
	return rows, total, nil
}

// ratio คืนสัดส่วน 0–1 ให้หน้าเว็บไปคูณร้อยเอง เพื่อให้ปัดเศษที่เดียว
func ratio(part, whole int) float64 {
	if whole <= 0 {
		return 0
	}
	return float64(part) / float64(whole)
}

// AdminSurveyPending รายชื่อพนักงานที่ยังไม่ได้ทำ — เฉพาะผู้ดูแลระบบ
//
// มีไว้เพื่อติดตามและแจ้งเตือนเท่านั้น ไม่ได้เปิดเผยคำตอบของใคร
func AdminSurveyPending(w http.ResponseWriter, r *http.Request) {
	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	args := []any{id}
	filter := ""
	if section := web.Param(r, "section", ""); section != "" {
		args = append(args, section)
		filter += ` AND u.department = $2`
	}

	rows, err := store.Query(`
		SELECT u.employee_code, u.display_name, u.department, u.position, u.branch, u.email
		FROM users u
		LEFT JOIN survey_responses s ON s.user_id = u.id AND s.topic_id = $1
		WHERE `+activeEmployees+` AND s.id IS NULL`+filter+`
		ORDER BY u.branch, u.department, u.employee_code`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"pending": rows, "total": len(rows)})
}

// AdminSurveyResponses คำตอบและความคิดเห็น — เฉพาะผู้ดูแลระบบ
//
// หัวข้อที่ตั้งเป็นไม่ระบุตัวตนจะไม่ส่งชื่อผู้ตอบออกไป ส่งแค่แผนกเพื่อให้ดูภาพรวมได้
func AdminSurveyResponses(w http.ResponseWriter, r *http.Request) {
	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	topic, err := topicByID(id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if topic == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบหัวข้อนี้")
		return
	}

	anonymous, _ := topic["anonymous"].(bool)

	rows, err := store.Query(`
		SELECT s.id, s.answers, s.comment, s.submitted_at,
		       u.department, u.branch, u.employee_code, u.display_name
		FROM survey_responses s
		JOIN users u ON u.id = s.user_id
		WHERE s.topic_id = $1
		ORDER BY s.submitted_at DESC`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	if anonymous {
		// ตัดตัวระบุตัวตนออกก่อนส่ง ไม่ได้แค่ซ่อนที่หน้าเว็บ
		// เพราะข้อมูลที่ไม่ถูกส่งออกไปคือข้อมูลที่รั่วไม่ได้
		for _, row := range rows {
			delete(row, "employee_code")
			delete(row, "display_name")
		}
	}

	web.JSON(w, http.StatusOK, web.Map{
		"responses": rows, "anonymous": anonymous, "total": len(rows),
	})
}

// AdminRemindSurvey ส่งแจ้งเตือนถึงทุกคนที่ยังไม่ได้ทำ
func AdminRemindSurvey(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	topic, err := topicByID(id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if topic == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบหัวข้อนี้")
		return
	}

	var body struct {
		Message string `json:"message"`
	}
	_ = web.Decode(r, &body)

	title, _ := topic["title"].(string)
	message := strings.TrimSpace(body.Message)
	if message == "" {
		message = "คุณยังไม่ได้ทำรายการ \"" + title + "\" กรุณาดำเนินการให้เรียบร้อย"
	}

	result, err := store.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		SELECT u.id, 'announce', $2, $3
		FROM users u
		LEFT JOIN survey_responses s ON s.user_id = u.id AND s.topic_id = $1
		WHERE `+activeEmployees+` AND s.id IS NULL`,
		id, title, message)
	if err != nil {
		web.Fail(w, err)
		return
	}

	sent, _ := result.RowsAffected()
	logAudit(claims.ID, "survey.remind", title, "แจ้งเตือน "+itoa(int(sent))+" คน")
	web.JSON(w, http.StatusOK, web.Map{"sent": sent})
}

/* ---------- ฝั่งพนักงาน ---------- */

// Surveys รายการที่พนักงานคนนี้ต้องทำ พร้อมสถานะว่าทำไปแล้วหรือยัง
func Surveys(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)
	lang := requestLanguage(r)

	rows, err := store.Query(`
		SELECT t.id, t.title, t.heading, t.description, t.kind, t.anonymous,
		       t.points, t.questions, t.ends_at, t.translations,
		       (s.id IS NOT NULL) AS done, s.submitted_at
		FROM survey_topics t
		LEFT JOIN survey_responses s ON s.topic_id = t.id AND s.user_id = $1
		WHERE t.status = 'open'
		  AND (t.starts_at IS NULL OR t.starts_at <= CURRENT_DATE)
		  AND (t.ends_at   IS NULL OR t.ends_at   >= CURRENT_DATE)
		ORDER BY (s.id IS NOT NULL), t.created_at DESC`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"topics": localize(rows, lang)})
}

// SubmitSurvey รับคำตอบของพนักงาน ตอบได้ครั้งเดียวต่อหัวข้อ
func SubmitSurvey(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสหัวข้อไม่ถูกต้อง")
		return
	}

	var body struct {
		Answers json.RawMessage `json:"answers"`
		Comment string          `json:"comment"`
	}
	_ = web.Decode(r, &body)

	topic, err := topicByID(id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if topic == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบหัวข้อนี้")
		return
	}
	if status, _ := topic["status"].(string); status != "open" {
		web.Error(w, http.StatusBadRequest, "หัวข้อนี้ปิดรับแล้ว")
		return
	}

	// ทำในทรานแซกชันเดียวกับการให้คะแนน จะได้ไม่มีกรณีบันทึกคำตอบแล้วแต่คะแนนไม่เข้า
	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	var responseID int64
	err = tx.QueryRow(`
		INSERT INTO survey_responses (topic_id, user_id, answers, comment)
		VALUES ($1, $2, COALESCE($3::jsonb,'{}'::jsonb), $4)
		ON CONFLICT (topic_id, user_id) DO NOTHING
		RETURNING id`,
		id, claims.ID, jsonOrNil(body.Answers), strings.TrimSpace(body.Comment)).Scan(&responseID)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusConflict, "คุณทำรายการนี้ไปแล้ว")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	// ให้คะแนนถ้าหัวข้อนี้ตั้งไว้ ผ่าน awardPoints ตัวเดียวกับกิจกรรม
	// เพื่อให้ตัวคูณของระดับสมาชิกและการเลื่อนระดับทำงานเหมือนกันทุกทาง
	title, _ := topic["title"].(string)
	awarded := 0
	if points := toInt(topic["points"]); points > 0 {
		tierUp := ""
		awarded, tierUp, err = awardPoints(tx, claims.ID, points)
		if err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points)
			VALUES ($1,'earn','event',$2,$3)`, claims.ID, title, awarded); err != nil {
			web.Fail(w, err)
			return
		}
		if err := notifyTierUp(tx, claims.ID, tierUp); err != nil {
			web.Fail(w, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"ok": true, "points": awarded})
}
