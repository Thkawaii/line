package controllers

import (
	"net/http"
	"strings"

	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
ประกาศข่าวสารที่ต้องกดรับทราบ

ต่างจากการแจ้งเตือนทั่วไปตรงที่ประกาศชนิดนี้ "บังคับอ่าน"
พนักงานเข้าระบบมาแล้วจะถูกแสดงทันที และต้องเลื่อนอ่านจนสุดก่อนจึงกดรับทราบได้

ระบบเก็บไว้ว่าใครกดรับทราบเมื่อไหร่ ใช้เป็นหลักฐานว่าแจ้งแล้วจริง
และผู้ดูแลดูได้ว่าแผนกไหนยังอ่านไม่ครบ ใช้ตัวนับรายแผนกตัวเดียวกับหน้ารายงาน
*/

// visibleAnnouncements คือเงื่อนไขว่าประกาศไหนกำลังแสดงอยู่
// แยกเป็นค่าคงที่เพราะใช้ซ้ำหลายคิวรี และต้องตรงกันทุกที่
const visibleAnnouncements = `
	a.status = 'published'
	AND (a.starts_at IS NULL OR a.starts_at <= CURRENT_DATE)
	AND (a.ends_at   IS NULL OR a.ends_at   >= CURRENT_DATE)`

/* ---------- ฝั่งพนักงาน ---------- */

// Announcements ส่งประกาศที่พนักงานคนนี้ยังไม่ได้กดรับทราบ
//
// เรียงจากเก่าไปใหม่ เพราะถ้ามีค้างหลายฉบับควรให้อ่านตามลำดับที่ประกาศออกมา
func Announcements(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	rows, err := store.Query(`
		SELECT a.id, a.title, a.summary, a.body, a.image_url, a.require_ack,
		       a.link_url, a.link_label, a.file_url, a.file_name,
		       a.created_at, a.translations
		FROM announcements a
		LEFT JOIN announcement_acks k ON k.announcement_id = a.id AND k.user_id = $1
		WHERE `+visibleAnnouncements+` AND k.user_id IS NULL
		ORDER BY a.created_at`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"announcements": localize(rows, requestLanguage(r))})
}

// AcknowledgeAnnouncement บันทึกว่าพนักงานกดรับทราบแล้ว
//
// กดซ้ำไม่เป็นไร เพราะเปิดหลายแท็บแล้วกดพร้อมกันเกิดขึ้นได้จริง
func AcknowledgeAnnouncement(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสประกาศไม่ถูกต้อง")
		return
	}

	if _, err := store.Exec(`
		INSERT INTO announcement_acks (announcement_id, user_id) VALUES ($1, $2)
		ON CONFLICT DO NOTHING`, id, claims.ID); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

/* ---------- ฝั่งผู้ดูแลระบบ ---------- */

func AdminAnnouncements(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT a.id, a.title, a.summary, a.body, a.image_url, a.status, a.require_ack,
		       a.link_url, a.link_label, a.file_url, a.file_name,
		       a.starts_at, a.ends_at, a.created_at,
		       (SELECT count(*)::int FROM announcement_acks k WHERE k.announcement_id = a.id)
		         AS acknowledged,
		       (SELECT count(*)::int FROM users u
		          WHERE u.role = 'user' AND u.status = 'Active') AS audience
		FROM announcements a
		ORDER BY a.created_at DESC`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"announcements": rows})
}

type announcementBody struct {
	Title      *string `json:"title"`
	Summary    *string `json:"summary"`
	Body       *string `json:"body"`
	ImageURL   *string `json:"imageUrl"`
	Status     *string `json:"status"`
	RequireAck *bool   `json:"requireAck"`
	LinkURL    *string `json:"linkUrl"`
	LinkLabel  *string `json:"linkLabel"`
	FileURL    *string `json:"fileUrl"`
	FileName   *string `json:"fileName"`
	StartsAt   *string `json:"startsAt"`
	EndsAt     *string `json:"endsAt"`
}

func AdminCreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body announcementBody
	if err := web.Decode(r, &body); err != nil || body.Title == nil ||
		strings.TrimSpace(*body.Title) == "" {
		web.Error(w, http.StatusBadRequest, "กรอกหัวข้อประกาศก่อน")
		return
	}

	row, err := store.QueryOne(`
		INSERT INTO announcements
		  (title, summary, body, image_url, status, require_ack, starts_at, ends_at,
		   link_url, link_label, file_url, file_name)
		VALUES ($1, COALESCE($2,''), COALESCE($3,''), $4, COALESCE($5,'published'),
		        COALESCE($6,true), $7::date, $8::date,
		        $9::text, COALESCE($10,''), $11::text, COALESCE($12,''))
		RETURNING *`,
		strings.TrimSpace(*body.Title), body.Summary, body.Body,
		emptyToNull(body.ImageURL), body.Status, body.RequireAck,
		emptyToNull(body.StartsAt), emptyToNull(body.EndsAt),
		emptyToNull(body.LinkURL), body.LinkLabel,
		emptyToNull(body.FileURL), body.FileName)
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "announcement.create", *body.Title, "")
	web.JSON(w, http.StatusCreated, web.Map{"announcement": row})
}

func AdminUpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสประกาศไม่ถูกต้อง")
		return
	}

	var body announcementBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`
		UPDATE announcements SET
		  title       = COALESCE($2::varchar, title),
		  summary     = COALESCE($3::varchar, summary),
		  body        = COALESCE($4::text, body),
		  image_url   = COALESCE($5::text, image_url),
		  status      = COALESCE($6::varchar, status),
		  require_ack = COALESCE($7::boolean, require_ack),
		  starts_at   = COALESCE($8::date, starts_at),
		  ends_at     = COALESCE($9::date, ends_at),
		  -- ส่งค่าว่างมาคือตั้งใจลบลิงก์หรือไฟล์แนบทิ้ง จึงใช้ค่าที่ส่งมาตรง ๆ
		  link_url    = CASE WHEN $10::boolean THEN $11::text ELSE link_url END,
		  link_label  = COALESCE($12::varchar, link_label),
		  file_url    = CASE WHEN $13::boolean THEN $14::text ELSE file_url END,
		  file_name   = COALESCE($15::varchar, file_name)
		WHERE id = $1 RETURNING *`,
		id, body.Title, body.Summary, body.Body, body.ImageURL, body.Status,
		body.RequireAck, emptyToNull(body.StartsAt), emptyToNull(body.EndsAt),
		body.LinkURL != nil, emptyToNull(body.LinkURL), body.LinkLabel,
		body.FileURL != nil, emptyToNull(body.FileURL), body.FileName)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบประกาศนี้")
		return
	}

	title, _ := row["title"].(string)
	logAudit(claims.ID, "announcement.update", title, "")
	web.JSON(w, http.StatusOK, web.Map{"announcement": row})
}

func AdminDeleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสประกาศไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`DELETE FROM announcements WHERE id = $1 RETURNING title`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบประกาศนี้")
		return
	}

	title, _ := row["title"].(string)
	logAudit(claims.ID, "announcement.delete", title, "")
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

// AdminAnnouncementReaders บอกว่าใครกดรับทราบแล้วและแผนกไหนยังค้าง
func AdminAnnouncementReaders(w http.ResponseWriter, r *http.Request) {
	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสประกาศไม่ถูกต้อง")
		return
	}

	// ใช้ตัวนับรายแผนกตัวเดียวกับรายงานสรุป ตัวเลขของทุกหน้าจึงตรงกัน
	departments, progress, err := DepartmentProgress("announcement_acks", "announcement_id", id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	pending, err := store.Query(`
		SELECT u.employee_code, u.display_name, u.department, u.position, u.branch
		FROM users u
		LEFT JOIN announcement_acks k ON k.user_id = u.id AND k.announcement_id = $1
		WHERE u.role = 'user' AND u.status = 'Active' AND k.user_id IS NULL
		ORDER BY u.branch, u.department, u.employee_code`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"departments": departments,
		"progress":    progress,
		"pending":     pending,
	})
}
