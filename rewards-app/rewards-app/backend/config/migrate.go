package config

import (
	"fmt"

	"rewards/db"
)

/*
ต่อเติมโครงตารางของฐานข้อมูลที่ใช้งานอยู่

ต่างจาก schema.sql ตรงที่ไฟล์ใน db/migrations ห้ามลบข้อมูล
ทุกไฟล์เขียนแบบรันซ้ำได้ แต่ก็ยังจดไว้ว่ารันไปแล้วเพื่อไม่ให้เสียเวลาเปล่าทุกครั้งที่เปิดเซิร์ฟเวอร์

เรียกอัตโนมัติตอนเปิดเซิร์ฟเวอร์ จึงอัปเกรดระบบได้ด้วยการ deploy ทับอย่างเดียว
ไม่ต้องเข้าไปสั่ง SQL เองที่เครื่อง server
*/

// RunMigrations รันไฟล์ต่อเติมที่ยังไม่เคยรัน คืนชื่อไฟล์ที่เพิ่งรันไป
func RunMigrations() ([]string, error) {
	if _, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
		  name       VARCHAR(160) PRIMARY KEY,
		  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)`); err != nil {
		return nil, fmt.Errorf("สร้างตาราง schema_migrations ไม่สำเร็จ: %w", err)
	}

	applied := map[string]bool{}
	rows, err := DB.Query(`SELECT name FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			applied[name] = true
		}
	}
	rows.Close()

	var done []string
	for _, migration := range db.Migrations() {
		if applied[migration.Name] {
			continue
		}

		// รันทั้งไฟล์ในทรานแซกชันเดียว ล้มกลางทางแล้วไม่ทิ้งของค้าง
		tx, err := DB.Begin()
		if err != nil {
			return done, err
		}
		if _, err := tx.Exec(migration.SQL); err != nil {
			tx.Rollback()
			return done, fmt.Errorf("รัน %s ไม่สำเร็จ: %w", migration.Name, err)
		}
		if _, err := tx.Exec(
			`INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
			migration.Name); err != nil {
			tx.Rollback()
			return done, err
		}
		if err := tx.Commit(); err != nil {
			return done, err
		}

		done = append(done, migration.Name)
	}

	return done, nil
}
