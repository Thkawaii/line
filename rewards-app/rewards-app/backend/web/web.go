package web

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
)

type Map map[string]any

func JSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if body == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		log.Printf("เขียน JSON ไม่สำเร็จ: %v", err)
	}
}

func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, Map{"error": message})
}

// Fail ใช้กับ error ที่ไม่ได้คาดไว้ บันทึกลง log แล้วตอบข้อความกลาง ๆ
// เพื่อไม่ให้รายละเอียดภายในระบบหลุดออกไปหาผู้ใช้
func Fail(w http.ResponseWriter, err error) {
	log.Printf("ผิดพลาด: %v", err)
	Error(w, http.StatusInternalServerError, "เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่อีกครั้ง")
}

func Decode(r *http.Request, target any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(target)
}

// Param อ่านค่าจาก query string
func Param(r *http.Request, key, fallback string) string {
	if value := r.URL.Query().Get(key); value != "" {
		return value
	}
	return fallback
}

func IntParam(r *http.Request, key string, fallback, min, max int) int {
	value, err := strconv.Atoi(r.URL.Query().Get(key))
	if err != nil {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

// PathID อ่าน path parameter ที่เป็นตัวเลข
func PathID(r *http.Request, key string) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue(key), 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}
