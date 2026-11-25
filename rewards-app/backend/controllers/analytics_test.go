package controllers

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// readSource อ่านไฟล์ต้นฉบับในแพ็กเกจนี้ เทสต์ชุดนี้ตรวจตัวคิวรีตรง ๆ
func readSource(t *testing.T, name string) string {
	t.Helper()
	data, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("อ่าน %s ไม่ได้: %v", name, err)
	}
	return string(data)
}

/*
ตรวจ "กติกาการนับ" ของหน้าวิเคราะห์จากตัวคิวรีโดยตรง

หน้านี้มีสิบกว่าบล็อกที่ต้องนับด้วยกติกาเดียวกัน พอกติกาใดกติกาหนึ่งหลุดไปบล็อกเดียว
ตัวเลขบนหน้าจอจะขัดกันเองโดยไม่มีอะไรฟ้อง เพราะแต่ละบล็อกก็ยังตอบถูกตามนิยามของตัวเอง
บัคแบบนี้เคยหลุดมาแล้วสี่จุด เทสต์นี้กันไม่ให้หลุดซ้ำ

ไม่ต้องต่อฐานข้อมูล จึงรันได้ทุกที่ทุกครั้งที่ go test
*/

// queryOf ดึงคิวรีของฟังก์ชันที่ระบุออกมาจากไฟล์ต้นฉบับ
func queryOf(t *testing.T, fn string) string {
	t.Helper()
	src := readSource(t, "analytics.go")
	start := strings.Index(src, "\nfunc "+fn+"(")
	if start < 0 {
		t.Fatalf("ไม่พบฟังก์ชัน %s", fn)
	}
	end := strings.Index(src[start+1:], "\nfunc ")
	if end < 0 {
		end = len(src) - start - 1
	}
	return src[start : start+1+end]
}

var spaces = regexp.MustCompile(`\s+`)

func flat(s string) string { return spaces.ReplaceAllString(s, " ") }

/*
ตัวหารของทุกบล็อกต้องเป็นชุดเดียวกัน คือพนักงานที่ยังทำงานอยู่เท่านั้น

เคยหลุดสองจุด (โดนัทความถี่ และอัตราตามแผนก) ซึ่งนับคนที่ลาออกไปแล้วด้วย
ยอดกลางโดนัทจึงมากกว่าจำนวนพนักงานที่การ์ดด้านบนบอก
และแผนกที่มีคนลาออกก็ถูกหารด้วยหัวที่ไม่มีอยู่จริง อัตราเลยต่ำกว่าความจริง
*/
func TestEveryBlockCountsOnlyActiveStaff(t *testing.T) {
	for _, fn := range []string{"activeAudience", "joinFrequency", "departmentRates", "AdminFrequencyPeople"} {
		q := flat(queryOf(t, fn))
		if !strings.Contains(q, "u.role = 'user' AND u.status = 'Active'") {
			t.Errorf("%s: ต้องนับเฉพาะพนักงานที่ยังทำงานอยู่ (u.status = 'Active')", fn)
		}
	}
}

/*
ช่วงเวลาของทุกบล็อกฝั่งกิจกรรมต้องยึด "วันจัดงาน" ไม่ใช่ "วันที่กดลงทะเบียน"

ถ้าปนกัน งานที่จัดเดือนหน้าแต่เปิดลงทะเบียนเดือนนี้จะถูกนับเข้าเดือนนี้
สองบล็อกในหน้าเดียวกันจะนับคนละชุดและไม่มีทางตรงกัน
*/
func TestEventBlocksFilterByEventDate(t *testing.T) {
	for _, fn := range []string{"eventStats", "attendanceTrend", "topEvents", "joinFrequency", "departmentRates", "AdminFrequencyPeople"} {
		q := flat(queryOf(t, fn))
		if !strings.Contains(q, "e.event_date >= $1 AND e.event_date < $2") {
			t.Errorf("%s: ต้องกรองช่วงเวลาด้วยวันจัดงาน (e.event_date)", fn)
		}
		if strings.Contains(q, "r.created_at >= $1") {
			t.Errorf("%s: ยังกรองด้วยวันที่กดลงทะเบียนอยู่ (r.created_at)", fn)
		}
	}
}

/*
ตัวกรองกิจกรรมต้องถึงทุกบล็อกที่ผูกกับกิจกรรมได้

เคยหลุดที่การ์ดสี่ใบหัวหน้าจอ เลือกกิจกรรมเดียวแล้วกราฟข้างล่างเปลี่ยน
แต่การ์ดยังเป็นตัวเลขของทั้งช่วงอยู่ กลายเป็นสองขอบเขตบนหน้าจอเดียวกัน

และที่รายชื่อซึ่งกดมาจากโดนัท ซึ่งไม่กรองตามกิจกรรมเลย
กดช่องเดียวกันจึงได้รายชื่อไม่ตรงกับตัวเลขบนช่องนั้น
*/
func TestEventFilterReachesEveryEventBlock(t *testing.T) {
	cases := map[string]string{
		"eventStats":           "e.id",
		"attendanceTrend":      "e.id",
		"topEvents":            "e.id",
		"joinFrequency":        "e.id",
		"departmentRates":      "e.id",
		"AdminFrequencyPeople": "e.id",
		"pointTrend":           "t.event_id",
	}
	for fn, column := range cases {
		body := queryOf(t, fn)
		if !strings.Contains(body, `eventClause("`+column+`"`) && !strings.Contains(body, "eventOnly") {
			t.Errorf("%s: ต้องใส่ตัวกรองกิจกรรมที่คอลัมน์ %s", fn, column)
		}
	}
}

/*
บล็อกที่ผูกกับกิจกรรมไม่ได้ ต้องไม่แกล้งกรอง

การแลกของรางวัลและคะแนนรวมของทั้งระบบไม่ได้เกิดจากกิจกรรมใดกิจกรรมหนึ่ง
หน้าเว็บซ่อนสองบล็อกนี้ตอนเลือกกิจกรรมเดียวอยู่แล้ว
ถ้าวันหนึ่งมีใครมาเติมตัวกรองกิจกรรมให้มัน ตัวเลขจะกลายเป็นศูนย์ทั้งแผงโดยไม่มีคำอธิบาย
*/
func TestSystemWideBlocksIgnoreEventFilter(t *testing.T) {
	for _, fn := range []string{"pointStats", "rewardSplit", "topRewards"} {
		if strings.Contains(queryOf(t, fn), "eventClause(") {
			t.Errorf("%s: ไม่ควรมีตัวกรองกิจกรรม เพราะไม่ได้ผูกกับกิจกรรมใดกิจกรรมหนึ่ง", fn)
		}
	}
}

// ทุกบล็อกต้องรับตัวกรองแผนกและระดับสมาชิกผ่าน userClause ตัวเดียวกัน
func TestEveryBlockAppliesUserFilters(t *testing.T) {
	for _, fn := range []string{
		"eventStats", "attendanceTrend", "topEvents", "joinFrequency", "departmentRates",
		"pointStats", "pointTrend", "rewardSplit", "topRewards", "activeAudience",
		"eventSummary", "AdminFrequencyPeople",
	} {
		if !strings.Contains(queryOf(t, fn), "userClause(") {
			t.Errorf("%s: ต้องรับตัวกรองแผนก/ระดับสมาชิกด้วย userClause", fn)
		}
	}
}

// กิจกรรมที่ยังเป็นร่างต้องไม่ถูกนับในบล็อกไหนเลย
func TestDraftEventsAreNeverCounted(t *testing.T) {
	for _, fn := range []string{"eventStats", "attendanceTrend", "topEvents", "joinFrequency", "departmentRates", "eventOptions", "AdminFrequencyPeople"} {
		if !strings.Contains(queryOf(t, fn), "publishedEvents") {
			t.Errorf("%s: ต้องตัดกิจกรรมที่เป็นร่างออก", fn)
		}
	}
}
