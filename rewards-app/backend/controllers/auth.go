package controllers

import (
	"net/http"
	"strings"
	"time"

	"rewards/middleware"
	"rewards/security"
	"rewards/store"
	"rewards/web"
)

// PublicUser คือคอลัมน์ของผู้ใช้ที่ส่งออกไปให้หน้าเว็บได้ (ไม่รวม password_hash)
const PublicUser = `id, employee_code, username, email, display_name, department, position, branch,
  phone, birth_date, avatar_url, role, tier, status, points, points_expire_at, terms_accepted_at, created_at`

const tokenTTL = 7 * 24 * time.Hour

type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
	Role       string `json:"role"`
}

// Login รองรับทั้งช่อง "รหัสพนักงาน" ของพนักงานและ "ชื่อผู้ใช้/อีเมล" ของแอดมิน
func Login(w http.ResponseWriter, r *http.Request) {
	var body loginRequest
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	identifier := strings.TrimSpace(body.Identifier)
	if identifier == "" || body.Password == "" {
		web.Error(w, http.StatusBadRequest, "กรอกข้อมูลให้ครบก่อนเข้าสู่ระบบ")
		return
	}

	user, err := store.QueryOne(`
		SELECT `+PublicUser+`, password_hash FROM users
		WHERE lower(employee_code) = lower($1) OR lower(username) = lower($1) OR lower(email) = lower($1)`,
		identifier)
	if err != nil {
		web.Fail(w, err)
		return
	}

	if user == nil {
		web.Error(w, http.StatusUnauthorized, "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
		return
	}

	hash, _ := user["password_hash"].(string)
	if !security.CheckPassword(body.Password, hash) {
		web.Error(w, http.StatusUnauthorized, "รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
		return
	}

	if status, _ := user["status"].(string); status != "Active" {
		web.Error(w, http.StatusForbidden, "บัญชีนี้ถูกระงับการใช้งาน")
		return
	}

	role, _ := user["role"].(string)
	if body.Role == "admin" && role != "admin" {
		web.Error(w, http.StatusForbidden, "บัญชีนี้ไม่มีสิทธิ์เข้าหน้าผู้ดูแลระบบ")
		return
	}

	delete(user, "password_hash")

	id, _ := user["id"].(int64)

	// กันกรณีคะแนนถูกแก้จากทางอื่นจนระดับไม่ตรง ตรวจให้ตั้งแต่เข้าสู่ระบบ
	if role == "user" {
		SyncTier(id)
		if fresh, err := store.QueryOne(`SELECT tier, points FROM users WHERE id = $1`, id); err == nil && fresh != nil {
			user["tier"] = fresh["tier"]
			user["points"] = fresh["points"]
		}
	}
	token, err := security.SignToken(id, role, tokenTTL)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"user": user, "token": token})
}

func Me(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	user, err := store.QueryOne(`SELECT `+PublicUser+` FROM users WHERE id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if user == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบบัญชีนี้")
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"user": user})
}

// AcceptTerms บันทึกเวลาที่กดยอมรับ PDPA เพื่อไม่ต้องแสดงหน้าข้อตกลงซ้ำ
func AcceptTerms(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	user, err := store.QueryOne(
		`UPDATE users SET terms_accepted_at = now() WHERE id = $1 RETURNING `+PublicUser, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"user": user})
}
