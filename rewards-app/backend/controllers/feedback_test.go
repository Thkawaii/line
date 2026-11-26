package controllers

import (
	"os"
	"strings"
	"testing"
)

/*
ตรึงกติกาของเวลาเปิดแบบประเมินไว้

เวลานี้เคยเป็นค่ากลางของทั้งระบบหน่วยชั่วโมง ซึ่งใช้กับงานสั้นไม่ได้
งานที่ยาว 30 นาทีจะถูกเปิดให้ประเมินตั้งแต่ก่อนงานเริ่ม
ย้ายมาเป็นค่าของแต่ละกิจกรรมและเก็บเป็นนาทีแทน

ถ้าวันหนึ่งมีใครย้ายกลับไปเป็นค่ากลางอีก อาการจะกลับมาเหมือนเดิม
และจะไม่มีอะไรฟ้อง เพราะคิวรียังทำงานได้ปกติ แค่ใช้ตัวเลขผิดที่
*/

func feedbackSource(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile("feedback.go")
	if err != nil {
		t.Fatalf("อ่าน feedback.go ไม่ได้: %v", err)
	}
	return string(data)
}

// ช่วงเวลาเปิดต้องอ่านจากคอลัมน์ของกิจกรรม ไม่ใช่จากค่ากลางของระบบ
func TestFeedbackLeadComesFromTheEvent(t *testing.T) {
	src := feedbackSource(t)

	if !strings.Contains(src, "make_interval(mins => e.feedback_lead_minutes)") {
		t.Error("เวลาเปิดแบบประเมินต้องคิดจากคอลัมน์ feedback_lead_minutes ของกิจกรรมนั้น")
	}
	if strings.Contains(src, "event.feedbackLeadHours") {
		t.Error("ยังอ้างค่ากลาง event.feedbackLeadHours อยู่ ซึ่งถูกย้ายไปอยู่ที่ตัวกิจกรรมแล้ว")
	}
	if strings.Contains(src, "make_interval(hours =>") {
		t.Error("ยังคิดเป็นชั่วโมงอยู่ หน่วยที่ใช้เก็บคือนาที")
	}
}

/*
เวลาจบงานต้องคิดจากวันสุดท้าย ไม่ใช่วันแรก

งานสามวันที่คิดจากวันแรกจะเปิดให้ประเมินตั้งแต่วันแรกยังไม่จบ
ซึ่งเร็วไปสองวัน และคนที่ยังไม่ได้ไปวันที่สองกับสามก็ประเมินไปแล้ว
*/
func TestFeedbackUsesLastDayOfEvent(t *testing.T) {
	if !strings.Contains(feedbackSource(t), "COALESCE(e.end_date, e.event_date)") {
		t.Error("ต้องคิดเวลาจบจากวันสุดท้ายของงาน (end_date) ไม่ใช่วันเริ่ม")
	}
}

/*
ค่าที่รับจากหน้าเว็บต้องถูกตรวจก่อนบันทึก

ค่าติดลบอันตรายเงียบ ๆ เพราะ make_interval รับค่าติดลบได้โดยไม่ error
ผลคือแบบประเมินไปเปิดหลังงานจบแทนที่จะเปิดก่อน และไม่มีอะไรแจ้งเตือน
*/
func TestFeedbackLeadIsValidated(t *testing.T) {
	cases := []struct {
		name    string
		minutes *int
		wantMsg bool
	}{
		{"ไม่ได้ส่งมา", nil, false},
		{"ศูนย์นาที คือขึ้นตอนงานจบพอดี", intPtr(0), false},
		{"สิบนาที", intPtr(10), false},
		{"สามสิบวัน คือเพดานพอดี", intPtr(43200), false},
		{"ติดลบ", intPtr(-1), true},
		{"เกินเพดาน", intPtr(43201), true},
	}

	for _, c := range cases {
		msg := checkFeedbackLead(c.minutes)
		if (msg != "") != c.wantMsg {
			t.Errorf("%s: ได้ข้อความ %q", c.name, msg)
		}
	}
}

func intPtr(v int) *int { return &v }
