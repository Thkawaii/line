package controllers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"rewards/middleware"
	"rewards/security"
	"rewards/store"
	"rewards/web"
)

/* ---------- Banner ---------- */

func AdminBanners(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT id, title, image_url, link_url, sort_order, active, translations
		FROM banners ORDER BY sort_order, id`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"banners": rows})
}

type bannerBody struct {
	Title        *string         `json:"title"`
	Translations json.RawMessage `json:"translations"`
	ImageURL     *string         `json:"imageUrl"`
	LinkURL      *string         `json:"linkUrl"`
	SortOrder    *int            `json:"sortOrder"`
	Active       *bool           `json:"active"`
}

func AdminCreateBanner(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body bannerBody
	if err := web.Decode(r, &body); err != nil || body.Title == nil || *body.Title == "" {
		web.Error(w, http.StatusBadRequest, "กรอกชื่อแบนเนอร์")
		return
	}

	banner, err := store.QueryOne(`
		INSERT INTO banners (title, image_url, link_url, sort_order, active, translations)
		VALUES ($1, $2, $3, COALESCE($4::int,0), COALESCE($5::boolean,true),
		        COALESCE($6::jsonb,'{}'::jsonb)) RETURNING *`,
		body.Title, emptyToNull(body.ImageURL), emptyToNull(body.LinkURL), body.SortOrder, body.Active,
		jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "banner.create", *body.Title, "")
	web.JSON(w, http.StatusCreated, web.Map{"banner": banner})
}

func AdminUpdateBanner(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสแบนเนอร์ไม่ถูกต้อง")
		return
	}

	var body bannerBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	banner, err := store.QueryOne(`
		UPDATE banners SET
		  title = COALESCE($2::varchar, title),
		  image_url = COALESCE($3::text, image_url),
		  link_url = COALESCE($4::text, link_url),
		  sort_order = COALESCE($5::int, sort_order),
		  active = COALESCE($6::boolean, active),
		  translations = COALESCE($7::jsonb, translations)
		WHERE id = $1 RETURNING *`,
		id, body.Title, body.ImageURL, body.LinkURL, body.SortOrder, body.Active,
		jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if banner == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบแบนเนอร์นี้")
		return
	}

	title, _ := banner["title"].(string)
	logAudit(claims.ID, "banner.update", title, "")
	web.JSON(w, http.StatusOK, web.Map{"banner": banner})
}

func AdminDeleteBanner(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสแบนเนอร์ไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`DELETE FROM banners WHERE id = $1 RETURNING title`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบแบนเนอร์นี้")
		return
	}

	title, _ := row["title"].(string)
	logAudit(claims.ID, "banner.delete", title, "")
	w.WriteHeader(http.StatusNoContent)
}

/* ---------- FAQ ---------- */

func AdminFaqs(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(
		`SELECT id, question, answer, sort_order, translations FROM faqs ORDER BY sort_order, id`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"faqs": rows})
}

type faqBody struct {
	Question     *string         `json:"question"`
	Answer       *string         `json:"answer"`
	SortOrder    *int            `json:"sortOrder"`
	Translations json.RawMessage `json:"translations"`
}

func AdminCreateFaq(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body faqBody
	if err := web.Decode(r, &body); err != nil ||
		body.Question == nil || *body.Question == "" || body.Answer == nil || *body.Answer == "" {
		web.Error(w, http.StatusBadRequest, "กรอกคำถามและคำตอบให้ครบ")
		return
	}

	faq, err := store.QueryOne(
		`INSERT INTO faqs (question, answer, sort_order, translations)
		 VALUES ($1,$2,COALESCE($3::int,0),COALESCE($4::jsonb,'{}'::jsonb)) RETURNING *`,
		body.Question, body.Answer, body.SortOrder, jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "faq.create", *body.Question, "")
	web.JSON(w, http.StatusCreated, web.Map{"faq": faq})
}

func AdminUpdateFaq(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสคำถามไม่ถูกต้อง")
		return
	}

	var body faqBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	faq, err := store.QueryOne(`
		UPDATE faqs SET question = COALESCE($2::varchar, question),
		                answer = COALESCE($3::text, answer),
		                sort_order = COALESCE($4::int, sort_order),
		                translations = COALESCE($5::jsonb, translations)
		WHERE id = $1 RETURNING *`,
		id, body.Question, body.Answer, body.SortOrder, jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if faq == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบคำถามนี้")
		return
	}

	question, _ := faq["question"].(string)
	logAudit(claims.ID, "faq.update", question, "")
	web.JSON(w, http.StatusOK, web.Map{"faq": faq})
}

func AdminDeleteFaq(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสคำถามไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`DELETE FROM faqs WHERE id = $1 RETURNING question`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบคำถามนี้")
		return
	}

	question, _ := row["question"].(string)
	logAudit(claims.ID, "faq.delete", question, "")
	w.WriteHeader(http.StatusNoContent)
}

/* ---------- Terms & Policy ---------- */

func AdminPolicies(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(
		`SELECT key, title, content, translations, updated_at FROM policies ORDER BY key`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"policies": rows})
}

func AdminSavePolicy(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Title        string          `json:"title"`
		Content      string          `json:"content"`
		Translations json.RawMessage `json:"translations"`
	}
	if err := web.Decode(r, &body); err != nil || body.Title == "" || body.Content == "" {
		web.Error(w, http.StatusBadRequest, "กรอกหัวข้อและเนื้อหาให้ครบ")
		return
	}

	policy, err := store.QueryOne(`
		INSERT INTO policies (key, title, content, translations, updated_at)
		VALUES ($1,$2,$3,COALESCE($4::jsonb,'{}'::jsonb), now())
		ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content,
		  translations = COALESCE(EXCLUDED.translations, policies.translations), updated_at = now()
		RETURNING *`, r.PathValue("key"), body.Title, body.Content, jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "policy.update", body.Title, "")
	web.JSON(w, http.StatusOK, web.Map{"policy": policy})
}

/* ---------- Membership ---------- */

func AdminTiers(w http.ResponseWriter, r *http.Request) {
	where := []string{}
	args := []any{}

	if q := web.Param(r, "q", ""); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf(`(t.name ILIKE $%[1]d OR t.description ILIKE $%[1]d)`, len(args)))
	}
	if status := web.Param(r, "status", ""); status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf(`t.status = $%d`, len(args)))
	}

	clause := ""
	if len(where) > 0 {
		clause = "WHERE " + strings.Join(where, " AND ")
	}

	rows, err := store.Query(`
		SELECT t.*, (SELECT count(*)::int FROM users u WHERE u.role = 'user' AND u.tier = t.key) AS member_count
		FROM tiers t `+clause+` ORDER BY t.sort_order`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	// ตัวเลขสรุปด้านบนนับจากทั้งหมดเสมอ ไม่ขึ้นกับตัวกรองที่ผู้ใช้เลือก
	total, err := store.Count(`SELECT count(*)::int FROM tiers`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	active, err := store.Count(`SELECT count(*)::int FROM tiers WHERE status = 'active'`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	members, err := store.Count(`SELECT count(*)::int FROM users WHERE role = 'user'`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"tiers":        rows,
		"totalTiers":   total,
		"activeTiers":  active,
		"totalMembers": members,
	})
}

type tierBody struct {
	Key          string          `json:"key"`
	Translations json.RawMessage `json:"translations"`
	Name         *string         `json:"name"`
	Subtitle     *string         `json:"subtitle"`
	Description  *string         `json:"description"`
	MinPoints    *int            `json:"minPoints"`
	Multiplier   *float64        `json:"multiplier"`
	Benefits     *string         `json:"benefits"`
	Color        *string         `json:"color"`
	Status       *string         `json:"status"`
	SortOrder    *int            `json:"sortOrder"`
}

func AdminCreateTier(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body tierBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}
	if body.Key == "" || body.Name == nil || *body.Name == "" {
		web.Error(w, http.StatusBadRequest, "กรอกรหัสระดับและชื่อระดับ")
		return
	}

	tier, err := store.QueryOne(`
		INSERT INTO tiers (key, name, subtitle, description, min_points, multiplier, benefits, color, status, sort_order, translations)
		VALUES ($1, $2, COALESCE($3,''), COALESCE($4,''), COALESCE($5::int,0), COALESCE($6::numeric,1.0),
		        COALESCE($7,''), COALESCE($8::varchar,'slate'), COALESCE($9::varchar,'active'),
		        COALESCE($10::int, (SELECT COALESCE(max(sort_order),0) + 1 FROM tiers)),
		        COALESCE($11::jsonb,'{}'::jsonb))
		RETURNING *`,
		body.Key, body.Name, body.Subtitle, body.Description, body.MinPoints, body.Multiplier,
		body.Benefits, body.Color, body.Status, body.SortOrder, jsonOrNil(body.Translations))
	if err != nil {
		if isUniqueViolation(err) {
			web.Error(w, http.StatusConflict, "มีระดับสมาชิกรหัสนี้อยู่แล้ว")
			return
		}
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "tier.create", *body.Name, "")
	web.JSON(w, http.StatusCreated, web.Map{"tier": tier})
}

func AdminDeleteTier(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)
	key := r.PathValue("key")

	// กันลบระดับที่ยังมีพนักงานอยู่ ไม่งั้นข้อมูลพนักงานจะชี้ไปยังระดับที่ไม่มีแล้ว
	used, err := store.Count(`SELECT count(*)::int FROM users WHERE tier = $1`, key)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if used > 0 {
		web.Error(w, http.StatusConflict,
			fmt.Sprintf("ลบไม่ได้ ยังมีพนักงาน %d คนอยู่ในระดับนี้", used))
		return
	}

	row, err := store.QueryOne(`DELETE FROM tiers WHERE key = $1 RETURNING name`, key)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบระดับสมาชิกนี้")
		return
	}

	name, _ := row["name"].(string)
	logAudit(claims.ID, "tier.delete", name, "")
	w.WriteHeader(http.StatusNoContent)
}

func AdminUpdateTier(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body tierBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	tier, err := store.QueryOne(`
		UPDATE tiers SET name = COALESCE($2::varchar, name),
		                 subtitle = COALESCE($3::varchar, subtitle),
		                 description = COALESCE($4::text, description),
		                 min_points = COALESCE($5::int, min_points),
		                 multiplier = COALESCE($6::numeric, multiplier),
		                 benefits = COALESCE($7::text, benefits),
		                 color = COALESCE($8::varchar, color),
		                 status = COALESCE($9::varchar, status),
		                 sort_order = COALESCE($10::int, sort_order),
		                 translations = COALESCE($11::jsonb, translations)
		WHERE key = $1 RETURNING *`,
		r.PathValue("key"), body.Name, body.Subtitle, body.Description, body.MinPoints,
		body.Multiplier, body.Benefits, body.Color, body.Status, body.SortOrder,
		jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if tier == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบระดับสมาชิกนี้")
		return
	}

	name, _ := tier["name"].(string)
	logAudit(claims.ID, "tier.update", name, fmt.Sprintf("เกณฑ์ %v คะแนน", tier["min_points"]))
	web.JSON(w, http.StatusOK, web.Map{"tier": tier})
}

// AdminRecalculateTiers คำนวณระดับสมาชิกใหม่ทั้งระบบตามเกณฑ์คะแนนล่าสุด
func AdminRecalculateTiers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	result, err := store.Exec(`
		UPDATE users u SET tier = COALESCE(
		  (SELECT t.key FROM tiers t WHERE u.points >= t.min_points ORDER BY t.min_points DESC LIMIT 1),
		  u.tier)
		WHERE u.role = 'user'`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	updated, _ := result.RowsAffected()
	logAudit(claims.ID, "tier.recalculate", "พนักงานทั้งหมด", fmt.Sprintf("%d บัญชี", updated))
	web.JSON(w, http.StatusOK, web.Map{"updated": updated})
}

/* ---------- Admin Accounts ---------- */

func AdminAdmins(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`SELECT ` + PublicUser + ` FROM users WHERE role = 'admin' ORDER BY created_at`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"admins": rows})
}

func AdminCreateAdmin(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		EmployeeCode string `json:"employeeCode"`
		Username     string `json:"username"`
		Email        string `json:"email"`
		DisplayName  string `json:"displayName"`
		Department   string `json:"department"`
		Position     string `json:"position"`
		Password     string `json:"password"`
	}
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	if body.Username == "" || body.Email == "" || body.DisplayName == "" || body.Password == "" {
		web.Error(w, http.StatusBadRequest, "กรอกชื่อผู้ใช้ อีเมล ชื่อที่แสดง และรหัสผ่านให้ครบ")
		return
	}
	if len(body.Password) < 8 {
		web.Error(w, http.StatusBadRequest, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
		return
	}

	hash, err := security.HashPassword(body.Password)
	if err != nil {
		web.Fail(w, err)
		return
	}

	code := body.EmployeeCode
	if code == "" {
		code = strings.ToUpper(body.Username)
	}
	position := body.Position
	if position == "" {
		position = "ผู้ดูแลระบบ"
	}

	admin, err := store.QueryOne(`
		INSERT INTO users (employee_code, username, email, password_hash, display_name, department, position, role)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'admin') RETURNING `+PublicUser,
		code, body.Username, body.Email, hash, body.DisplayName, body.Department, position)
	if err != nil {
		if isUniqueViolation(err) {
			web.Error(w, http.StatusConflict, "ชื่อผู้ใช้ อีเมล หรือรหัสนี้ถูกใช้แล้ว")
			return
		}
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "admin.create", body.Username, "")
	web.JSON(w, http.StatusCreated, web.Map{"admin": admin})
}

func AdminUpdateAdmin(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสบัญชีไม่ถูกต้อง")
		return
	}

	var body struct {
		DisplayName *string `json:"displayName"`
		Email       *string `json:"email"`
		Department  *string `json:"department"`
		Position    *string `json:"position"`
		Status      *string `json:"status"`
		Password    *string `json:"password"`
	}
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	if id == claims.ID && body.Status != nil && *body.Status == "Inactive" {
		web.Error(w, http.StatusBadRequest, "ระงับบัญชีของตัวเองไม่ได้")
		return
	}

	var hash any
	if body.Password != nil && *body.Password != "" {
		if len(*body.Password) < 8 {
			web.Error(w, http.StatusBadRequest, "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
			return
		}
		encoded, err := security.HashPassword(*body.Password)
		if err != nil {
			web.Fail(w, err)
			return
		}
		hash = encoded
	}

	admin, err := store.QueryOne(`
		UPDATE users SET display_name = COALESCE($2::varchar, display_name),
		                 email = COALESCE($3::varchar, email),
		                 department = COALESCE($4::varchar, department),
		                 position = COALESCE($5::varchar, position),
		                 status = COALESCE($6::varchar, status),
		                 password_hash = COALESCE($7::text, password_hash)
		WHERE id = $1 AND role = 'admin' RETURNING `+PublicUser,
		id, body.DisplayName, body.Email, body.Department, body.Position, body.Status, hash)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if admin == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบบัญชีผู้ดูแลนี้")
		return
	}

	username, _ := admin["username"].(string)
	detail := ""
	if hash != nil {
		detail = "เปลี่ยนรหัสผ่าน"
	}
	logAudit(claims.ID, "admin.update", username, detail)
	web.JSON(w, http.StatusOK, web.Map{"admin": admin})
}

/* ---------- System Settings ---------- */

func AdminSettings(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`SELECT key, value, label, kind, updated_at FROM settings ORDER BY key`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"settings": rows})
}

func AdminSaveSettings(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Values map[string]any `json:"values"`
	}
	if err := web.Decode(r, &body); err != nil || len(body.Values) == 0 {
		web.Error(w, http.StatusBadRequest, "ไม่มีค่าที่จะบันทึก")
		return
	}

	keys := make([]string, 0, len(body.Values))
	for key, value := range body.Values {
		if _, err := store.Exec(
			`UPDATE settings SET value = $2, updated_at = now() WHERE key = $1`,
			key, fmt.Sprintf("%v", value)); err != nil {
			web.Fail(w, err)
			return
		}
		keys = append(keys, key)
	}

	logAudit(claims.ID, "settings.update", "ตั้งค่าระบบ", strings.Join(keys, ", "))

	rows, err := store.Query(`SELECT key, value, label, kind, updated_at FROM settings ORDER BY key`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"settings": rows})
}

/* ---------- Audit Logs ---------- */

func AdminAuditLogs(w http.ResponseWriter, r *http.Request) {
	args := []any{}
	clause := ""
	if q := web.Param(r, "q", ""); q != "" {
		args = append(args, "%"+q+"%")
		clause = `WHERE (l.action ILIKE $1 OR l.target ILIKE $1 OR u.display_name ILIKE $1)`
	}

	limit := web.IntParam(r, "limit", 20, 1, 100)
	page := web.IntParam(r, "page", 1, 1, 1000000)
	offset := (page - 1) * limit

	logs, err := store.Query(fmt.Sprintf(`
		SELECT l.id, l.action, l.target, l.detail, l.created_at,
		       u.display_name AS actor_name, u.username AS actor_username
		FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
		%s ORDER BY l.created_at DESC LIMIT %d OFFSET %d`, clause, limit, offset), args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	total, err := store.Count(
		`SELECT count(*)::int FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id `+clause, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"logs": logs, "total": total, "page": page, "limit": limit})
}

/* ---------- Systems Event (เทมเพลตแจ้งเตือนอัตโนมัติ) ---------- */

func AdminNotificationEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT key, name, description, in_app, email, active, updated_at
		FROM notification_events ORDER BY sort_order`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"events": rows})
}

func AdminUpdateNotificationEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		InApp  *bool `json:"inApp"`
		Email  *bool `json:"email"`
		Active *bool `json:"active"`
	}
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	event, err := store.QueryOne(`
		UPDATE notification_events SET
		  in_app = COALESCE($2::boolean, in_app),
		  email  = COALESCE($3::boolean, email),
		  active = COALESCE($4::boolean, active),
		  updated_at = now()
		WHERE key = $1 RETURNING *`,
		r.PathValue("key"), body.InApp, body.Email, body.Active)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if event == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบรายการนี้")
		return
	}

	name, _ := event["name"].(string)
	logAudit(claims.ID, "notification-event.update", name, "")
	web.JSON(w, http.StatusOK, web.Map{"event": event})
}

func emptyToNull(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	return *value
}
