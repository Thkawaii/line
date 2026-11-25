package controllers

import (
	"database/sql"
	"fmt"
	"net/http"

	"github.com/lib/pq"

	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
แจ้งพนักงานเมื่อคะแนนของตัวเองถูกปรับ

เดิมคะแนนที่ถูกปรับด้วยมือเปลี่ยนไปเงียบ ๆ พนักงานรู้ตัวอีกทีตอนเปิดดูยอด
แล้วไม่รู้ว่าทำไมถึงเปลี่ยน ใครทำ และด้วยเหตุผลอะไร
คนที่เจอคะแนนหายไปโดยไม่มีคำอธิบายจะเข้าใจว่าระบบคำนวณผิด

ส่งสองทางพร้อมกัน คนละจังหวะกัน
	ใบแจ้งเตือนในกระดิ่ง  อยู่ถาวร ย้อนดูได้ทีหลัง
	ป็อปอัปหน้าแอป       เห็นแน่ ๆ ครั้งเดียวตอนเปิดแอปครั้งถัดไป

ป็อปอัปใช้ alerted_at เป็นตัวจำว่าเห็นแล้วหรือยัง เก็บที่ฐานข้อมูลไม่ใช่ที่เครื่อง
เพราะพนักงานเปลี่ยนเครื่องหรือล้างแคชแล้วต้องไม่โดนเด้งซ้ำเรื่องเดิม
*/

// notifyPointAdjusted ลงใบแจ้งเตือนให้เจ้าของคะแนน เรียกจากในธุรกรรมเดียวกับที่ปรับคะแนน
//
// ป็อปอัปไม่ได้อ่านจากใบแจ้งเตือนนี้ แต่อ่านจากรายการเดินคะแนนที่ยังไม่ได้กดรับทราบ
// แยกกันเพราะใบแจ้งเตือนมีไว้ย้อนดู ส่วนป็อปอัปมีไว้ให้เห็นครั้งเดียว
func notifyPointAdjusted(tx *sql.Tx, userID int64, points int, special bool,
	title string, requestID int64) error {

	if !notificationEnabled("point_adjusted") {
		return nil
	}

	unit := "คะแนน"
	if special {
		unit = "คะแนนพิเศษ"
	}

	headline := "คะแนนของคุณถูกปรับเพิ่ม"
	if points < 0 {
		headline = "คะแนนของคุณถูกปรับลด"
	}

	body := fmt.Sprintf("%s %s จากรายการ %s", signed(points), unit, title)

	_, err := tx.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'point',$2,$3)`, userID, headline, body)
	return err
}

// signed เติมเครื่องหมายบวกให้จำนวนที่เป็นบวก ส่วนจำนวนติดลบมีเครื่องหมายอยู่แล้ว
func signed(points int) string {
	if points > 0 {
		return fmt.Sprintf("+%d", points)
	}
	return fmt.Sprintf("%d", points)
}

/*
PointAlerts คืนรายการปรับคะแนนที่พนักงานยังไม่ได้กดรับทราบ

เอาเฉพาะที่มาจากคำขอที่อนุมัติแล้ว เพราะเป็นรายการที่มีคนตัดสินใจอยู่เบื้องหลัง
และมีเหตุผลกับรายชื่อผู้อนุมัติให้แสดงได้ ส่วนคะแนนจากกิจกรรมพนักงานรู้ตัวอยู่แล้วว่าไปร่วมงานมา

จำกัดไว้ 3 ใบต่อครั้ง คนที่ถูกปรับหลายรอบรวดจะได้ไม่ต้องกดปิดป็อปอัปสิบรอบ
ที่เหลือยังอยู่ในกระดิ่งและในประวัติคะแนนครบ
*/
func PointAlerts(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	rows, err := store.Query(`
		SELECT t.id, t.points, t.title, t.point_kind, t.created_at,
		       q.reason,
		       COALESCE((
		         SELECT json_agg(json_build_object(
		                  'group', v.approver_group,
		                  'name',  w.display_name,
		                  'position', w.position)
		                ORDER BY v.created_at)
		         FROM point_adjustment_approvals v
		         JOIN users w ON w.id = v.approver_id
		         WHERE v.request_id = q.id AND v.decision = 'approve'), '[]'::json) AS approvers
		FROM point_transactions t
		JOIN point_adjustment_requests q ON q.id = t.adjust_request_id
		WHERE t.user_id = $1 AND t.alerted_at IS NULL
		ORDER BY t.created_at
		LIMIT 3`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"alerts": decodeJSONColumn(rows, "approvers")})
}

/*
AckPointAlerts บันทึกว่าพนักงานกดรับทราบป็อปอัปแล้ว

จำกัดด้วย user_id เสมอ ไม่ให้ใครส่งรหัสรายการของคนอื่นมาปิดแทนได้
ปิดซ้ำไม่เป็นไร เพราะเงื่อนไข alerted_at IS NULL ทำให้ครั้งที่สองไม่เปลี่ยนอะไร
*/
func AckPointAlerts(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		IDs []int64 `json:"ids"`
	}
	if err := web.Decode(r, &body); err != nil || len(body.IDs) == 0 {
		web.Error(w, http.StatusBadRequest, "ไม่มีรายการให้บันทึก")
		return
	}

	if _, err := store.Exec(`
		UPDATE point_transactions SET alerted_at = now()
		WHERE user_id = $1 AND alerted_at IS NULL AND id = ANY($2)`,
		claims.ID, pq.Array(body.IDs)); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}
