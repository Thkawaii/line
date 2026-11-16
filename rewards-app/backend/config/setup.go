package config

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"

	"rewards/db"
)

/*
ตั้งฐานข้อมูลให้เองตอนเปิดเซิร์ฟเวอร์ จะได้สั่ง go run . ทีเดียวจบ

ลำดับที่ทำ
  1. ไม่มีฐานข้อมูล -> สร้างให้
  2. ไม่มีตาราง     -> รัน schema.sql
  3. มีตารางแล้ว    -> ไม่แตะอะไรเลย

ข้อสำคัญ: schema.sql ลบตารางเก่าทิ้งก่อนสร้างใหม่ จึงรันเฉพาะตอนที่ยังไม่มีตาราง
ถ้ามีตารางอยู่แล้วจะข้ามไปทั้งหมด ข้อมูลที่ใช้งานอยู่จึงไม่มีทางถูกลบจากการเปิดเซิร์ฟเวอร์
ถ้าต้องการล้างแล้วสร้างใหม่จริง ๆ ให้สั่ง go run ./cmd/migrate เอง
*/

// SetupResult บอกว่าตอนเปิดเซิร์ฟเวอร์ได้ทำอะไรไปบ้าง
type SetupResult struct {
	CreatedDatabase bool
	CreatedTables   bool
	Migrations      []string // ไฟล์ต่อเติมที่เพิ่งรันไปรอบนี้
}

// AutoSetup เตรียมฐานข้อมูลให้พร้อมใช้ และคืนว่าได้สร้างอะไรใหม่หรือไม่
func AutoSetup() (SetupResult, error) {
	var result SetupResult

	created, err := EnsureDatabase()
	if err != nil {
		return result, err
	}
	result.CreatedDatabase = created

	if err := Connect(); err != nil {
		return result, err
	}

	ready, err := tablesExist()
	if err != nil {
		return result, err
	}

	if !ready {
		if _, err := DB.Exec(db.Schema()); err != nil {
			return result, err
		}
		result.CreatedTables = true
	}

	// ต่อเติมโครงตารางให้ทันรุ่นปัจจุบันเสมอ ทั้งฐานข้อมูลใหม่และฐานข้อมูลที่ใช้งานอยู่แล้ว
	// ไฟล์ในโฟลเดอร์ migrations เพิ่มของใหม่อย่างเดียว ไม่แตะข้อมูลเดิม
	applied, err := RunMigrations()
	if err != nil {
		return result, err
	}
	result.Migrations = applied

	return result, nil
}

// tablesExist เช็กจากตาราง users ตัวเดียวพอ เพราะ schema.sql สร้างทุกตารางพร้อมกัน
func tablesExist() (bool, error) {
	var ok bool
	err := DB.QueryRow(`SELECT to_regclass('public.users') IS NOT NULL`).Scan(&ok)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return ok, err
}

// Schema คืนโครงตารางฉบับเต็มที่ฝังมากับโปรแกรม
// ใช้ตัวนี้แทนการอ่านไฟล์ จะได้ไม่ขึ้นกับว่าสั่งรันจากโฟลเดอร์ไหน
func Schema() string {
	return db.Schema()
}

// SchemaPath หาไฟล์ schema.sql ให้เจอไม่ว่าจะสั่งจากโฟลเดอร์ backend หรือจาก root ของโปรเจค
// เหลือไว้ให้เครื่องมือที่อยากอ้างถึงไฟล์จริงบนดิสก์ เช่นตอนไล่ปัญหา
func SchemaPath() string {
	for _, candidate := range []string{"db/schema.sql", "backend/db/schema.sql", "../db/schema.sql"} {
		if _, err := os.Stat(candidate); err == nil {
			abs, _ := filepath.Abs(candidate)
			return abs
		}
	}
	return "db/schema.sql"
}
