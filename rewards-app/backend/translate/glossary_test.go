package translate

import "testing"

// คลังคำต้องแปลข้อความสั้นที่พบบ่อยได้สะอาด และต้องยอมแพ้อย่างเงียบ ๆ
// เมื่อเจอประโยคที่แปลได้ไม่ครบ แทนที่จะคืนข้อความลูกผสมไทย-อังกฤษ
func TestGlossaryCleanOrNothing(t *testing.T) {
	clean := []string{"ของรางวัล", "กิจกรรม", "คะแนน", "แผนก", "พนักงาน", "แบบสำรวจ"}
	for _, text := range clean {
		if got := Glossary(text, "en"); got == "" {
			t.Errorf("คาดว่าแปล %q ได้ แต่ได้ค่าว่าง", text)
		}
	}

	messy := []string{
		"รับคะแนนเพิ่มขึ้น 1.5 เท่า มีของรางวัลให้แลกมากขึ้นเฉพาะระดับ Silver",
		"สำหรับพนักงานที่มีส่วนร่วมอย่างต่อเนื่อง รับสิทธิประโยชน์เพิ่มเติม",
	}
	for _, text := range messy {
		if got := Glossary(text, "en"); got != "" {
			t.Errorf("ประโยคที่แปลไม่ครบควรคืนค่าว่าง แต่ได้ %q", got)
		}
	}
}

// ข้อความที่ไม่มีอักษรไทยเลยต้องไม่ถูกแตะ
func TestGlossarySkipsNonThai(t *testing.T) {
	if got := Glossary("KOBELCO SK210", "en"); got != "" {
		t.Errorf("ข้อความที่ไม่มีอักษรไทยควรคืนค่าว่าง แต่ได้ %q", got)
	}
}

// เครื่องหมายวรรคตอนต้องไม่หายไปกับคำแปล และต้องไม่มีช่องว่างแปลก ๆ หลังวงเล็บ
func TestGlossaryKeepsPunctuation(t *testing.T) {
	en := Glossary("(ระดับพิเศษ)", "en")
	if en != "(level special)" {
		t.Errorf("อังกฤษ: ได้ %q", en)
	}

	ja := Glossary("(ระดับพิเศษ)", "ja")
	if ja != "(レベル特別)" {
		t.Errorf("ญี่ปุ่น: ได้ %q", ja)
	}
}
