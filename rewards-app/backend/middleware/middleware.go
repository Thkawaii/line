package middleware

import (
	"context"
	"net/http"
	"strings"

	"rewards/org"
	"rewards/store"

	"rewards/config"
	"rewards/security"
	"rewards/web"
)

type contextKey string

const userKey contextKey = "user"

// CurrentUser ดึงข้อมูลผู้ใช้ที่ middleware ใส่ไว้ใน context
func CurrentUser(r *http.Request) *security.Claims {
	claims, _ := r.Context().Value(userKey).(*security.Claims)
	return claims
}

func CORS(next http.Handler) http.Handler {
	origin := config.Getenv("CLIENT_ORIGIN", "*")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func parse(r *http.Request) *security.Claims {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return nil
	}
	claims, err := security.ParseToken(strings.TrimPrefix(header, "Bearer "))
	if err != nil {
		return nil
	}
	return claims
}

// RequireAuth บังคับให้ต้องเข้าสู่ระบบก่อน
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := parse(r)
		if claims == nil {
			web.Error(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, claims)))
	}
}

// RequireAdmin บังคับให้ต้องเป็นผู้ดูแลระบบ
func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return requireRole(next, "เฉพาะผู้ดูแลระบบเท่านั้น", "admin")
}

/*
RequireOffice เปิดให้ทุกคนที่ทำงานหลังบ้านเข้าได้

ผ่านได้สามแบบ
  - role admin  ผู้ดูแลระบบตัวจริง
  - role ga     บัญชีฝ่ายธุรการที่สร้างไว้แต่เดิม
  - role user   ที่สังกัดแผนกหลังบ้าน (GA, ER, HR, HRM, HRD)
    พนักงานกลุ่มนี้ใช้รหัสพนักงานกับรหัสผ่านเดิมเข้าหน้าผู้ดูแลระบบได้เลย
    ไม่ต้องสร้างบัญชีแยกอีกใบ

ใช้กับเส้นทางฝั่งผู้ดูแลระบบเกือบทั้งหมด
ยกเว้นกลุ่ม "ตั้งค่าระบบ" ที่ยังใช้ RequireAdmin อยู่

อ่านแผนกจากฐานข้อมูลทุกครั้งแทนที่จะฝังไว้ใน token
ย้ายคนออกจากแผนกแล้วสิทธิ์ต้องหายทันที ไม่ใช่รอ token หมดอายุ
*/
func RequireOffice(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := parse(r)
		if claims == nil {
			web.Error(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
			return
		}

		if claims.Role != "admin" && claims.Role != "ga" && !inBackOffice(claims.ID) {
			web.Error(w, http.StatusForbidden, "บัญชีนี้ไม่มีสิทธิ์เข้าหน้าผู้ดูแลระบบ")
			return
		}

		next(w, r.WithContext(context.WithValue(r.Context(), userKey, claims)))
	}
}

// RequireReport เป็นชื่อเดิมของ RequireOffice เก็บไว้ให้เส้นทางที่เขียนไว้แล้วยังใช้ได้
func RequireReport(next http.HandlerFunc) http.HandlerFunc {
	return RequireOffice(next)
}

// inBackOffice ดูว่าพนักงานคนนี้สังกัดแผนกหลังบ้านหรือไม่
func inBackOffice(userID int64) bool {
	row, err := store.QueryOne(`SELECT department FROM users WHERE id = $1`, userID)
	if err != nil || row == nil {
		return false
	}
	department, _ := row["department"].(string)
	return org.IsBackOfficeSection(department)
}

func requireRole(next http.HandlerFunc, message string, roles ...string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := parse(r)
		if claims == nil {
			web.Error(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
			return
		}

		allowed := false
		for _, role := range roles {
			if claims.Role == role {
				allowed = true
				break
			}
		}
		if !allowed {
			web.Error(w, http.StatusForbidden, message)
			return
		}

		next(w, r.WithContext(context.WithValue(r.Context(), userKey, claims)))
	}
}
