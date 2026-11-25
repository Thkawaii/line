package controllers

import (
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"rewards/store"
)

/*
QR ของรางวัลเป็นสิ่งที่ตัดสินว่าใครได้ของไป ถ้าปลอมได้ก็เท่ากับของหายฟรี
เทสต์นี้ไล่ทุกทางที่ QR ปลอมหรือหมดอายุอาจเล็ดลอดผ่านไปได้
*/

func TestMain(m *testing.M) {
	// signQR อ่านกุญแจจากตัวแปรแวดล้อม ตั้งค่าไว้ก่อนไม่งั้นทุกเคสเซ็นด้วยกุญแจว่าง
	os.Setenv("JWT_SECRET", "กุญแจสำหรับทดสอบ-do-not-use-in-production")
	os.Exit(m.Run())
}

// token สร้าง QR ของรางวัลที่หมดอายุในอีกกี่นาที ใส่ค่าติดลบได้ถ้าอยากให้หมดอายุไปแล้ว
func token(id int64, in time.Duration) string {
	expires := time.Now().Add(in).UnixMilli()
	payload := "RD." + strconv.FormatInt(id, 10) + "." + strconv.FormatInt(expires, 10)
	return payload + "." + signQR(payload)
}

func TestParseRedemptionTokenAcceptsFreshToken(t *testing.T) {
	id, problem, matched := parseRedemptionToken(token(42, qrTTL))
	if !matched {
		t.Fatal("QR ที่ระบบออกเองต้องถูกมองว่าเป็น QR ของรางวัล")
	}
	if problem != "" {
		t.Fatalf("QR ที่เพิ่งออกต้องใช้ได้ แต่ได้ปัญหา: %s", problem)
	}
	if id != 42 {
		t.Fatalf("อ่านรหัสรายการได้ %d ต้องการ 42", id)
	}
}

func TestParseRedemptionTokenRejectsExpired(t *testing.T) {
	_, problem, matched := parseRedemptionToken(token(42, -time.Minute))
	if !matched {
		t.Fatal("QR ที่หมดอายุยังต้องถูกมองว่าเป็น QR ของรางวัล จะได้บอกเหตุผลถูก")
	}
	if problem == "" {
		t.Fatal("QR ที่หมดอายุแล้วต้องใช้ไม่ได้ — ภาพหน้าจอที่ส่งต่อกันจะใช้ได้ตลอดไป")
	}
	if !strings.Contains(problem, "หมดอายุ") {
		t.Fatalf("ข้อความควรบอกว่าหมดอายุ ได้: %s", problem)
	}
}

func TestParseRedemptionTokenRejectsTampering(t *testing.T) {
	good := token(42, qrTTL)
	parts := strings.Split(good, ".")

	cases := map[string]string{
		"เปลี่ยนรหัสรายการเป็นของคนอื่น": "RD.99." + parts[2] + "." + parts[3],
		"ยืดวันหมดอายุออกไปเอง": "RD." + parts[1] + "." +
			strconv.FormatInt(time.Now().Add(100*time.Hour).UnixMilli(), 10) + "." + parts[3],
		"แต่งลายเซ็นขึ้นมาเอง": "RD." + parts[1] + "." + parts[2] + ".0000000000000000",
		"ตัดลายเซ็นให้สั้นลง":  "RD." + parts[1] + "." + parts[2] + "." + parts[3][:8],
	}

	for name, bad := range cases {
		_, problem, matched := parseRedemptionToken(bad)
		if !matched {
			t.Errorf("%s: ควรถูกมองว่าเป็น QR ของรางวัลที่ใช้ไม่ได้ ไม่ใช่รหัสแบบอื่น", name)
			continue
		}
		if problem == "" {
			t.Errorf("%s: ผ่านไปได้ ทั้งที่ไม่ควรผ่าน", name)
		}
	}
}

// รหัสแบบอื่นต้องไม่ถูกอ้างสิทธิ์โดยตัวอ่าน QR ของรางวัล
// ไม่งั้น QR ประจำตัวพนักงานกับรหัสที่พิมพ์มือจะถูกปฏิเสธตั้งแต่ด่านแรก
func TestParseRedemptionTokenIgnoresOtherCodes(t *testing.T) {
	others := []string{
		"7.1795000000000.abcdef0123456789", // QR ประจำตัวพนักงาน สามส่วน
		"RW-260615-9A8B7C",                 // รหัสอ้างอิงที่พิมพ์เอง
		"2105",                             // รหัสพนักงาน
		"",                                 // ยังไม่ได้สแกนอะไร
		"RX.1.2.3",                         // ขึ้นต้นด้วยอย่างอื่น
	}
	for _, code := range others {
		if _, _, matched := parseRedemptionToken(code); matched {
			t.Errorf("%q ไม่ใช่ QR ของรางวัล แต่ถูกอ้างสิทธิ์ไป", code)
		}
	}
}

// กุญแจคนละดอกต้องเซ็นได้ไม่เหมือนกัน ไม่งั้น QR จากระบบอื่นจะใช้กับระบบนี้ได้
func TestSignQRDependsOnSecret(t *testing.T) {
	first := signQR("RD.1.2")

	os.Setenv("JWT_SECRET", "กุญแจอีกดอกหนึ่ง")
	second := signQR("RD.1.2")
	os.Setenv("JWT_SECRET", "กุญแจสำหรับทดสอบ-do-not-use-in-production")

	if first == second {
		t.Fatal("ลายเซ็นไม่ได้ขึ้นกับกุญแจเลย QR จากระบบอื่นจะใช้ข้ามมาได้")
	}
	if len(first) != 16 {
		t.Fatalf("ลายเซ็นยาว %d ตัว ต้องการ 16", len(first))
	}
}

/*
คอลัมน์ json ที่ออกมาจากฐานข้อมูลเป็นข้อความ ไม่ใช่โครงสร้าง

ถ้าส่งออกไปทั้งอย่างนั้น หน้าเว็บจะได้สตริงแล้วพังตอนเรียก .map()
ซึ่งเกิดขึ้นมาแล้วจริงกับรายการผู้อนุมัติในหน้าคำขอปรับคะแนน
*/
func TestDecodeJSONColumn(t *testing.T) {
	rows := []store.Row{
		{"decisions": `[{"group":"GA","decision":"approve"}]`},
		{"decisions": `[]`},
		{"decisions": `ไม่ใช่ json`}, // แปลงไม่ได้ ต้องกลายเป็นอาร์เรย์ว่าง ไม่ใช่ปล่อยผ่าน
		{"decisions": nil},           // ไม่มีค่า ปล่อยไว้อย่างนั้น
		{"other": "ไม่เกี่ยว"},       // ไม่มีคอลัมน์นี้ ต้องไม่ล้ม
	}

	decodeJSONColumn(rows, "decisions")

	if list, ok := rows[0]["decisions"].([]any); !ok || len(list) != 1 {
		t.Errorf("แถวแรกควรเป็นอาร์เรย์ที่มีหนึ่งรายการ ได้ %T %v",
			rows[0]["decisions"], rows[0]["decisions"])
	}
	if list, ok := rows[1]["decisions"].([]any); !ok || len(list) != 0 {
		t.Errorf("อาร์เรย์ว่างควรยังเป็นอาร์เรย์ ได้ %T", rows[1]["decisions"])
	}
	if list, ok := rows[2]["decisions"].([]any); !ok || len(list) != 0 {
		t.Errorf("ข้อความที่แปลงไม่ได้ควรกลายเป็นอาร์เรย์ว่าง ไม่ใช่ %T", rows[2]["decisions"])
	}
	if rows[3]["decisions"] != nil {
		t.Error("ค่า nil ควรถูกปล่อยไว้อย่างเดิม")
	}
}
