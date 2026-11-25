package controllers

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"math"
	"strconv"

	"rewards/config"
	"rewards/store"
)

/*
ตัวคูณคะแนนและการเลื่อนระดับอัตโนมัติ

ทุกจุดที่จ่ายคะแนนจากกิจกรรมต้องเรียก awardPoints ไม่ใช่สั่ง UPDATE เอง
เพื่อให้ตัวคูณของระดับถูกนำมาคิดและระดับถูกอัปเดตเหมือนกันทุกทาง
*/

// awardPoints คูณคะแนนตามระดับปัจจุบันของพนักงาน บวกเข้าบัญชี แล้วเลื่อนระดับให้ถ้าถึงเกณฑ์
// คืนค่าคะแนนที่ได้รับจริงหลังคูณ และระดับใหม่ถ้ามีการเลื่อน
func awardPoints(tx *sql.Tx, userID int64, base int) (awarded int, newTier string, err error) {
	if base <= 0 {
		_, err = refreshTier(tx, userID)
		return 0, "", err
	}

	// ตัวคูณมาจากระดับที่พนักงานอยู่ "ก่อน" ได้รับคะแนนรอบนี้
	var multiplier float64
	err = tx.QueryRow(`
		SELECT COALESCE(t.multiplier, 1.0)
		FROM users u LEFT JOIN tiers t ON t.key = u.tier
		WHERE u.id = $1`, userID).Scan(&multiplier)
	if err != nil {
		return 0, "", err
	}
	if multiplier <= 0 {
		multiplier = 1
	}

	awarded = int(math.Round(float64(base) * multiplier))

	if _, err = tx.Exec(`UPDATE users SET points = points + $2 WHERE id = $1`, userID, awarded); err != nil {
		return 0, "", err
	}

	newTier, err = refreshTier(tx, userID)
	return awarded, newTier, err
}

// refreshTier เลื่อนระดับให้ตรงกับคะแนนที่มี
//
// เลื่อนขึ้นอย่างเดียว ไม่ลดระดับอัตโนมัติ เพราะคะแนนจะลดลงทุกครั้งที่แลกของรางวัล
// ถ้าลดระดับตามคะแนนคงเหลือ พนักงานจะหลุดระดับทันทีที่ใช้คะแนน ซึ่งไม่ใช่สิ่งที่ควรเกิด
// การลดระดับให้ผู้ดูแลระบบทำเองจากหน้าจัดการพนักงาน
//
// คืนชื่อระดับใหม่ถ้ามีการเลื่อน ถ้าไม่เลื่อนคืนค่าว่าง
func refreshTier(tx *sql.Tx, userID int64) (string, error) {
	var points int
	var current string
	err := tx.QueryRow(`SELECT points, tier FROM users WHERE id = $1`, userID).Scan(&points, &current)
	if err != nil {
		return "", err
	}

	var currentMin int
	err = tx.QueryRow(`SELECT min_points FROM tiers WHERE key = $1`, current).Scan(&currentMin)
	if errors.Is(err, sql.ErrNoRows) {
		currentMin = -1 // ระดับปัจจุบันไม่มีในตารางแล้ว ให้ถือว่าต่ำสุด
	} else if err != nil {
		return "", err
	}

	var nextKey string
	var nextMin int
	err = tx.QueryRow(`
		SELECT key, min_points FROM tiers
		WHERE min_points <= $1 AND status = 'active'
		ORDER BY min_points DESC LIMIT 1`, points).Scan(&nextKey, &nextMin)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}

	if nextKey == current || nextMin <= currentMin {
		return "", nil
	}

	if _, err := tx.Exec(`UPDATE users SET tier = $2 WHERE id = $1`, userID, nextKey); err != nil {
		return "", err
	}
	return nextKey, nil
}

// recalcTierExact ตั้งระดับให้ตรงกับคะแนนปัจจุบันเป๊ะ ๆ ขึ้นหรือลงก็ได้
//
// ใช้เฉพาะตอนผู้ดูแลระบบปรับคะแนนด้วยมือ เพราะเป็นการแก้ไขข้อมูลโดยตั้งใจ
// ผลลัพธ์ควรสะท้อนคะแนนที่แก้ทันที ต่างจากการได้/ใช้คะแนนตามปกติที่เลื่อนขึ้นอย่างเดียว
//
// คืนชื่อระดับใหม่ถ้าเปลี่ยน และบอกว่าเป็นการเลื่อนขึ้นหรือไม่
func recalcTierExact(tx *sql.Tx, userID int64) (newTier string, upgraded bool, err error) {
	var points int
	var current string
	if err = tx.QueryRow(`SELECT points, tier FROM users WHERE id = $1`, userID).Scan(&points, &current); err != nil {
		return "", false, err
	}

	var currentMin int
	err = tx.QueryRow(`SELECT min_points FROM tiers WHERE key = $1`, current).Scan(&currentMin)
	if errors.Is(err, sql.ErrNoRows) {
		currentMin = -1
	} else if err != nil {
		return "", false, err
	}

	var key string
	var min int
	err = tx.QueryRow(`
		SELECT key, min_points FROM tiers
		WHERE min_points <= $1 AND status = 'active'
		ORDER BY min_points DESC LIMIT 1`, points).Scan(&key, &min)
	if errors.Is(err, sql.ErrNoRows) {
		// คะแนนต่ำกว่าทุกระดับ ให้ลงมาที่ระดับต่ำสุดที่เปิดใช้อยู่
		err = tx.QueryRow(`
			SELECT key, min_points FROM tiers WHERE status = 'active'
			ORDER BY min_points ASC LIMIT 1`).Scan(&key, &min)
		if errors.Is(err, sql.ErrNoRows) {
			return "", false, nil
		}
	}
	if err != nil {
		return "", false, err
	}

	if key == current {
		return "", false, nil
	}

	if _, err = tx.Exec(`UPDATE users SET tier = $2 WHERE id = $1`, userID, key); err != nil {
		return "", false, err
	}
	return key, min > currentMin, nil
}

// notifyTierDown แจ้งพนักงานเมื่อระดับถูกปรับลง
func notifyTierDown(tx *sql.Tx, userID int64, tier string) error {
	if tier == "" {
		return nil
	}
	_, err := tx.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'point',$2,$3)`,
		userID,
		"ระดับสมาชิกของคุณเปลี่ยนเป็น "+tier,
		"ระดับถูกปรับตามคะแนนคงเหลือล่าสุด")
	return err
}

// SyncTier ตรวจว่าระดับตรงกับคะแนนปัจจุบันหรือยัง ถ้ายังไม่ถึงก็เลื่อนให้
//
// เรียกตอนเข้าสู่ระบบและตอนเปิดหน้าแรก เป็นตัวกันพลาดอีกชั้น
// ปกติการได้คะแนนทุกทางเลื่อนระดับให้อยู่แล้ว แต่ถ้าคะแนนถูกแก้จากทางอื่น
// เช่น แก้ตรงในฐานข้อมูลหรือย้ายข้อมูลมาจากระบบเดิม ระดับจะตามมาให้เองที่นี่
//
// เลื่อนขึ้นอย่างเดียวเหมือนทางอื่น จึงไม่มีทางที่พนักงานจะถูกลดระดับโดยไม่ตั้งใจ
func SyncTier(userID int64) {
	tx, err := config.DB.Begin()
	if err != nil {
		log.Printf("ตรวจระดับสมาชิกไม่สำเร็จ: %v", err)
		return
	}
	defer tx.Rollback()

	tier, err := refreshTier(tx, userID)
	if err != nil {
		log.Printf("ตรวจระดับสมาชิกไม่สำเร็จ: %v", err)
		return
	}
	if tier == "" {
		return
	}

	if err := notifyTierUp(tx, userID, tier); err != nil {
		log.Printf("แจ้งเตือนเลื่อนระดับไม่สำเร็จ: %v", err)
		return
	}
	if err := tx.Commit(); err != nil {
		log.Printf("ตรวจระดับสมาชิกไม่สำเร็จ: %v", err)
	}
}

// notifyTierUp แจ้งพนักงานเมื่อได้เลื่อนระดับ
func notifyTierUp(tx *sql.Tx, userID int64, tier string) error {
	if tier == "" {
		return nil
	}
	_, err := tx.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'point',$2,$3)`,
		userID,
		"ยินดีด้วย คุณเลื่อนเป็นระดับ "+tier+" แล้ว",
		"ระดับใหม่มาพร้อมตัวคูณคะแนนและสิทธิประโยชน์ที่มากขึ้น")
	return err
}

/*
คะแนนพิเศษ — กระเป๋าที่สองที่แยกจากคะแนนปกติ

ต่างจากคะแนนปกติสามข้อ และตั้งใจให้ต่างแบบนี้
  - ไม่คูณด้วยตัวคูณของระดับสมาชิก ผู้ดูแลตั้งให้เท่าไหร่ได้เท่านั้น
    เพราะเป็นรางวัลเฉพาะกิจ ไม่ใช่ผลตอบแทนของความสม่ำเสมอ
  - ไม่นำไปคิดระดับสมาชิก จึงไม่ต้องเรียก refreshTier
  - ไม่ถูกตัดยอดตอนสิ้นปีพร้อมคะแนนปกติ

เก็บรายการเดินบัญชีไว้เหมือนกัน แต่ติดธง point_kind = 'special'
ประวัติคะแนนจึงแยกสองกระเป๋าออกจากกันได้
*/

// awardSpecialPoints บวกคะแนนพิเศษเข้าบัญชีพร้อมบันทึกรายการเดินบัญชี
//
// expireAt คือวันหมดอายุของคะแนนก้อนนี้ ส่ง nil มาได้ถ้าไม่กำหนด
// eventID คือกิจกรรมต้นทาง ส่ง nil ถ้าเป็นการปรับคะแนนด้วยมือที่ไม่ได้มาจากกิจกรรม
// เก็บไว้เพื่อให้กราฟการเคลื่อนไหวของคะแนนกรองดูเฉพาะกิจกรรมได้
//
// requestID คือคำขอปรับคะแนนที่อนุมัติแล้วซึ่งเป็นต้นทาง ส่ง nil ถ้ามาจากกิจกรรม
// เก็บไว้เพื่อให้ย้อนดูได้ว่ารายการนี้ใครขอและใครอนุมัติ
//
// วันหมดอายุเก็บไว้ที่ผู้ใช้ค่าเดียว ไม่ได้แยกรายก้อน และจะ "เลื่อนออกไป" เสมอ
// คือเก็บวันที่ไกลที่สุดไว้ เพราะพนักงานไม่ควรเสียคะแนนก้อนใหม่
// เพียงเพราะก้อนเก่าใกล้หมดอายุ
func awardSpecialPoints(tx *sql.Tx, userID int64, amount int, title string, expireAt, eventID, requestID any) error {
	if amount <= 0 {
		return nil
	}

	if _, err := tx.Exec(`
		UPDATE users SET
		  special_points = special_points + $2,
		  special_points_expire_at = CASE
		    WHEN $3::date IS NULL THEN special_points_expire_at
		    WHEN special_points_expire_at IS NULL THEN $3::date
		    ELSE GREATEST(special_points_expire_at, $3::date)
		  END
		WHERE id = $1`, userID, amount, expireAt); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		INSERT INTO point_transactions
		  (user_id, kind, source, title, points, point_kind, event_id, adjust_request_id)
		VALUES ($1,'earn','event',$2,$3,'special',$4,$5)`,
		userID, title, amount, eventID, requestID); err != nil {
		return err
	}

	_, err := tx.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'point',$2,$3)`,
		userID,
		fmt.Sprintf("คุณได้รับคะแนนพิเศษ %d คะแนน", amount),
		title)
	return err
}

/*
ExpireSpecialPoints ตัดยอดคะแนนพิเศษที่เลยวันหมดอายุแล้วให้เหลือ 0

ทำงานสองทาง
  - ตัวตั้งเวลาเรียกเป็นรอบ เพื่อให้รายงานและยอดรวมถูกต้องเสมอ
  - เรียกเฉพาะรายคนตอนพนักงานเปิดแอป เพื่อให้ยอดที่เห็นตรงกับความจริงทันที
    ไม่ต้องรอรอบถัดไป

บันทึกรายการเดินบัญชีไว้ด้วยทุกครั้ง พนักงานจึงย้อนดูได้ว่าคะแนนหายไปเพราะหมดอายุ
ไม่ใช่ระบบคำนวณผิด

userID = 0 คือตัดยอดให้ทุกคน
*/
func ExpireSpecialPoints(userID int64) (int, error) {
	filter := ""
	args := []any{}
	if userID > 0 {
		filter = " AND id = $1"
		args = append(args, userID)
	}

	/*
		ทำสามอย่างในคำสั่งเดียวเพื่อให้เป็นอะตอมมิก
		  expired  เลือกคนที่คะแนนพิเศษหมดอายุ พร้อมจำนวนก่อนถูกตัด
		  cleared  ตัดยอดเหลือ 0 และล้างวันหมดอายุทิ้ง
		  INSERT   บันทึกรายการเดินบัญชีเป็นยอดติดลบเท่ากับที่ถูกตัดไป

		ต้องอ่านจำนวนไว้ใน CTE ก่อน เพราะหลัง UPDATE ยอดจะเป็น 0 แล้ว
		อ่านทีหลังจะได้ 0 ทุกแถวและประวัติจะไม่มีความหมาย
	*/
	rows, err := config.DB.Query(`
		WITH expired AS (
		  SELECT id, special_points FROM users
		  WHERE special_points > 0
		    AND special_points_expire_at IS NOT NULL
		    AND special_points_expire_at < CURRENT_DATE`+filter+`
		),
		cleared AS (
		  UPDATE users u SET special_points = 0, special_points_expire_at = NULL
		  FROM expired e WHERE u.id = e.id
		)
		INSERT INTO point_transactions (user_id, kind, source, title, points, point_kind)
		SELECT id, 'adjust', 'system', 'คะแนนพิเศษหมดอายุ', -special_points, 'special'
		FROM expired
		RETURNING user_id`, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
	}
	return count, rows.Err()
}

/*
NotifySpecialPointsExpiring เตือนล่วงหน้าก่อนคะแนนพิเศษจะถูกตัดเหลือ 0

เดิมคะแนนพิเศษหายเงียบ ๆ ตอนพ้นวันหมดอายุ พนักงานเห็นยอดเป็น 0
แล้วเข้าใจว่าระบบคำนวณผิด ทั้งที่ยังมีเวลาเอาไปแลกของรางวัลอยู่หลายวัน

ล่วงหน้ากี่วันอ่านจากค่า expire_warn_days ในหน้าตั้งค่า (ค่าเริ่มต้น 30 วัน)
ผู้ดูแลปิดการแจ้งเตือนนี้ได้ที่แท็บ Systems Event คีย์ special_points_expiring

เตือนครั้งเดียวต่อหนึ่งวันหมดอายุ โดยจดวันที่เตือนไปแล้วไว้ที่
users.special_points_notified_for ตัวตั้งเวลาวิ่งทุกชั่วโมงจึงไม่เตือนซ้ำ
ถ้าภายหลังได้คะแนนก้อนใหม่ที่เลื่อนวันหมดอายุออกไป ค่าที่จดไว้จะไม่ตรงกับวันใหม่
รอบถัดไปจะเตือนให้อีกครั้งเองตามวันใหม่

userID = 0 คือตรวจให้ทุกคน
*/
func NotifySpecialPointsExpiring(userID int64) (int, error) {
	if !notificationEnabled("special_points_expiring") {
		return 0, nil
	}

	days, err := strconv.Atoi(setting("expire_warn_days", "30"))
	if err != nil || days < 0 {
		days = 30
	}

	args := []any{days}
	filter := ""
	if userID > 0 {
		filter = " AND id = $2"
		args = append(args, userID)
	}

	/*
		เลือก จด และส่งแจ้งเตือน ในคำสั่งเดียวเพื่อให้เป็นอะตอมมิก
		ถ้าแยกเป็นสามคำสั่งแล้วล้มกลางทาง จะได้ทั้งแบบจดว่าเตือนแล้วแต่ไม่ได้เตือน
		และแบบเตือนซ้ำเพราะยังไม่ได้จด

		วันที่เขียนเป็นแบบไทย (วัน/เดือน/ปี พ.ศ.) ให้ตรงกับที่แสดงในแอป
	*/
	rows, err := config.DB.Query(`
		WITH warn AS (
		  SELECT id, special_points, special_points_expire_at AS expire_at,
		         (special_points_expire_at - CURRENT_DATE)::int AS days_left
		  FROM users
		  WHERE status = 'Active'
		    AND special_points > 0
		    AND special_points_expire_at IS NOT NULL
		    AND special_points_expire_at >= CURRENT_DATE
		    AND special_points_expire_at <= CURRENT_DATE + $1::int
		    AND (special_points_notified_for IS NULL
		         OR special_points_notified_for <> special_points_expire_at)`+filter+`
		),
		marked AS (
		  UPDATE users u SET special_points_notified_for = w.expire_at
		  FROM warn w WHERE u.id = w.id
		)
		INSERT INTO notifications (user_id, category, title, body)
		SELECT id, 'point',
		  CASE WHEN days_left = 0
		    THEN 'วันนี้วันสุดท้ายของคะแนนพิเศษ'
		    ELSE format('คะแนนพิเศษของคุณจะหมดอายุในอีก %s วัน', days_left) END,
		  format('คะแนนพิเศษ %s คะแนนจะหมดอายุวันที่ %s %s รีบใช้แลกของรางวัลที่ใช้คะแนนพิเศษก่อนถูกตัดยอดเหลือ 0',
		         special_points,
		         to_char(expire_at, 'DD/MM/') || (extract(year from expire_at)::int + 543),
		         CASE WHEN days_left = 0 THEN '(วันนี้)' ELSE format('(อีก %s วัน)', days_left) END)
		FROM warn
		RETURNING user_id`, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
	}
	return count, rows.Err()
}

/*
withSpecialExpiry ติดธงว่าคะแนนพิเศษของคนนี้ใกล้หมดอายุแล้วหรือยัง

คิวรีที่เรียกตัวนี้ต้องเลือก special_points_days_left (วันหมดอายุลบวันนี้) มาด้วย
นับวันในฐานข้อมูลที่เดียว หน้าเว็บจึงไม่ต้องเดาเขตเวลาของเครื่องผู้ใช้
ซึ่งเคยทำให้คนที่เปิดแอปข้ามเขตเวลาเห็นจำนวนวันเพี้ยนไปหนึ่งวัน

special_points_expiring เป็นจริงเมื่อเหลือไม่เกินค่า expire_warn_days
ใช้เกณฑ์เดียวกับใบแจ้งเตือน ป้ายบนหน้าแอปกับใบแจ้งเตือนจะได้ไม่ขัดกันเอง
*/
func withSpecialExpiry(user store.Row) store.Row {
	if user == nil {
		return user
	}

	user["special_points_expiring"] = false

	points, _ := toInt64(user["special_points"])
	days, ok := toInt64(user["special_points_days_left"])
	if !ok || points <= 0 {
		return user
	}

	warn, err := strconv.Atoi(setting("expire_warn_days", "30"))
	if err != nil || warn < 0 {
		warn = 30
	}
	if days >= 0 && days <= int64(warn) {
		user["special_points_expiring"] = true
	}
	return user
}

// toInt64 อ่านตัวเลขจากค่าที่ไดรเวอร์ส่งกลับมา ซึ่งอาจเป็น int64 หรือ int แล้วแต่คอลัมน์
func toInt64(value any) (int64, bool) {
	switch v := value.(type) {
	case int64:
		return v, true
	case int32:
		return int64(v), true
	case int:
		return int64(v), true
	case float64:
		return int64(v), true
	}
	return 0, false
}

// notificationEnabled บอกว่าเทมเพลตแจ้งเตือนอัตโนมัติตัวนี้ยังเปิดใช้อยู่ไหม
//
// ถ้าไม่มีแถวนี้ในตาราง (ฐานข้อมูลเก่าที่ยังไม่ได้ต่อเติม) ถือว่าเปิด
// เพราะการเงียบไปเฉย ๆ หาสาเหตุยากกว่าการแจ้งเตือนเกินมาหนึ่งใบ
func notificationEnabled(key string) bool {
	row, err := store.QueryOne(
		`SELECT active AND in_app AS on FROM notification_events WHERE key = $1`, key)
	if err != nil || row == nil {
		return true
	}
	on, ok := row["on"].(bool)
	return !ok || on
}
