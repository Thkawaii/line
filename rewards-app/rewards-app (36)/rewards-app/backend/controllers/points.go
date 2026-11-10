package controllers

import (
	"database/sql"
	"errors"
	"log"
	"math"

	"rewards/config"
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
