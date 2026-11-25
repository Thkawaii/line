package org

import "testing"

// กติกาการปรับคะแนนเขียนไว้เป็นข้อความสั้น ๆ แต่ตีความผิดได้หลายทาง
// เทสต์นี้ตรึงการตีความไว้ ใครแก้รายการตำแหน่งหรือแผนกแล้วกติกาเพี้ยนจะรู้ทันที

func TestCanRequestPointAdjust(t *testing.T) {
	cases := []struct {
		section string
		want    bool
		why     string
	}{
		{"ER", true, "ER ยื่นได้"},
		{"ERG", true, "รหัสอีกแบบของ ER"},
		{"GA", true, "GA ยื่นได้"},
		{"GAG", true, "รหัสในทะเบียนพนักงานของ GA"},
		{"HR", true, "HR ยื่นได้"},
		{"HRM", true, "รหัสในทะเบียนพนักงานของ HR"},
		{"HRD", true, "อีกรหัสของ HR"},
		{" gag ", true, "ช่องว่างและตัวพิมพ์เล็กจากไฟล์นำเข้า"},
		{"ITS", false, "แผนกอื่นยื่นไม่ได้"},
		{"ACC", false, "แผนกอื่นยื่นไม่ได้"},
		{"", false, "ไม่ได้ระบุแผนก"},
	}
	for _, c := range cases {
		if got := CanRequestPointAdjust(c.section); got != c.want {
			t.Errorf("CanRequestPointAdjust(%q) = %v ต้องการ %v — %s", c.section, got, c.want, c.why)
		}
	}
}

func TestCanApprovePointAdjust(t *testing.T) {
	cases := []struct {
		section  string
		position string
		group    string
		ok       bool
		why      string
	}{
		{"GAG", "Chief Officer", "GA", true, "ตำแหน่งต่ำสุดที่อนุมัติได้พอดี"},
		{"GAG", "Manager", "GA", true, "สูงกว่าเกณฑ์"},
		{"GA", "Director", "GA", true, "สูงสุด"},
		{"HRM", "Chief Officer", "HR", true, "ฝั่ง HR"},
		{"HRD", "Assistant Manager", "HR", true, "ฝั่ง HR สูงกว่าเกณฑ์"},

		{"GAG", "Senior Officer", "", false, "ต่ำกว่า Chief Officer หนึ่งขั้น"},
		{"GAG", "Officer", "", false, "ต่ำกว่าเกณฑ์"},
		{"HRM", "Clerk", "", false, "ต่ำกว่าเกณฑ์"},

		{"ER", "Manager", "", false, "ER ยื่นได้แต่อนุมัติไม่ได้"},
		{"ERG", "Director", "", false, "ER ต่อให้ตำแหน่งสูงก็อนุมัติไม่ได้"},
		{"ITS", "Director", "", false, "แผนกนอกกติกา"},

		{"GAG", "หัวหน้าแผนก", "", false, "ตำแหน่งที่พิมพ์เองนอกรายการ ไม่เดาให้"},
		{"GAG", "", "", false, "ไม่ได้ระบุตำแหน่ง"},
	}
	for _, c := range cases {
		group, ok := CanApprovePointAdjust(c.section, c.position)
		if ok != c.ok || group != c.group {
			t.Errorf("CanApprovePointAdjust(%q,%q) = (%q,%v) ต้องการ (%q,%v) — %s",
				c.section, c.position, group, ok, c.group, c.ok, c.why)
		}
	}
}

// "Chief Officer ขึ้นไป" วัดจากลำดับใน Positions ซึ่งเรียงจากสูงสุดลงต่ำสุด
// ตำแหน่งสายวิศวกรรมอยู่เหนือ Chief Officer ในรายการ จึงนับว่าผ่าน
func TestIsApproverPositionFollowsListOrder(t *testing.T) {
	limit, ok := PositionRank(MinApproverPosition)
	if !ok {
		t.Fatalf("%s ต้องอยู่ในรายการ Positions", MinApproverPosition)
	}

	for i, position := range Positions {
		want := i <= limit
		if got := IsApproverPosition(position); got != want {
			t.Errorf("IsApproverPosition(%q) ลำดับ %d = %v ต้องการ %v", position, i, got, want)
		}
	}
}

// ตำแหน่งที่อนุมัติได้ต้องไม่ว่าง ไม่งั้นคำขอทุกใบจะค้างตลอดกาลโดยไม่มีใครรู้สาเหตุ
func TestApproverPositionsNotEmpty(t *testing.T) {
	count := 0
	for _, position := range Positions {
		if IsApproverPosition(position) {
			count++
		}
	}
	if count == 0 {
		t.Fatal("ไม่มีตำแหน่งไหนอนุมัติได้เลย กติกาจะล็อกตัวเอง")
	}
}

// ฝั่ง GA กับ HR ต้องไม่มีรหัสแผนกซ้ำกัน ไม่งั้นคนคนเดียวจะนับเป็นสองฝั่ง
func TestApproverGroupsDoNotOverlap(t *testing.T) {
	for _, ga := range GASections {
		if ApproverGroup(ga) != "GA" {
			t.Errorf("%q ควรอยู่ฝั่ง GA", ga)
		}
		for _, hr := range HRSections {
			if ApproverGroup(hr) != "HR" {
				t.Errorf("%q ควรอยู่ฝั่ง HR", hr)
			}
			if ga == hr {
				t.Errorf("รหัสแผนก %q อยู่ทั้งสองฝั่ง คนคนเดียวจะอนุมัติครบเองได้", ga)
			}
		}
	}
}

// ทุกแผนกที่อนุมัติได้ต้องยื่นคำขอได้ด้วย ไม่งั้นจะมีคนอนุมัติคำขอที่ตัวเองยื่นไม่ได้
func TestApproverSectionsCanAlsoRequest(t *testing.T) {
	for _, section := range append(append([]string{}, GASections...), HRSections...) {
		if !CanRequestPointAdjust(section) {
			t.Errorf("%q อนุมัติได้แต่ยื่นคำขอไม่ได้", section)
		}
	}
}
