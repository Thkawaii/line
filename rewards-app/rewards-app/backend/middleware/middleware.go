package middleware

import (
	"context"
	"net/http"
	"strings"

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
	return func(w http.ResponseWriter, r *http.Request) {
		claims := parse(r)
		if claims == nil {
			web.Error(w, http.StatusUnauthorized, "กรุณาเข้าสู่ระบบก่อนใช้งาน")
			return
		}
		if claims.Role != "admin" {
			web.Error(w, http.StatusForbidden, "เฉพาะผู้ดูแลระบบเท่านั้น")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userKey, claims)))
	}
}
