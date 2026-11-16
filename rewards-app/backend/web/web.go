package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/lib/pq"
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

	/*
		ข้อผิดพลาดบางอย่างบอกสาเหตุที่แก้ได้ ไม่ควรกลบด้วยคำว่า "เซิร์ฟเวอร์มีปัญหา"

		กรณีที่เจอบ่อยคือโครงตารางของฐานข้อมูลยังไม่ตรงกับรุ่นปัจจุบัน
		เช่นคอลัมน์ที่ควรเว้นว่างได้ถูกตั้งเป็นห้ามว่าง ผู้ดูแลจะเห็นแต่ข้อความกลาง ๆ
		แล้วไล่หาสาเหตุไม่เจอ ทั้งที่ทางแก้คือเปิดเซิร์ฟเวอร์ใหม่ให้ migration ทำงาน
	*/
	if message := explain(err); message != "" {
		Error(w, http.StatusBadRequest, message)
		return
	}

	Error(w, http.StatusInternalServerError, "เซิร์ฟเวอร์มีปัญหา กรุณาลองใหม่อีกครั้ง")
}

// explain แปลงข้อผิดพลาดของฐานข้อมูลที่รู้สาเหตุแล้วเป็นข้อความที่อ่านรู้เรื่อง
// คืนข้อความว่างถ้าไม่รู้จัก ตัวเรียกจะได้ใช้ข้อความกลาง ๆ ตามเดิม
func explain(err error) string {
	var pgErr *pq.Error
	if !errors.As(err, &pgErr) {
		return ""
	}

	switch pgErr.Code {
	case "23502": // not_null_violation
		return fmt.Sprintf(
			"บันทึกไม่สำเร็จ เพราะช่อง %q ในฐานข้อมูลยังถูกตั้งเป็นห้ามเว้นว่าง "+
				"โครงตารางยังไม่ตรงกับรุ่นปัจจุบัน ให้ปิดแล้วเปิดเซิร์ฟเวอร์ใหม่ "+
				"เพื่อให้ตัวต่อเติมโครงตารางทำงาน", pgErr.Column)
	case "23514": // check_violation
		return "บันทึกไม่สำเร็จ เพราะค่าที่กรอกไม่อยู่ในรายการที่ฐานข้อมูลยอมรับ"
	}
	return ""
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
