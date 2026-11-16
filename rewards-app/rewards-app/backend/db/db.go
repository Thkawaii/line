// Package db เก็บไฟล์ SQL ของระบบไว้ในตัวโปรแกรม
//
// ฝังไฟล์ไว้ด้วย embed แทนการอ่านจากดิสก์ตอนรัน เพราะ
//   - สั่ง go run จากโฟลเดอร์ไหนก็หาไฟล์เจอเสมอ
//   - ไฟล์ไบนารีที่ build แล้วเอาไปวางเครื่องอื่นได้เลย ไม่ต้องก๊อปโฟลเดอร์ db ตามไปด้วย
//
// schema.sql  คือโครงตารางฉบับเต็ม ใช้ตอนฐานข้อมูลยังว่าง (ลบของเดิมทิ้งก่อนเสมอ)
// migrations/ คือส่วนต่อเติมสำหรับฐานข้อมูลที่มีข้อมูลใช้งานอยู่แล้ว
//
//	ทุกไฟล์ต้องเขียนแบบ "รันซ้ำได้" (IF NOT EXISTS / ON CONFLICT DO NOTHING)
//	และห้ามลบหรือเขียนทับข้อมูลเดิมเด็ดขาด
package db

import (
	"embed"
	"io/fs"
	"sort"
)

//go:embed schema.sql
var schemaFile []byte

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Schema คืนเนื้อหา schema.sql
func Schema() string {
	return string(schemaFile)
}

// Migration คือไฟล์ต่อเติมหนึ่งไฟล์ Name ใช้เป็นกุญแจว่าเคยรันไปแล้วหรือยัง
type Migration struct {
	Name string
	SQL  string
}

// Migrations คืนไฟล์ต่อเติมทั้งหมด เรียงตามชื่อไฟล์ (จึงต้องตั้งชื่อขึ้นต้นด้วยเลขลำดับ)
func Migrations() []Migration {
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return nil
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	out := make([]Migration, 0, len(names))
	for _, name := range names {
		content, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			continue
		}
		out = append(out, Migration{Name: name, SQL: string(content)})
	}
	return out
}
