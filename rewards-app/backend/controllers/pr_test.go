package controllers

import (
	"os"
	"strings"
	"testing"
)

/*
ตรึงกติกาของงานประชาสัมพันธ์ไว้

เรื่องที่ตรึงไว้เป็นเรื่องที่ "พังเงียบ" ได้ทั้งหมด
คือยังทำงานได้ ไม่มี error ไม่มีอะไรฟ้อง แต่ผลที่ออกมาผิด
*/

func prSource(t *testing.T) string {
	t.Helper()
	data, err := os.ReadFile("pr.go")
	if err != nil {
		t.Fatalf("อ่าน pr.go ไม่ได้: %v", err)
	}
	return string(data)
}

/*
เวลาที่ต้องใช้จริงก่อนจะนับว่าดูครบ

ข้อความใช้เวลาอ่านตรง ๆ วิดีโอคิดจากความยาวคลิปคูณเปอร์เซ็นต์
ถ้าคำนวณผิด ผลคือคนดูจริงไม่ได้คะแนน หรือคนไม่ได้ดูก็ได้คะแนน
ซึ่งทั้งสองแบบไม่มีอะไรแจ้งเตือน
*/
func TestRequiredSeconds(t *testing.T) {
	cases := []struct {
		name                                string
		kind                                string
		readSeconds, watchPercent, videoLen int
		want                                int
	}{
		{"ข้อความ 30 วินาที", "text", 30, 90, 0, 30},
		{"รูปภาพ 60 วินาที", "image", 60, 90, 0, 60},
		{"วิดีโอ 120 วินาที ดู 90%", "video", 30, 90, 120, 108},
		{"วิดีโอ 200 วินาที ดูจนจบ", "video", 30, 100, 200, 200},
		{"วิดีโอ 45 วินาที ดูครึ่งเดียว", "video", 30, 50, 45, 22},
		{"วิดีโอที่ยังไม่รู้ความยาว ตรวจด้วยเวลาไม่ได้", "video", 30, 90, 0, 0},
	}

	for _, c := range cases {
		got := requiredSeconds(c.kind, c.readSeconds, c.watchPercent, c.videoLen)
		if got != c.want {
			t.Errorf("%s: ได้ %d ควรได้ %d", c.name, got, c.want)
		}
	}
}

// ค่าที่ตั้งไม่ได้ต้องถูกปฏิเสธตั้งแต่ตอนบันทึก ไม่ใช่ไปโผล่เป็นข่าวที่ไม่มีวันจ่ายคะแนน
func TestCheckPr(t *testing.T) {
	text := func(s string) *string { return &s }
	number := func(n int) *int { return &n }

	cases := []struct {
		name    string
		body    prBody
		wantBad bool
	}{
		{"ข้อความปกติ", prBody{Kind: text("text"), Points: number(5), ReadSeconds: number(30)}, false},
		{"วิดีโอที่มีลิงก์", prBody{Kind: text("video"), VideoURL: text("/uploads/a.mp4")}, false},
		{"ชนิดเนื้อหาแปลกปลอม", prBody{Kind: text("audio")}, true},
		{"วิดีโอที่ไม่ใส่ไฟล์", prBody{Kind: text("video"), VideoURL: text("  ")}, true},
		{"หมวดแปลกปลอม", prBody{Category: text("gossip")}, true},
		{"คะแนนติดลบ", prBody{Points: number(-1)}, true},
		{"คะแนนศูนย์ (ข่าวที่ไม่แจกคะแนน)", prBody{Points: number(0)}, false},
		{"เวลาอ่านเกินหนึ่งชั่วโมง", prBody{ReadSeconds: number(3601)}, true},
		{"เปอร์เซ็นต์ต่ำกว่าสิบ", prBody{WatchPercent: number(9)}, true},
		{"เปอร์เซ็นต์เกินร้อย", prBody{WatchPercent: number(101)}, true},
		{"ดูจนจบคลิป", prBody{WatchPercent: number(100)}, false},
		{"วันสิ้นสุดก่อนวันเริ่ม", prBody{StartsAt: text("2026-12-31"), EndsAt: text("2026-01-01")}, true},
		{"วันสิ้นสุดหลังวันเริ่ม", prBody{StartsAt: text("2026-01-01"), EndsAt: text("2026-12-31")}, false},
		{"ไม่ระบุวันสิ้นสุด", prBody{StartsAt: text("2026-01-01")}, false},
	}

	for _, c := range cases {
		msg := checkPr(c.body)
		if (msg != "") != c.wantBad {
			t.Errorf("%s: ได้ข้อความ %q", c.name, msg)
		}
	}
}

/*
คะแนนจากประชาสัมพันธ์ต้องจ่ายผ่าน awardPoints ตัวเดียวกับทุกที่

ถ้าใครมาเขียน UPDATE users SET points = points + n เองตรงนี้
ตัวคูณของระดับสมาชิกจะหายไป และระดับจะไม่เลื่อนให้
คนที่อ่านข่าวจะได้คะแนนไม่เท่ากับคนที่ไปงาน ทั้งที่ตั้งไว้เท่ากัน
*/
func TestPrAwardsThroughTheSharedPath(t *testing.T) {
	src := prSource(t)

	if !strings.Contains(src, "awardPoints(tx, claims.ID, view.points)") {
		t.Error("ต้องจ่ายคะแนนผ่าน awardPoints เหมือนกิจกรรมและแบบสำรวจ")
	}
	if strings.Contains(src, "UPDATE users SET points") {
		t.Error("ห้ามบวกคะแนนเข้าบัญชีเอง ตัวคูณระดับสมาชิกจะหายไป")
	}
	if !strings.Contains(src, "INSERT INTO point_transactions") {
		t.Error("ต้องบันทึกลงประวัติคะแนนก้อนเดียวกับที่อื่น")
	}
	if !strings.Contains(src, "notifyTierUp") {
		t.Error("ต้องแจ้งเตือนเมื่อเลื่อนระดับ เหมือนทางอื่นที่จ่ายคะแนน")
	}
}

/*
ประกาศบังคับอ่านของเดิมต้องไม่ปนกับประชาสัมพันธ์

ทั้งสองอย่างใช้ตารางเดียวกัน ถ้าลืมกรอง channel
ข่าวประชาสัมพันธ์ทุกชิ้นจะไปเด้งเป็นป็อปอัปบังคับอ่านทับทุกหน้า
*/
func TestChannelsStaySeparate(t *testing.T) {
	data, err := os.ReadFile("announcements.go")
	if err != nil {
		t.Fatalf("อ่าน announcements.go ไม่ได้: %v", err)
	}
	gate := string(data)

	if !strings.Contains(gate, "gateOnly") {
		t.Error("ป็อปอัปบังคับอ่านต้องกรองเฉพาะ channel = 'gate'")
	}
	if !strings.Contains(gate, "WHERE a.channel = 'gate'") {
		t.Error("หน้าจัดการประกาศข่าวสารต้องกรองเฉพาะ channel = 'gate'")
	}

	src := prSource(t)
	if !strings.Contains(src, "a.channel = 'pr'") {
		t.Error("ฝั่งประชาสัมพันธ์ต้องกรองเฉพาะ channel = 'pr'")
	}
	if !strings.Contains(src, "WHERE id = $1 AND channel = 'pr'") {
		t.Error("การแก้ไขต้องจำกัดเฉพาะข่าวในช่องทางประชาสัมพันธ์")
	}
}

/*
ไม่เจอแถวต้องตอบว่าไม่พบ

store.QueryOne คืน (nil, nil) เมื่อไม่เจอ ไม่ใช่ sql.ErrNoRows
โค้ดที่เช็ก ErrNoRows อย่างเดียวจะไม่เข้าเงื่อนไขเลย แล้วตอบ 200 พร้อมข้อมูลว่าง
ซึ่งแปลว่าข่าวฉบับร่างเปิดดูได้ถ้ารู้เลขที่อยู่
*/
func TestMissingRowsAnswerNotFound(t *testing.T) {
	src := prSource(t)
	if strings.Count(src, "if row == nil {") < 2 {
		t.Error("ต้องเช็กว่าไม่เจอแถวด้วย row == nil ทั้งตอนเปิดอ่านและตอนแก้ไข")
	}
}

/*
การจ่ายคะแนนต้องเกิดจากการกดปุ่มเท่านั้น

ของเดิมจ่ายให้อัตโนมัติทันทีที่ความคืบหน้าถึงเกณฑ์ แล้วเด้งหน้ารับคะแนนขึ้นมาทับ
คนที่ดูคลิปอยู่จึงถูกขัดจังหวะตั้งแต่ยังดูไม่จบ และไม่มีใครดูส่วนที่เหลือ
*/
func TestProgressNeverAwards(t *testing.T) {
	src := prSource(t)

	start := strings.Index(src, "func PrProgress(")
	end := strings.Index(src[start:], "\nfunc ")
	progress := src[start : start+end]

	for _, forbidden := range []string{"awardPoints(", "INSERT INTO point_transactions", "awarded_at = now()"} {
		if strings.Contains(progress, forbidden) {
			t.Errorf("PrProgress ต้องบันทึกความคืบหน้าอย่างเดียว แต่ยังมี %q อยู่", forbidden)
		}
	}
	if !strings.Contains(src, "func PrClaim(") {
		t.Error("ต้องมี PrClaim แยกไว้สำหรับตอนผู้ใช้กดปุ่มรับคะแนน")
	}
}

/*
วิดีโอต้องตัดสินจากวินาทีที่ดูจริง ไม่ใช่ตำแหน่งที่เลื่อนไปถึง

ถ้ากลับไปใช้ progress ตัดสิน การลากแถบข้ามไปท้ายคลิปครั้งเดียว
จะทำให้ผ่านเงื่อนไขทันทีโดยไม่ได้ดูอะไรเลย ซึ่งเคยเกิดขึ้นมาแล้ว
*/
func TestVideoCountsWatchedSecondsNotPosition(t *testing.T) {
	src := prSource(t)

	start := strings.Index(src, "func (v viewState) eligible()")
	end := strings.Index(src[start:], "\n}")
	rule := src[start : start+end]

	// ตัดเอาเฉพาะส่วนของวิดีโอ ซึ่งเริ่มหลังจากสาขาของข้อความคืนค่าไปแล้ว
	// ส่วนของข้อความใช้ v.progress ได้ตามปกติ จึงต้องไม่รวมเข้ามาด้วย
	video := rule[strings.Index(rule, "need := requiredSeconds("):]
	if !strings.Contains(video, "v.watched < need") {
		t.Error("เงื่อนไขของวิดีโอต้องวัดจาก watched (วินาทีที่ดูจริง)")
	}
	if strings.Contains(video, "v.progress") {
		t.Error("เงื่อนไขของวิดีโอต้องไม่ใช้ progress ซึ่งเป็นตำแหน่งที่เลื่อนไปถึง")
	}
	if !strings.Contains(src, "ceiling := view.elapsed*2 + 5") {
		t.Error("วินาทีที่ดูจริงต้องมีเพดานตามเวลาจริงที่ผ่านไป")
	}
}

/*
TestItemReturnsSavedProgress กันไม่ให้ความคืบหน้าหายตอนเปิดหน้าใหม่

อาการที่เคยเจอคือคนอ่านครบแล้วลืมกดรับคะแนน พอกลับเข้ามาใหม่เห็นศูนย์
และไม่เห็นปุ่มรับคะแนน ทั้งที่ของที่อ่านไปแล้วยังอยู่ครบในฐานข้อมูล
สาเหตุคือ PrItem ไม่เคยส่งสภาพการอ่านกลับไปให้หน้าเว็บ

ถ้าใครย้อนกลับไปส่งเฉพาะตัวข่าวอีก อาการเดิมจะกลับมาทันที
*/
func TestItemReturnsSavedProgress(t *testing.T) {
	src := prSource(t)

	start := strings.Index(src, "func PrItem(")
	end := strings.Index(src[start:], "\n/*")
	item := src[start : start+end]

	for _, need := range []string{
		`"progress"`,  // อ่านไปแล้วกี่วินาที
		`"watched"`,   // ดูคลิปไปแล้วกี่วินาที
		`"eligible"`,  // ขึ้นปุ่มรับคะแนนได้เลยไหม
		`"need"`,      // ต้องให้ครบเท่าไหร่
		"loadView(tx", // ใช้กติกาตัวเดียวกับตอนกดรับคะแนน ไม่คิดเองซ้ำอีกชุด
	} {
		if !strings.Contains(item, need) {
			t.Errorf("PrItem ต้องส่ง %s กลับไปด้วย ไม่งั้นเปิดหน้าใหม่แล้วความคืบหน้าหาย", need)
		}
	}

	// ตัวเลขที่ส่งกลับต้องมาจากฐานข้อมูลของผู้ใช้คนนั้น ไม่ใช่ศูนย์ตายตัว
	if !strings.Contains(src, "COALESCE(v.watched_seconds, 0)  AS watched_seconds") {
		t.Error("คิวรีต้องดึง watched_seconds ที่เก็บไว้ออกมาด้วย")
	}
}
