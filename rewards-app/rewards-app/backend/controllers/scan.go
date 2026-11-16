package controllers

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"rewards/config"
	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
เครื่องสแกนกลางของผู้ดูแลระบบ

ในงานจริงผู้ดูแลถือมือถือเครื่องเดียวแล้วเจอ QR สองแบบปนกัน
	- QR ประจำตัวพนักงาน ใช้เช็คอินเข้ากิจกรรม
	- QR ของรางวัลที่แลกไว้ ใช้ตอนมารับของ

ถ้าแยกเป็นสองหน้าจอ ผู้ดูแลต้องเดาเองว่าคนตรงหน้าจะมาเช็คอินหรือมารับของ
แล้วสลับหน้าจอไปมา ซึ่งช้าและพลาดง่ายตอนคนต่อแถว

เส้นทางนี้จึงรับรหัสอะไรก็ได้แล้วแยกแยะให้เอง แล้วบอกกลับไปว่าเจออะไร
หน้าจอค่อยแสดงผลให้เหมาะกับสิ่งที่เจอ

	QR ประจำตัว  : "<userID>.<หมดอายุ>.<ลายเซ็น>"  มีอายุสั้นและเซ็นกำกับ
	QR ของรางวัล : รหัสอ้างอิง เช่น RW-261103-7A13E1
	พิมพ์มือ     : รหัสพนักงาน
*/

// resolveScan แปลงรหัสที่สแกนได้เป็นพนักงานหรือรายการแลกของรางวัล
// คืน kind เป็น "employee" หรือ "redemption" และข้อความบอกปัญหาถ้าอ่านไม่ออก
func resolveScan(code string) (kind string, userID int64, refCode string, problem string) {
	code = strings.TrimSpace(code)
	if code == "" {
		return "", 0, "", "ยังไม่ได้รับรหัส"
	}

	// QR ประจำตัวพนักงาน มีสามส่วนคั่นด้วยจุด
	if parts := strings.Split(code, "."); len(parts) == 3 {
		id, err := strconv.ParseInt(parts[0], 10, 64)
		expires, err2 := strconv.ParseInt(parts[1], 10, 64)
		if err == nil && err2 == nil {
			mac := hmac.New(sha256.New, []byte(os.Getenv("JWT_SECRET")))
			mac.Write([]byte(parts[0] + "." + parts[1]))
			want := hex.EncodeToString(mac.Sum(nil))[:16]

			if !hmac.Equal([]byte(want), []byte(parts[2])) {
				return "", 0, "", "QR นี้ไม่ถูกต้อง อาจถูกแก้ไขหรือมาจากระบบอื่น"
			}
			if time.Now().UnixMilli() > expires {
				return "", 0, "", "QR หมดอายุแล้ว ให้พนักงานกดขอรหัสใหม่"
			}
			return "employee", id, "", ""
		}
	}

	// รหัสอ้างอิงของรางวัล
	if strings.HasPrefix(strings.ToUpper(code), "RW-") {
		return "redemption", 0, strings.ToUpper(code), ""
	}

	// เหลือกรณีเดียวคือผู้ดูแลพิมพ์รหัสพนักงานเอง
	var id int64
	err := config.DB.QueryRow(`SELECT id FROM users WHERE employee_code = $1 AND role = 'user'`, code).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return "", 0, "", "ไม่พบพนักงานรหัสนี้"
	}
	if err != nil {
		return "", 0, "", "อ่านรหัสไม่สำเร็จ"
	}
	return "employee", id, "", ""
}

/*
AdminScan รับรหัสที่สแกนได้แล้วทำสิ่งที่ควรทำให้เลย

	พนักงาน + ระบุกิจกรรมมา -> เช็คอินและให้คะแนนทันที
	พนักงาน + ไม่ระบุกิจกรรม -> คืนข้อมูลพนักงานเฉย ๆ ให้หน้าจอเตือนว่าต้องเลือกกิจกรรมก่อน
	ของรางวัล               -> เปลี่ยนเป็นรับแล้วทันที ไม่ต้องกดซ้ำ
	                           เพราะผู้ดูแลจะสแกนตอนที่คนมายืนรอรับของอยู่ตรงหน้าแล้ว
	                           ถ้าสแกนผิดคนมีปุ่มยกเลิกในหน้าผลให้กดคืนได้
*/
func AdminScan(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Code    string `json:"code"`
		EventID int64  `json:"eventId"`
	}
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	kind, userID, refCode, problem := resolveScan(body.Code)
	if problem != "" {
		web.Error(w, http.StatusBadRequest, problem)
		return
	}

	if kind == "redemption" {
		scanRedemption(w, claims.ID, refCode)
		return
	}

	user, err := store.QueryOne(`
		SELECT id, employee_code, display_name, department, position, branch, tier, points
		FROM users WHERE id = $1`, userID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if user == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบพนักงานคนนี้")
		return
	}

	if body.EventID == 0 {
		// ยังไม่ได้เลือกกิจกรรม บอกข้อมูลพนักงานไว้ก่อน หน้าจอจะเตือนให้เลือก
		web.JSON(w, http.StatusOK, web.Map{"kind": "employee", "user": user, "needEvent": true})
		return
	}

	checkInScanned(w, claims.ID, body.EventID, userID, user)
}

// scanRedemption ยืนยันรับของให้เลยแล้วคืนรายละเอียดไปแสดง
//
// เปลี่ยนสถานะทันทีเพราะผู้ดูแลสแกนตอนคนมายืนรอรับของอยู่แล้ว
// ถ้าให้กดยืนยันอีกทีคือเพิ่มขั้นตอนโดยไม่ได้ป้องกันอะไรเพิ่ม
// ส่วนการสแกนผิดแก้ได้ด้วยปุ่มยกเลิกในหน้าผล
func scanRedemption(w http.ResponseWriter, actorID int64, refCode string) {
	// เปลี่ยนเฉพาะรายการที่ยังรอรับ ถ้ารับไปแล้วปล่อยไว้แล้วไปบอกว่ารับไปแล้ว
	done, err := store.QueryOne(`
		UPDATE redemptions SET status = 'received', received_at = now()
		WHERE ref_code = $1 AND status = 'pending' RETURNING user_id`, refCode)
	if err != nil {
		web.Fail(w, err)
		return
	}

	justReceived := done != nil
	if justReceived {
		if _, err := store.Exec(`
			INSERT INTO notifications (user_id, category, title, body)
			VALUES ($1,'reward','รับของรางวัลเรียบร้อย',$2)`,
			done["user_id"], "ยืนยันการรับของรางวัลรหัส "+refCode+" แล้ว"); err != nil {
			web.Fail(w, err)
			return
		}
		logAudit(actorID, "redemption.receive", refCode, "ยืนยันด้วยการสแกน")
	}

	row, err := store.QueryOne(`
		SELECT d.id, d.ref_code, d.points_used, d.status, d.redeemed_at, d.received_at,
		       w.name AS reward_name, w.image_url,
		       u.employee_code, u.display_name, u.department
		FROM redemptions d
		JOIN rewards w ON w.id = d.reward_id
		JOIN users u ON u.id = d.user_id
		WHERE d.ref_code = $1`, refCode)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบรายการแลกของรางวัลนี้")
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"kind": "redemption", "redemption": row, "justReceived": justReceived,
	})
}

// checkInScanned เช็คอินพนักงานเข้ากิจกรรมและให้คะแนน
//
// แยกสถานะออกเป็นสามแบบแทนที่จะคืนเป็นข้อผิดพลาดก้อนเดียว
// เพราะหน้าจอต้องแสดงต่างกัน คนที่เช็คอินไปแล้วไม่ใช่ความผิดพลาด
// แค่ต้องบอกให้ผู้ดูแลรู้ว่าไม่ต้องให้คะแนนซ้ำ
func checkInScanned(w http.ResponseWriter, actorID, eventID, userID int64, user store.Row) {
	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	var title string
	var points int
	err = tx.QueryRow(`SELECT title, points FROM events WHERE id = $1`, eventID).Scan(&title, &points)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบกิจกรรมนี้")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	var status string
	err = tx.QueryRow(`SELECT status FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
		eventID, userID).Scan(&status)

	if errors.Is(err, sql.ErrNoRows) {
		web.JSON(w, http.StatusOK, web.Map{
			"kind": "checkin", "result": "not-registered",
			"user": user, "event": title,
		})
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}
	if status == "attended" {
		web.JSON(w, http.StatusOK, web.Map{
			"kind": "checkin", "result": "already",
			"user": user, "event": title,
		})
		return
	}

	if _, err := tx.Exec(`
		UPDATE event_registrations SET status = 'attended', checked_in_at = now()
		WHERE event_id = $1 AND user_id = $2`, eventID, userID); err != nil {
		web.Fail(w, err)
		return
	}

	awarded := 0
	if points > 0 {
		var tierUp string
		awarded, tierUp, err = awardPoints(tx, userID, points)
		if err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points)
			VALUES ($1,'earn','event',$2,$3)`, userID, "เข้าร่วม "+title, awarded); err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO notifications (user_id, category, title, body) VALUES ($1,'point',$2,$3)`,
			userID, fmt.Sprintf("คุณได้รับ %d คะแนน", awarded),
			fmt.Sprintf("จากการเข้าร่วมกิจกรรม %s", title)); err != nil {
			web.Fail(w, err)
			return
		}
		if err := notifyTierUp(tx, userID, tierUp); err != nil {
			web.Fail(w, err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	code, _ := user["employee_code"].(string)
	name, _ := user["display_name"].(string)
	logAudit(actorID, "event.check-in", code, name)

	web.JSON(w, http.StatusOK, web.Map{
		"kind": "checkin", "result": "ok",
		"user": user, "event": title, "points": awarded,
	})
}

// AdminRevertRedemption คืนรายการที่ยืนยันรับไปแล้วกลับเป็นรอรับ
//
// มีไว้แก้กรณีสแกนผิดคนหรือกดพลาด ถ้าไม่มีทางย้อน ผู้ดูแลต้องไปแก้ในฐานข้อมูลเอง
func AdminRevertRedemption(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสรายการไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`
		UPDATE redemptions SET status = 'pending', received_at = NULL
		WHERE id = $1 AND status = 'received' RETURNING ref_code`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusConflict, "รายการนี้ยังไม่ได้ยืนยันรับ หรือไม่มีอยู่")
		return
	}

	refCode, _ := row["ref_code"].(string)
	logAudit(claims.ID, "redemption.revert", refCode, "ยกเลิกการยืนยันรับของ")

	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}
