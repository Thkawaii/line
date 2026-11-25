package controllers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
QR ที่พนักงานยื่นให้เจ้าหน้าที่สแกน

มีสองใบ คนละงานกัน
	QR ประจำตัว     ใช้เช็คอินเข้ากิจกรรม        "<userID>.<หมดอายุ>.<ลายเซ็น>"
	QR ของรางวัล    ใช้ตอนมารับของที่แลกไว้      "RD.<redemptionID>.<หมดอายุ>.<ลายเซ็น>"

ทั้งคู่มีอายุสั้นและเซ็นกำกับด้วยกุญแจของเซิร์ฟเวอร์

ทำไมต้องเซ็นและต้องหมดอายุ
รหัสอ้างอิงของรางวัล (RW-xxxxxx) พิมพ์อยู่บนการ์ดในแอปอยู่แล้ว ใครถ่ายรูปหน้าจอ
ส่งต่อให้เพื่อนก็เอาไปรับของแทนได้ QR ที่หมดอายุในไม่กี่นาทีทำให้ภาพที่ส่งต่อใช้ไม่ได้
ต้องเป็นเจ้าตัวเปิดแอปตอนนั้นจริง ๆ

ตัวสแกนยังรับรหัสอ้างอิงแบบพิมพ์มือได้เหมือนเดิม เผื่อมือถือพนักงานแบตหมด
ความปลอดภัยตรงนั้นมาจากการที่เจ้าหน้าที่เห็นหน้าคนมารับ ไม่ได้มาจากตัวรหัส
*/

// qrTTL คืออายุของ QR ทั้งสองใบ
//
// สั้นพอที่ภาพหน้าจอที่ส่งต่อจะใช้ไม่ได้ แต่ยาวพอให้เดินจากโต๊ะไปหาเจ้าหน้าที่
// และต่อแถวได้โดยไม่ต้องกดขอใหม่กลางคัน
const qrTTL = 15 * time.Minute

// signQR เซ็นข้อความด้วยกุญแจเดียวกับที่ใช้เซ็น token เข้าสู่ระบบ
//
// ตัด 16 ตัวแรกพอ ไม่ได้ปกป้องความลับอะไร แค่กันคนแต่งรหัสขึ้นมาเอง
// และ QR ที่ยาวกว่านี้สแกนยากขึ้นจริงบนหน้าจอมือถือที่ความสว่างต่ำ
func signQR(payload string) string {
	mac := hmac.New(sha256.New, []byte(os.Getenv("JWT_SECRET")))
	mac.Write([]byte(payload))
	return hex.EncodeToString(mac.Sum(nil))[:16]
}

/*
parseRedemptionToken อ่าน QR ของรางวัลและตรวจลายเซ็นกับวันหมดอายุ

คืนสามค่า

	id       รหัสรายการแลก ใช้ได้เมื่อ matched เป็นจริงและ problem ว่าง
	problem  ข้อความบอกผู้ดูแลว่าทำไมใช้ไม่ได้
	matched  รหัสนี้หน้าตาเป็น QR ของรางวัลหรือไม่

แยก matched ออกมาเพราะตัวสแกนรับรหัสหลายแบบปนกัน
ถ้ารหัสไม่ใช่รูปแบบนี้เลย ต้องปล่อยให้ตัวตรวจแบบอื่นลองต่อ ไม่ใช่ตอบว่าผิดทันที

ไม่แตะฐานข้อมูล จึงทดสอบได้ตรง ๆ และเป็นที่เดียวที่ตัดสินเรื่องลายเซ็นกับเวลา
*/
func parseRedemptionToken(code string) (int64, string, bool) {
	parts := strings.Split(strings.TrimSpace(code), ".")
	if len(parts) != 4 || !strings.EqualFold(parts[0], "RD") {
		return 0, "", false
	}

	id, err := strconv.ParseInt(parts[1], 10, 64)
	expires, err2 := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || err2 != nil || id <= 0 {
		return 0, "QR ของรางวัลนี้อ่านไม่ออก", true
	}

	/*
		เทียบลายเซ็นก่อนเทียบวันหมดอายุ

		ถ้าเทียบวันก่อน คนที่แต่ง QR ขึ้นมาเองจะได้ข้อความต่างกันระหว่าง
		"หมดอายุ" กับ "ไม่ถูกต้อง" ซึ่งบอกใบ้ว่าแก้ตรงไหนถึงจะผ่าน

		hmac.Equal เทียบแบบใช้เวลาเท่ากันทุกครั้ง ไม่ใช่ == ที่หยุดทันทีที่เจอตัวต่าง
	*/
	want := signQR(parts[0] + "." + parts[1] + "." + parts[2])
	if !hmac.Equal([]byte(want), []byte(parts[3])) {
		return 0, "QR นี้ไม่ถูกต้อง อาจถูกแก้ไขหรือมาจากระบบอื่น", true
	}
	if time.Now().UnixMilli() > expires {
		return 0, "QR ของรางวัลหมดอายุแล้ว ให้พนักงานกดดู QR ใหม่", true
	}
	return id, "", true
}

// QrToken ออก QR ประจำตัวพนักงาน ใช้เช็คอินเข้ากิจกรรม
func QrToken(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	user, err := store.QueryOne(`
		SELECT display_name, employee_code, department, branch, tier
		FROM users WHERE id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if user == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบบัญชีนี้")
		return
	}

	expires := time.Now().Add(qrTTL).UnixMilli()
	payload := strconv.FormatInt(claims.ID, 10) + "." + strconv.FormatInt(expires, 10)

	user["token"] = payload + "." + signQR(payload)
	user["expiresIn"] = int(qrTTL.Seconds())

	web.JSON(w, http.StatusOK, user)
}

/*
RedemptionQr ออก QR สำหรับของรางวัลที่แลกไว้แล้วแต่ยังไม่ได้รับ

ออกให้เฉพาะรายการของตัวเองที่ยังเป็น pending
รายการที่รับไปแล้วออก QR ไม่ได้ ไม่งั้นจะมีคนถือ QR ใบเดิมกลับมารับซ้ำ
*/
func RedemptionQr(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสรายการไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`
		SELECT d.ref_code, r.name
		FROM redemptions d JOIN rewards r ON r.id = d.reward_id
		WHERE d.id = $1 AND d.user_id = $2 AND d.status = 'pending'`, id, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบรายการนี้ หรือรับของไปแล้ว")
		return
	}

	expires := time.Now().Add(qrTTL).UnixMilli()
	payload := "RD." + strconv.FormatInt(id, 10) + "." + strconv.FormatInt(expires, 10)

	web.JSON(w, http.StatusOK, web.Map{
		"token":     payload + "." + signQR(payload),
		"refCode":   row["ref_code"],
		"name":      row["name"],
		"expiresIn": int(qrTTL.Seconds()),
	})
}
