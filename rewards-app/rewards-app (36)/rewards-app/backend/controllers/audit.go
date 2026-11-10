package controllers

import (
	"log"

	"rewards/store"
)

// logAudit บันทึกสิ่งที่ผู้ดูแลระบบทำ ใช้แสดงในหน้า Audit Logs
// ตั้งใจให้ล้มเหลวเงียบ ๆ เพราะการบันทึกไม่ควรทำให้งานหลักพัง
func logAudit(actorID int64, action, target, detail string) {
	if _, err := store.Exec(
		`INSERT INTO audit_logs (actor_id, action, target, detail) VALUES ($1,$2,$3,$4)`,
		actorID, action, target, detail); err != nil {
		log.Printf("บันทึก audit log ไม่สำเร็จ: %v", err)
	}
}
