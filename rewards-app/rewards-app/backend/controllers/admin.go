package controllers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"rewards/config"
	"rewards/middleware"
	"rewards/security"
	"rewards/store"
	"rewards/web"

	"github.com/lib/pq"
)

/* ---------- ภาพรวม ---------- */

func AdminOverview(w http.ResponseWriter, r *http.Request) {
	staff, err := store.Count(`SELECT count(*)::int FROM users WHERE role = 'user'`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	events, err := store.Count(`SELECT count(*)::int FROM events WHERE status = 'open'`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	wallet, err := store.Count(`SELECT COALESCE(sum(points),0)::int FROM users WHERE role = 'user'`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	tierRows, err := store.Query(
		`SELECT tier, count(*)::int AS n FROM users WHERE role = 'user' GROUP BY tier`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	tiers := map[string]any{"Member": 0, "Silver": 0, "Elite": 0}
	for _, row := range tierRows {
		if tier, ok := row["tier"].(string); ok {
			tiers[tier] = row["n"]
		}
	}

	pending, err := store.Count(`SELECT count(*)::int FROM redemptions WHERE status = 'pending'`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	lowStock, err := store.Count(
		`SELECT count(*)::int FROM rewards WHERE status='active' AND stock BETWEEN 1 AND 5`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	outStock, err := store.Count(
		`SELECT count(*)::int FROM rewards WHERE status='active' AND stock = 0`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	eventStats, err := store.Query(`
		SELECT e.id, e.title, e.event_date, e.end_date, e.capacity,
		       (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS joined
		FROM events e WHERE e.status = 'open' ORDER BY e.event_date LIMIT 5`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	pickups, err := store.Query(`
		SELECT d.id, d.ref_code, d.points_used, d.redeemed_at,
		       u.display_name, u.department, r.name AS reward_name
		FROM redemptions d
		JOIN users u ON u.id = d.user_id
		JOIN rewards r ON r.id = d.reward_id
		WHERE d.status = 'pending' ORDER BY d.redeemed_at DESC LIMIT 5`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"staffCount":   staff,
		"eventCount":   events,
		"walletPoints": wallet,
		"tiers":        tiers,
		"todo":         web.Map{"pending": pending, "lowStock": lowStock, "outStock": outStock},
		"events":       eventStats,
		"pickups":      pickups,
	})
}

/* ---------- พนักงาน ---------- */

func AdminEmployees(w http.ResponseWriter, r *http.Request) {
	where := []string{`role = 'user'`}
	args := []any{}

	add := func(value any, pattern string) {
		args = append(args, value)
		where = append(where, fmt.Sprintf(pattern, len(args)))
	}

	if q := web.Param(r, "q", ""); q != "" {
		add("%"+q+"%", `(display_name ILIKE $%[1]d OR employee_code ILIKE $%[1]d)`)
	}
	if value := web.Param(r, "department", ""); value != "" {
		add(value, `department = $%d`)
	}
	if value := web.Param(r, "branch", ""); value != "" {
		add(value, `branch = $%d`)
	}
	if value := web.Param(r, "status", ""); value != "" {
		add(value, `status = $%d`)
	}
	if value := web.Param(r, "tier", ""); value != "" {
		add(value, `tier = $%d`)
	}

	clause := "WHERE " + strings.Join(where, " AND ")
	limit := web.IntParam(r, "limit", 20, 1, 100)
	page := web.IntParam(r, "page", 1, 1, 1000000)
	offset := (page - 1) * limit

	employees, err := store.Query(fmt.Sprintf(
		`SELECT %s FROM users %s ORDER BY employee_code LIMIT %d OFFSET %d`,
		PublicUser, clause, limit, offset), args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	total, err := store.Count(`SELECT count(*)::int FROM users `+clause, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	filters, err := store.Query(`SELECT DISTINCT department, branch FROM users WHERE role = 'user'`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	departments := distinct(filters, "department")
	branches := distinct(filters, "branch")

	web.JSON(w, http.StatusOK, web.Map{
		"employees":   employees,
		"total":       total,
		"page":        page,
		"limit":       limit,
		"departments": departments,
		"branches":    branches,
	})
}

func distinct(rows []store.Row, column string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, row := range rows {
		value, _ := row[column].(string)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	sortStrings(out)
	return out
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func AdminEmployee(w http.ResponseWriter, r *http.Request) {
	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสพนักงานไม่ถูกต้อง")
		return
	}

	user, err := store.QueryOne(`SELECT `+PublicUser+` FROM users WHERE id = $1`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if user == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบพนักงานคนนี้")
		return
	}

	transactions, err := store.Query(`
		SELECT id, kind, source, title, points, created_at FROM point_transactions
		WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	events, err := store.Query(`
		SELECT e.title, e.event_date, e.points, r.status, r.created_at
		FROM event_registrations r JOIN events e ON e.id = r.event_id
		WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 50`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	redemptions, err := store.Query(`
		SELECT d.ref_code, d.points_used, d.status, d.redeemed_at, r.name
		FROM redemptions d JOIN rewards r ON r.id = d.reward_id
		WHERE d.user_id = $1 ORDER BY d.redeemed_at DESC LIMIT 50`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"user": user, "transactions": transactions, "events": events, "redemptions": redemptions,
	})
}

type employeeBody struct {
	EmployeeCode string  `json:"employeeCode"`
	Username     string  `json:"username"`
	Email        *string `json:"email"`
	Password     string  `json:"password"`
	DisplayName  *string `json:"displayName"`
	Department   *string `json:"department"`
	Position     *string `json:"position"`
	Branch       *string `json:"branch"`
	Phone        *string `json:"phone"`
	BirthDate    *string `json:"birthDate"`
	Tier         *string `json:"tier"`
	Status       *string `json:"status"`
}

func AdminCreateEmployee(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body employeeBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	if body.EmployeeCode == "" || body.DisplayName == nil || *body.DisplayName == "" {
		web.Error(w, http.StatusBadRequest, "กรอกรหัสพนักงานและชื่อ-นามสกุลให้ครบ")
		return
	}

	// ไม่ได้กรอกรหัสผ่านมา ให้ใช้รหัสพนักงานเป็นรหัสผ่านตั้งต้น
	// ดีกว่าค่าคงที่ค่าเดียวที่ใช้ซ้ำกับพนักงานทุกคน ซึ่งเดาได้ทันทีถ้ารู้คนเดียว
	password := body.Password
	if password == "" {
		password = body.EmployeeCode
	}
	hash, err := security.HashPassword(password)
	if err != nil {
		web.Fail(w, err)
		return
	}

	username := body.Username
	if username == "" {
		username = strings.ToLower(body.EmployeeCode)
	}

	user, err := store.QueryOne(`
		INSERT INTO users (employee_code, username, email, password_hash, display_name, department,
		                   position, branch, phone, birth_date, tier, status)
		VALUES ($1,$2,$3,$4,$5,COALESCE($6,''),COALESCE($7,''),COALESCE($8,''),COALESCE($9,''),
		        $10::date, COALESCE($11::varchar,'Member'), COALESCE($12::varchar,'Active'))
		RETURNING `+PublicUser,
		body.EmployeeCode, username, emptyToNull(body.Email), hash, body.DisplayName, body.Department,
		body.Position, body.Branch, body.Phone, nullDate(body.BirthDate), body.Tier, body.Status)
	if err != nil {
		if isUniqueViolation(err) {
			web.Error(w, http.StatusConflict, "รหัสพนักงาน อีเมล หรือชื่อผู้ใช้นี้ถูกใช้แล้ว")
			return
		}
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "employee.create", body.EmployeeCode, *body.DisplayName)
	web.JSON(w, http.StatusCreated, web.Map{"user": user})
}

func AdminUpdateEmployee(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสพนักงานไม่ถูกต้อง")
		return
	}

	var body employeeBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	user, err := store.QueryOne(`
		UPDATE users SET
		  display_name = COALESCE($2::varchar, display_name),
		  department   = COALESCE($3::varchar, department),
		  position     = COALESCE($4::varchar, position),
		  branch       = COALESCE($5::varchar, branch),
		  phone        = COALESCE($6::varchar, phone),
		  email        = CASE WHEN $7::varchar IS NULL THEN email
		                      WHEN $7::varchar = '' THEN NULL ELSE $7::varchar END,
		  birth_date   = COALESCE($8::date, birth_date),
		  tier         = COALESCE($9::varchar, tier),
		  status       = COALESCE($10::varchar, status)
		WHERE id = $1 RETURNING `+PublicUser,
		id, body.DisplayName, body.Department, body.Position, body.Branch, body.Phone,
		body.Email, nullDate(body.BirthDate), body.Tier, body.Status)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if user == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบพนักงานคนนี้")
		return
	}

	// ตั้งรหัสผ่านใหม่เฉพาะตอนที่ผู้ดูแลกรอกมา ส่งว่างมาคือไม่เปลี่ยน
	if body.Password != "" {
		hash, err := security.HashPassword(body.Password)
		if err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := store.Exec(`UPDATE users SET password_hash = $2 WHERE id = $1`, id, hash); err != nil {
			web.Fail(w, err)
			return
		}
	}

	code, _ := user["employee_code"].(string)
	name, _ := user["display_name"].(string)

	action := "employee.update"
	if body.Password != "" {
		action = "employee.update+password"
	}
	logAudit(claims.ID, action, code, name)
	web.JSON(w, http.StatusOK, web.Map{"user": user})
}

func AdminDeleteEmployee(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสพนักงานไม่ถูกต้อง")
		return
	}

	// จำกัดเฉพาะ role = 'user' กันไม่ให้ลบบัญชีผู้ดูแลระบบผ่านทางนี้ไปโดยไม่ตั้งใจ
	row, err := store.QueryOne(
		`DELETE FROM users WHERE id = $1 AND role = 'user' RETURNING employee_code, display_name`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบพนักงานคนนี้")
		return
	}

	code, _ := row["employee_code"].(string)
	name, _ := row["display_name"].(string)
	logAudit(claims.ID, "employee.delete", code, name)
	w.WriteHeader(http.StatusNoContent)
}

/* ---------- คะแนน ---------- */

func AdminPoints(w http.ResponseWriter, r *http.Request) {
	where := []string{}
	args := []any{}

	if q := web.Param(r, "q", ""); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf(
			`(u.display_name ILIKE $%[1]d OR u.employee_code ILIKE $%[1]d)`, len(args)))
	}
	if kind := web.Param(r, "kind", ""); kind != "" {
		args = append(args, kind)
		where = append(where, fmt.Sprintf(`t.kind = $%d`, len(args)))
	}

	clause := ""
	if len(where) > 0 {
		clause = "WHERE " + strings.Join(where, " AND ")
	}

	limit := web.IntParam(r, "limit", 20, 1, 100)
	page := web.IntParam(r, "page", 1, 1, 1000000)
	offset := (page - 1) * limit

	transactions, err := store.Query(fmt.Sprintf(`
		SELECT t.id, t.kind, t.source, t.title, t.points, t.created_at,
		       u.display_name, u.employee_code, u.department
		FROM point_transactions t JOIN users u ON u.id = t.user_id
		%s ORDER BY t.created_at DESC LIMIT %d OFFSET %d`, clause, limit, offset), args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	total, err := store.Count(
		`SELECT count(*)::int FROM point_transactions t JOIN users u ON u.id = t.user_id `+clause, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"transactions": transactions, "total": total, "page": page, "limit": limit,
	})
}

// AdminAdjustPoints ปรับคะแนนด้วยมือ เช่น ให้คะแนนย้อนหลังหรือหักคืน
func AdminAdjustPoints(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		UserID int64  `json:"userId"`
		Points int    `json:"points"`
		Title  string `json:"title"`
	}
	if err := web.Decode(r, &body); err != nil || body.UserID == 0 || body.Points == 0 {
		web.Error(w, http.StatusBadRequest, "ระบุพนักงานและจำนวนคะแนน")
		return
	}

	title := body.Title
	if title == "" {
		title = "ปรับคะแนนโดยผู้ดูแลระบบ"
	}

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	// การปรับด้วยมือใช้จำนวนตามที่ผู้ดูแลกรอก ไม่คูณตัวคูณของระดับ
	if _, err := tx.Exec(
		`UPDATE users SET points = GREATEST(points + $2, 0) WHERE id = $1`, body.UserID, body.Points); err != nil {
		web.Fail(w, err)
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO point_transactions (user_id, kind, source, title, points)
		VALUES ($1,'adjust','system',$2,$3)`, body.UserID, title, body.Points); err != nil {
		web.Fail(w, err)
		return
	}
	// ปรับด้วยมือให้ระดับตามคะแนนใหม่ทันที ทั้งขึ้นและลง
	changedTier, upgraded, err := recalcTierExact(tx, body.UserID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if upgraded {
		err = notifyTierUp(tx, body.UserID, changedTier)
	} else {
		err = notifyTierDown(tx, body.UserID, changedTier)
	}
	if err != nil {
		web.Fail(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	detail := fmt.Sprintf("%d คะแนน", body.Points)
	if changedTier != "" {
		detail += " · ระดับเปลี่ยนเป็น " + changedTier
	}
	logAudit(claims.ID, "points.adjust", fmt.Sprintf("user #%d", body.UserID), detail)
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

/* ---------- ของรางวัลและการรับของ ---------- */

func AdminRewards(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT r.*, (SELECT count(*)::int FROM redemptions d WHERE d.reward_id = r.id) AS redeemed,
		       CASE
		         WHEN r.ends_at IS NOT NULL AND r.ends_at < current_date THEN 'expired'
		         WHEN r.starts_at IS NOT NULL AND r.starts_at > current_date THEN 'scheduled'
		         ELSE 'live'
		       END AS window_state
		FROM rewards r ORDER BY r.created_at DESC`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"rewards": rows})
}

type rewardBody struct {
	Name         *string         `json:"name"`
	ImageURL     *string         `json:"imageUrl"`
	Translations json.RawMessage `json:"translations"`
	Description  *string         `json:"description"`
	HowTo        *string         `json:"howTo"`
	Conditions   *string         `json:"conditions"`
	Category     *string         `json:"category"`
	Points       *int            `json:"points"`
	OldPoints    *int            `json:"oldPoints"`
	Stock        *int            `json:"stock"`
	Status       *string         `json:"status"`
	MinTier      *string         `json:"minTier"`
	StartsAt     *string         `json:"startsAt"`
	EndsAt       *string         `json:"endsAt"`
}

func AdminCreateReward(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body rewardBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}
	if body.Name == nil || *body.Name == "" || body.Points == nil || *body.Points == 0 {
		web.Error(w, http.StatusBadRequest, "กรอกชื่อและคะแนนที่ใช้แลก")
		return
	}
	if msg := checkDateOrder(body.StartsAt, body.EndsAt); msg != "" {
		web.Error(w, http.StatusBadRequest, msg)
		return
	}

	reward, err := store.QueryOne(`
		INSERT INTO rewards (name, description, how_to, conditions, category, points, old_points,
		                     stock, status, image_url, translations, min_tier, starts_at, ends_at)
		VALUES ($1, COALESCE($2,''), COALESCE($3,''), COALESCE($4,''), COALESCE($5::varchar,'ทั่วไป'),
		        $6::int, $7::int, COALESCE($8::int,0), COALESCE($9::varchar,'active'), $10::text,
		        COALESCE($11::jsonb,'{}'::jsonb), COALESCE($12::varchar,'Member'),
		        $13::date, $14::date)
		RETURNING *`,
		body.Name, body.Description, body.HowTo, body.Conditions, body.Category,
		body.Points, body.OldPoints, body.Stock, body.Status, emptyToNull(body.ImageURL),
		jsonOrNil(body.Translations), body.MinTier, nullDate(body.StartsAt), nullDate(body.EndsAt))
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "reward.create", *body.Name, "")
	web.JSON(w, http.StatusCreated, web.Map{"reward": reward})
}

func AdminUpdateReward(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสของรางวัลไม่ถูกต้อง")
		return
	}

	var body rewardBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	reward, err := store.QueryOne(`
		UPDATE rewards SET
		  name = COALESCE($2::varchar,name), description = COALESCE($3::text,description),
		  how_to = COALESCE($4::text,how_to), conditions = COALESCE($5::text,conditions),
		  category = COALESCE($6::varchar,category), points = COALESCE($7::int,points),
		  old_points = COALESCE($8::int,old_points), stock = COALESCE($9::int,stock),
		  status = COALESCE($10::varchar,status), image_url = COALESCE($11::text, image_url),
		  translations = COALESCE($12::jsonb, translations),
		  min_tier = COALESCE($13::varchar, min_tier),
		  -- ส่งค่าว่างมาคือตั้งใจล้างช่วงเวลา จึงใช้ค่าที่ส่งมาตรง ๆ ไม่ COALESCE
		  starts_at = CASE WHEN $14::boolean THEN $15::date ELSE starts_at END,
		  ends_at   = CASE WHEN $16::boolean THEN $17::date ELSE ends_at END
		WHERE id = $1 RETURNING *`,
		id, body.Name, body.Description, body.HowTo, body.Conditions, body.Category,
		body.Points, body.OldPoints, body.Stock, body.Status, body.ImageURL,
		jsonOrNil(body.Translations), body.MinTier,
		body.StartsAt != nil, nullDate(body.StartsAt),
		body.EndsAt != nil, nullDate(body.EndsAt))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if reward == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบของรางวัลนี้")
		return
	}

	name, _ := reward["name"].(string)
	logAudit(claims.ID, "reward.update", name, "")
	web.JSON(w, http.StatusOK, web.Map{"reward": reward})
}

func AdminRedemptions(w http.ResponseWriter, r *http.Request) {
	status := web.Param(r, "status", "pending")

	rows, err := store.Query(`
		SELECT d.id, d.ref_code, d.points_used, d.status, d.redeemed_at, d.received_at,
		       u.display_name, u.employee_code, u.department, r.name AS reward_name
		FROM redemptions d
		JOIN users u ON u.id = d.user_id
		JOIN rewards r ON r.id = d.reward_id
		WHERE ($1 = 'all' OR d.status = $1)
		ORDER BY d.redeemed_at DESC LIMIT 200`, status)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"redemptions": rows})
}

// AdminReceiveRedemption ยืนยันว่าพนักงานมารับของแล้ว
func AdminReceiveRedemption(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสรายการไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`
		UPDATE redemptions SET status = 'received', received_at = now()
		WHERE id = $1 AND status = 'pending' RETURNING user_id, ref_code`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusConflict, "รายการนี้ถูกยืนยันไปแล้วหรือไม่มีอยู่")
		return
	}

	refCode, _ := row["ref_code"].(string)
	if _, err := store.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'reward','รับของรางวัลเรียบร้อย',$2)`,
		row["user_id"], "ยืนยันการรับของรางวัลรหัส "+refCode+" แล้ว"); err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "redemption.receive", refCode, "")
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

/* ---------- กิจกรรม ---------- */

func AdminEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT e.*, (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS joined
		FROM events e ORDER BY e.event_date DESC`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if err := attachOptions(rows, "th"); err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"events": rows})
}

// ตัวเลือกของกิจกรรมโหวต ID เป็น 0 แปลว่าเป็นตัวเลือกใหม่
type eventOption struct {
	ID     int64  `json:"id"`
	Label  string `json:"label"`
	Detail string `json:"detail"`
}

type eventBody struct {
	Title        *string         `json:"title"`
	Translations json.RawMessage `json:"translations"`
	Description  *string         `json:"description"`
	Agenda       *string         `json:"agenda"`
	Location     *string         `json:"location"`
	ImageURL     *string         `json:"imageUrl"`
	EventDate    *string         `json:"eventDate"`
	EndDate      *string         `json:"endDate"`
	Options      []eventOption   `json:"options"`
	StartTime    *string         `json:"startTime"`
	EndTime      *string         `json:"endTime"`
	Points       *int            `json:"points"`
	Kind         *string         `json:"kind"`
	Capacity     *int            `json:"capacity"`
	Status       *string         `json:"status"`
}

func AdminCreateEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body eventBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}
	if body.Title == nil || *body.Title == "" || body.EventDate == nil || *body.EventDate == "" {
		web.Error(w, http.StatusBadRequest, "กรอกชื่อกิจกรรมและวันที่เริ่มจัด")
		return
	}
	if msg := checkDateOrder(body.EventDate, body.EndDate); msg != "" {
		web.Error(w, http.StatusBadRequest, msg)
		return
	}

	event, err := store.QueryOne(`
		INSERT INTO events (title, description, agenda, location, image_url, event_date, end_date,
		                    start_time, end_time, points, kind, capacity, status, translations)
		VALUES ($1, COALESCE($2,''), COALESCE($3,''), COALESCE($4,''), $5, $6::date, $7::date,
		        COALESCE($8::time,'09:00'), COALESCE($9::time,'12:00'), COALESCE($10::int,0),
		        COALESCE($11::varchar,'register'), COALESCE($12::int,0), COALESCE($13::varchar,'open'),
		        COALESCE($14::jsonb,'{}'::jsonb))
		RETURNING *`,
		body.Title, body.Description, body.Agenda, body.Location, emptyToNull(body.ImageURL),
		body.EventDate, nullDate(body.EndDate), nullTime(body.StartTime), nullTime(body.EndTime),
		body.Points, body.Kind, body.Capacity, body.Status, jsonOrNil(body.Translations))
	if err != nil {
		web.Fail(w, err)
		return
	}

	if id, ok := event["id"].(int64); ok {
		if err := saveOptions(id, body.Options); err != nil {
			web.Fail(w, err)
			return
		}
	}

	logAudit(claims.ID, "event.create", *body.Title, "")
	web.JSON(w, http.StatusCreated, web.Map{"event": event})
}

func AdminUpdateEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสกิจกรรมไม่ถูกต้อง")
		return
	}

	var body eventBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}
	if msg := checkDateOrder(body.EventDate, body.EndDate); msg != "" {
		web.Error(w, http.StatusBadRequest, msg)
		return
	}

	event, err := store.QueryOne(`
		UPDATE events SET
		  title = COALESCE($2::varchar,title), description = COALESCE($3::text,description),
		  agenda = COALESCE($4::text,agenda), location = COALESCE($5::varchar,location),
		  event_date = COALESCE($6::date,event_date), start_time = COALESCE($7::time,start_time),
		  end_time = COALESCE($8::time,end_time), points = COALESCE($9::int,points),
		  kind = COALESCE($10::varchar,kind), capacity = COALESCE($11::int,capacity),
		  status = COALESCE($12::varchar,status),
		  translations = COALESCE($13::jsonb, translations),
		  -- ส่งค่าว่างมาคือตั้งใจล้างวันสิ้นสุด จึงใช้ค่าที่ส่งมาตรง ๆ
		  end_date = CASE WHEN $14::boolean THEN $15::date ELSE end_date END,
		  -- รูปก็เหมือนกัน ส่งค่าว่างมาคือตั้งใจลบรูปทิ้ง
		  image_url = CASE WHEN $16::boolean THEN $17::text ELSE image_url END
		WHERE id = $1 RETURNING *`,
		id, body.Title, body.Description, body.Agenda, body.Location, nullDate(body.EventDate),
		nullTime(body.StartTime), nullTime(body.EndTime), body.Points, body.Kind,
		body.Capacity, body.Status, jsonOrNil(body.Translations),
		body.EndDate != nil, nullDate(body.EndDate),
		body.ImageURL != nil, emptyToNull(body.ImageURL))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if event == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบกิจกรรมนี้")
		return
	}

	if err := saveOptions(id, body.Options); err != nil {
		web.Fail(w, err)
		return
	}

	title, _ := event["title"].(string)
	logAudit(claims.ID, "event.update", title, "")
	web.JSON(w, http.StatusOK, web.Map{"event": event})
}

// AdminCheckIn เช็คอินหน้างานด้วยรหัสพนักงาน แล้วจ่ายคะแนนให้ทันที
func AdminCheckIn(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	eventID, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสกิจกรรมไม่ถูกต้อง")
		return
	}

	var body struct {
		EmployeeCode string `json:"employeeCode"`
		// คนที่ไม่ได้ลงทะเบียนล่วงหน้าแต่มาหน้างาน ผู้ดูแลยืนยันแล้วเช็คอินให้ได้
		// ต้องส่งมาเป็นจังหวะที่สองเสมอ จังหวะแรกระบบจะคืนชื่อมาให้ตรวจก่อน
		// กันกรณีพิมพ์รหัสผิดแล้วเผลอให้คะแนนคนอื่น
		AllowWalkIn bool `json:"allowWalkIn"`
	}
	if err := web.Decode(r, &body); err != nil || body.EmployeeCode == "" {
		web.Error(w, http.StatusBadRequest, "ระบุรหัสพนักงาน")
		return
	}

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	var userID int64
	var displayName string
	err = tx.QueryRow(`SELECT id, display_name FROM users WHERE employee_code = $1`,
		body.EmployeeCode).Scan(&userID, &displayName)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบพนักงานรหัสนี้")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	var title string
	var points int
	err = tx.QueryRow(`SELECT title, points FROM events WHERE id = $1`, eventID).Scan(&title, &points)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบกิจกรรมนี้")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	var current string
	err = tx.QueryRow(`SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
		eventID, userID).Scan(&current)

	switch {
	case errors.Is(err, sql.ErrNoRows):
		// ยังไม่ได้ลงทะเบียน จังหวะแรกคืนชื่อให้ผู้ดูแลตรวจก่อน ยังไม่บันทึกอะไร
		if !body.AllowWalkIn {
			web.JSON(w, http.StatusOK, web.Map{
				"ok": false, "status": "not-registered",
				"name": displayName, "employeeCode": body.EmployeeCode, "event": title,
			})
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO event_registrations (event_id, user_id, status, walk_in, checked_in_at)
			VALUES ($1,$2,'attended',true,now())`, eventID, userID); err != nil {
			web.Fail(w, err)
			return
		}

	case err != nil:
		web.Fail(w, err)
		return

	case current == "attended":
		web.Error(w, http.StatusConflict, "พนักงานคนนี้เช็คอินไปแล้ว")
		return

	default:
		if _, err := tx.Exec(`
			UPDATE event_registrations SET status = 'attended', checked_in_at = now()
			WHERE event_id = $1 AND user_id = $2`, eventID, userID); err != nil {
			web.Fail(w, err)
			return
		}
	}

	walkIn := errors.Is(err, sql.ErrNoRows)

	awarded := 0
	if points > 0 {
		var tierUp string
		awarded, tierUp, err = awardPoints(tx, userID, points)
		if err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points)
			VALUES ($1,'earn','event',$2,$3)`, userID, "เข้าร่วม "+title, awarded); err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO notifications (user_id, category, title, body) VALUES ($1,'point',$2,$3)`,
			userID, fmt.Sprintf("คุณได้รับ %d คะแนน", awarded),
			fmt.Sprintf("จากการเข้าร่วมกิจกรรม %s", title)); err != nil {
			web.Fail(w, err)
			return
		}
		if err := notifyTierUp(tx, userID, tierUp); err != nil {
			web.Fail(w, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	detail := displayName
	if walkIn {
		detail += " (เช็คอินหน้างาน ไม่ได้ลงทะเบียนล่วงหน้า)"
	}
	logAudit(claims.ID, "event.check-in", body.EmployeeCode, detail)

	web.JSON(w, http.StatusOK, web.Map{
		"ok": true, "name": displayName, "points": awarded, "walkIn": walkIn,
	})
}

/* ---------- ประกาศ ---------- */

func AdminNotifications(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT n.id, n.category, n.title, n.body, n.channel, n.created_at,
		       u.display_name AS target_name
		FROM notifications n LEFT JOIN users u ON u.id = n.user_id
		ORDER BY n.created_at DESC LIMIT 200`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"notifications": rows})
}

func AdminCreateNotification(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Title    string `json:"title"`
		Body     string `json:"body"`
		Category string `json:"category"`
		Channel  string `json:"channel"`
		UserID   *int64 `json:"userId"`
	}
	if err := web.Decode(r, &body); err != nil || body.Title == "" {
		web.Error(w, http.StatusBadRequest, "กรอกหัวข้อประกาศ")
		return
	}

	if body.Category == "" {
		body.Category = "announce"
	}
	if body.Channel == "" {
		body.Channel = "in-app"
	}

	notification, err := store.QueryOne(`
		INSERT INTO notifications (user_id, category, title, body, channel)
		VALUES ($1,$2,$3,$4,$5) RETURNING *`,
		body.UserID, body.Category, body.Title, body.Body, body.Channel)
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "notification.create", body.Title, "")
	web.JSON(w, http.StatusCreated, web.Map{"notification": notification})
}

/* ---------- ตัวช่วย ---------- */

// nullDate / nullTime แปลงสตริงว่างให้เป็น NULL เพื่อให้ COALESCE ในคิวรีทำงานถูก
func nullDate(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	return *value
}

func nullTime(value *string) any {
	return nullDate(value)
}

func isUniqueViolation(err error) bool {
	var pgErr *pq.Error
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// jsonOrNil ส่ง nil ให้ COALESCE ถ้าไม่ได้ส่งคำแปลมา ค่าเดิมในฐานข้อมูลจะไม่ถูกลบ
func jsonOrNil(raw json.RawMessage) any {
	if len(raw) == 0 {
		return nil
	}
	return string(raw)
}

// checkDateOrder ตรวจว่าวันสิ้นสุดไม่มาก่อนวันเริ่ม
// ตรวจที่นี่เพื่อให้ได้ข้อความบอกสาเหตุชัดเจน แทนที่จะให้ CHECK ของฐานข้อมูลฟ้องเป็น error กลาง ๆ
func checkDateOrder(start, end *string) string {
	if start == nil || end == nil || *start == "" || *end == "" {
		return ""
	}
	if *end < *start {
		return "วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม"
	}
	return ""
}
