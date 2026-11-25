package routes

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

/*
เทสต์เส้นทาง

เคยเกิดขึ้นมาแล้วว่าหน้าเว็บเรียก /api/app/qr-token และ /api/admin/scan อยู่
แต่ฝั่งเซิร์ฟเวอร์ลืมลงทะเบียนเส้นทางไว้ ผลคือผู้ใช้เจอข้อความ
"ไม่มีเส้นทาง GET ..." ตอนกดใช้งานจริง ซึ่งไม่มีอะไรดักไว้เลยก่อนหน้านั้น
ทั้ง build และ vet ผ่านหมด เพราะตัวจัดการมีอยู่จริง แค่ไม่มีใครเรียกใช้

เทสต์นี้ยิงคำขอเข้า mux ตัวจริงแล้วดูว่าไม่ตกไปที่ตัวจับ 404
ไม่ต้องมีฐานข้อมูล เพราะคำขอถูก middleware ปฏิเสธเรื่องสิทธิ์ก่อนถึงตัวจัดการ
ซึ่งก็พอแล้วสำหรับคำถามที่ถามอยู่ว่า "เส้นทางนี้มีอยู่ไหม"
*/

// routed บอกว่าเส้นทางนี้มีคนรับหรือตกไปที่ตัวจับ 404
//
// 401/403 ถือว่ามี เพราะแปลว่า mux จับคู่ได้แล้วส่งต่อให้ middleware
func routed(t *testing.T, mux *http.ServeMux, method, path string) {
	t.Helper()

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest(method, path, nil))

	if recorder.Code == http.StatusNotFound &&
		strings.Contains(recorder.Body.String(), "ไม่มีเส้นทาง") {
		t.Errorf("%s %s ไม่ได้ลงทะเบียนไว้ — หน้าเว็บจะเจอ \"ไม่มีเส้นทาง\" ตอนกดใช้งาน",
			method, path)
	}
}

// ทุกเส้นทางที่ frontend/src/lib/api.js เรียกใช้ ต้องมีอยู่จริง
func TestRoutesTheFrontendCalls(t *testing.T) {
	mux := Setup()

	cases := []struct{ method, path string }{
		// QR ที่พนักงานยื่นให้เจ้าหน้าที่สแกน
		{"GET", "/api/app/qr-token"},
		{"GET", "/api/app/my-rewards/31/qr"},

		// เครื่องสแกนของผู้ดูแล
		{"POST", "/api/admin/scan"},

		// รายการแลกของรางวัล
		{"GET", "/api/admin/redemptions"},
		{"POST", "/api/admin/redemptions/31/receive"},
		{"POST", "/api/admin/redemptions/31/revert"},

		// คำขอปรับคะแนนที่ต้องอนุมัติสองฝั่ง
		{"POST", "/api/admin/points/adjust"},
		{"GET", "/api/admin/points/requests"},
		{"POST", "/api/admin/points/requests/7/decide"},
		{"POST", "/api/admin/points/requests/7/cancel"},

		// หน้าวิเคราะห์ที่มีตัวกรองกิจกรรม
		{"GET", "/api/admin/analytics"},
		{"GET", "/api/admin/points/reset-status"},

		// เส้นทางพื้นฐานที่ใช้ทุกวัน เผื่อมีใครรื้อไฟล์นี้แล้วลบพลาด
		{"GET", "/api/app/home"},
		{"GET", "/api/app/points"},
		{"GET", "/api/app/my-rewards"},
		{"GET", "/api/admin/overview"},
		{"GET", "/api/admin/employees"},
	}

	for _, c := range cases {
		routed(t, mux, c.method, c.path)
	}
}

// เส้นทางที่ไม่มีจริงต้องยังตอบ 404 อยู่ ไม่งั้นเทสต์ข้างบนจะผ่านแบบไม่มีความหมาย
func TestUnknownRouteStillReturnsNotFound(t *testing.T) {
	mux := Setup()

	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest("GET", "/api/app/ไม่มีอยู่จริง", nil))

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("เส้นทางที่ไม่มีจริงตอบ %d ต้องการ 404", recorder.Code)
	}
}
