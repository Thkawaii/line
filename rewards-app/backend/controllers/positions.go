package controllers

import (
	"net/http"

	"github.com/lib/pq"

	"rewards/org"
	"rewards/security"
	"rewards/store"
	"rewards/web"
)

/*
ตำแหน่งงานและแผนก — ส่วนที่คุยกับฐานข้อมูลและหน้าเว็บ

ตัวรายการและกติกาสิทธิ์อยู่ในแพ็กเกจ rewards/org เพราะ middleware ต้องใช้ด้วย
*/

/*
CanRunAnnualReset บอกว่าผู้ใช้คนนี้สั่งตัดยอดคะแนนประจำปีได้หรือไม่

กติกา
  - role admin ทำได้เสมอ ไม่ดูแผนกหรือตำแหน่ง
  - คนอื่นต้องอยู่ในแผนกหลังบ้าน และมีตำแหน่งอยู่ในรายการที่กำหนด

เป็นกติกาเดิมของการปรับคะแนนก่อนที่การปรับคะแนนจะย้ายไปใช้ระบบขออนุมัติ
ตั้งใจไม่ย้ายตามไปด้วย เพราะการตัดยอดกระทบทุกคนพร้อมกันและย้อนกลับไม่ได้
ถ้าเปิดให้ทุกตำแหน่งยื่นแบบเดียวกับการปรับคะแนนรายคน จะกว้างเกินกว่าเดิม

อ่านแผนกกับตำแหน่งจากฐานข้อมูลทุกครั้งแทนที่จะฝังไว้ใน token
เพราะถ้าผู้ดูแลย้ายแผนกหรือลดตำแหน่งใคร สิทธิ์ต้องหายทันที
ไม่ใช่รอจนกว่า token เดิมจะหมดอายุอีกเจ็ดวัน
*/
func CanRunAnnualReset(claims *security.Claims) bool {
	if claims == nil {
		return false
	}
	if claims.Role == "admin" {
		return true
	}

	row, err := store.QueryOne(
		`SELECT department, position FROM users WHERE id = $1`, claims.ID)
	if err != nil || row == nil {
		return false
	}

	department, _ := row["department"].(string)
	position, _ := row["position"].(string)
	return org.CanAdjustPoints(department, position)
}

// AdminOrgOptions ส่งรายการตำแหน่งและแผนกให้หน้าเว็บ
//
// หน้าเว็บมีสำเนาไว้ใช้ตอนออฟไลน์อยู่แล้ว แต่ดึงจากที่นี่ก่อนเสมอ
// จะได้เพิ่มตำแหน่งใหม่ที่เซิร์ฟเวอร์แล้วทุกเครื่องเห็นพร้อมกันโดยไม่ต้อง build ใหม่
//
// ส่งค่าที่เคยกรอกเองไว้ (ที่ไม่อยู่ในรายการมาตรฐาน) มาด้วย
// ผู้ดูแลจะได้เลือกซ้ำได้โดยไม่ต้องพิมพ์ใหม่ทุกครั้ง
func AdminOrgOptions(w http.ResponseWriter, r *http.Request) {
	extraPositions, _ := store.Query(`
		SELECT DISTINCT position AS value FROM users
		WHERE TRIM(position) <> '' AND position <> ALL($1)
		ORDER BY 1`, pq.Array(org.Positions))

	extraSections, _ := store.Query(`
		SELECT DISTINCT department AS value FROM users
		WHERE TRIM(department) <> '' AND department <> ALL($1)
		ORDER BY 1`, pq.Array(org.AllSections))

	web.JSON(w, http.StatusOK, web.Map{
		"positions":      org.Positions,
		"sections":       org.AllSections,
		"branches":       org.Branches,
		"adminSections":  org.AdminSections,
		"extraPositions": values(extraPositions),
		"extraSections":  values(extraSections),
		// ตัดยอดประจำปี ยังใช้กติกาเดิมคือแผนกหลังบ้าน + ตำแหน่งในรายการ
		"canAdjustPoints": web.Map{
			"sections":  org.BackOfficeSections,
			"positions": org.AdjustPointsPositions,
		},
		// ปรับคะแนนรายคน ยื่นได้ทุกตำแหน่งในสามแผนก แต่ต้องอนุมัติสองฝั่ง
		"pointRequest": web.Map{
			"sections":            org.PointRequestSections,
			"approverSections":    append(append([]string{}, org.GASections...), org.HRSections...),
			"minApproverPosition": org.MinApproverPosition,
		},
	})
}

func values(rows []store.Row) []string {
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		if value, _ := row["value"].(string); value != "" {
			out = append(out, value)
		}
	}
	return out
}
