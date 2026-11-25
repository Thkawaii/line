package controllers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/lib/pq"

	"rewards/config"
	"rewards/middleware"
	"rewards/org"
	"rewards/security"
	"rewards/store"
	"rewards/web"
)

/*
ปรับคะแนนด้วยมือ — ต้องผ่านการอนุมัติสองฝั่ง

เดิมคนที่มีตำแหน่งถึงเกณฑ์กดปรับคะแนนได้เองทันที คะแนนเปลี่ยนโดยไม่มีใครเห็นก่อน
ตอนนี้แยกเป็นสองขั้น

	ยื่นคำขอ   ER GA HR ยื่นได้ทุกตำแหน่ง คะแนนยังไม่ขยับ
	อนุมัติ    ต้องครบสองคน ตำแหน่ง Chief Officer ขึ้นไป จากฝั่ง GA หนึ่ง HR หนึ่ง

ครบสองฝั่งเมื่อไหร่ ระบบลงคะแนนให้ทันทีในคำสั่งเดียวกับที่บันทึกการอนุมัติ
ไม่ต้องมีใครมากดยืนยันซ้ำ และไม่มีช่วงที่คำขอ "อนุมัติครบแล้วแต่คะแนนยังไม่เข้า"

ทำไมต้องสองฝั่ง ไม่ใช่สองคนเฉย ๆ
สองคนจากแผนกเดียวกันที่นั่งโต๊ะติดกันเซ็นให้กันเองได้ง่ายเกินไป
การบังคับให้มาจากคนละฝั่งทำให้คำขอต้องผ่านสายตาของคนที่ไม่ได้อยู่ในวงเดียวกันจริง ๆ
*/

// approverInfo คือสิ่งที่ต้องรู้เกี่ยวกับคนที่กำลังยื่นหรืออนุมัติ
type approverInfo struct {
	Department string
	Position   string
	Name       string
	Role       string
}

// whoIs อ่านแผนกและตำแหน่งจากฐานข้อมูลทุกครั้ง ไม่อ่านจาก token
//
// ถ้าผู้ดูแลย้ายแผนกหรือลดตำแหน่งใคร สิทธิ์ต้องหายทันที
// ไม่ใช่รอจนกว่า token เดิมจะหมดอายุอีกเจ็ดวัน
func whoIs(claims *security.Claims) (approverInfo, bool) {
	if claims == nil {
		return approverInfo{}, false
	}
	row, err := store.QueryOne(
		`SELECT department, position, display_name, role FROM users WHERE id = $1`, claims.ID)
	if err != nil || row == nil {
		return approverInfo{}, false
	}
	info := approverInfo{}
	info.Department, _ = row["department"].(string)
	info.Position, _ = row["position"].(string)
	info.Name, _ = row["display_name"].(string)
	info.Role, _ = row["role"].(string)
	return info, true
}

/*
CanRequestPointAdjust บอกว่าผู้ใช้คนนี้ยื่นขอปรับคะแนนได้หรือไม่

role admin ยื่นได้เสมอ แต่ "ยื่นได้" ไม่เท่ากับ "ปรับได้"
คำขอของผู้ดูแลระบบก็ยังต้องรออนุมัติสองฝั่งเหมือนคนอื่น
ถ้าปล่อยให้ข้ามได้ กติกาสองคนก็ไม่เหลือความหมาย เพราะเลี่ยงได้ด้วยการใช้บัญชีผู้ดูแล
*/
func CanRequestPointAdjust(claims *security.Claims) bool {
	info, ok := whoIs(claims)
	if !ok {
		return false
	}
	return info.Role == "admin" || org.CanRequestPointAdjust(info.Department)
}

// CanApprovePointAdjust คืนฝั่งที่ผู้ใช้คนนี้อนุมัติได้ และบอกว่าอนุมัติได้หรือไม่
//
// ไม่มีทางลัดให้ role admin เพราะกติกาบอกไว้ชัดว่าต้องเป็น GA หนึ่งคนและ HR หนึ่งคน
// บัญชีผู้ดูแลระบบที่ไม่ได้อยู่สองแผนกนี้จึงอนุมัติไม่ได้ ตั้งใจให้เป็นแบบนั้น
func CanApprovePointAdjust(claims *security.Claims) (string, bool) {
	info, ok := whoIs(claims)
	if !ok {
		return "", false
	}
	return org.CanApprovePointAdjust(info.Department, info.Position)
}

/* ---------- ยื่นคำขอ ---------- */

// AdminAdjustPoints รับคำขอปรับคะแนน คะแนนยังไม่เปลี่ยนจนกว่าจะอนุมัติครบ
func AdminAdjustPoints(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	if !CanRequestPointAdjust(claims) {
		web.Error(w, http.StatusForbidden,
			"บัญชีนี้ยื่นขอปรับคะแนนไม่ได้ — ต้องอยู่แผนก ER, GA หรือ HR")
		return
	}

	var body struct {
		UserID    int64   `json:"userId"`
		Points    int     `json:"points"`
		Title     string  `json:"title"`
		PointKind string  `json:"pointKind"`
		ExpireAt  *string `json:"expireAt"` // ใช้กับคะแนนพิเศษเท่านั้น
		Reason    string  `json:"reason"`
	}
	if err := web.Decode(r, &body); err != nil || body.UserID == 0 || body.Points == 0 {
		web.Error(w, http.StatusBadRequest, "ระบุพนักงานและจำนวนคะแนน")
		return
	}

	kind := "point"
	if body.PointKind == "special" {
		kind = "special"
	}

	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = "ปรับคะแนนโดยผู้ดูแลระบบ"
	}

	/*
		เหตุผลเป็นช่องบังคับ ไม่ใช่ช่องเสริม

		คนอนุมัติไม่ได้อยู่ในเหตุการณ์ด้วย ถ้าเห็นแต่ตัวเลขกับชื่อพนักงาน
		ก็ตัดสินใจไม่ได้จริง เหลือแค่กดผ่านไปตามน้ำ ซึ่งเท่ากับไม่มีขั้นอนุมัติ
	*/
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		web.Error(w, http.StatusBadRequest, "ระบุเหตุผลที่ขอปรับคะแนน เพื่อให้ผู้อนุมัติใช้ตัดสินใจได้")
		return
	}

	target, err := store.QueryOne(`SELECT display_name FROM users WHERE id = $1`, body.UserID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if target == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบพนักงานคนนี้")
		return
	}

	request, err := store.QueryOne(`
		INSERT INTO point_adjustment_requests
		  (user_id, requested_by, points, point_kind, title, expire_at, reason)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id`,
		body.UserID, claims.ID, body.Points, kind, title, nullDate(body.ExpireAt), reason)
	if err != nil {
		web.Fail(w, err)
		return
	}

	id, _ := request["id"].(int64)
	notifyApprovers(id, body.Points, kind, target["display_name"])

	unit := "คะแนน"
	if kind == "special" {
		unit = "คะแนนพิเศษ"
	}
	logAudit(claims.ID, "points.adjust-request", fmt.Sprintf("user #%d", body.UserID),
		fmt.Sprintf("%d %s · รออนุมัติ", body.Points, unit))

	web.JSON(w, http.StatusOK, web.Map{"ok": true, "requestId": id, "status": "pending"})
}

/*
notifyApprovers แจ้งคนที่อนุมัติคำขอใบนี้ได้

ส่งหาทุกคนที่เข้าเกณฑ์ ไม่เจาะจงคนใดคนหนึ่ง เพราะไม่มีใครรู้ว่าวันนั้นใครอยู่
ใครว่างก่อนก็กดก่อน พอครบสองฝั่งคำขอก็ปิดเอง

ส่งไม่สำเร็จไม่ถือว่าคำขอล้ม คำขอยังอยู่ในหน้ารายการให้เห็นอยู่ดี
*/
func notifyApprovers(requestID int64, points int, kind string, targetName any) {
	if !notificationEnabled("point_adjust_requested") {
		return
	}

	unit := "คะแนน"
	if kind == "special" {
		unit = "คะแนนพิเศษ"
	}
	name, _ := targetName.(string)

	body := fmt.Sprintf("คำขอปรับ %d %s ให้ %s รอการอนุมัติจากฝั่ง GA และ HR",
		points, unit, name)

	if _, err := store.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		SELECT u.id, 'point', 'มีคำขอปรับคะแนนรออนุมัติ', $1
		FROM users u
		WHERE u.status = 'Active'
		  AND (u.department = ANY($2) OR u.department = ANY($3))
		  AND u.position = ANY($4)`,
		body, pq.Array(org.GASections), pq.Array(org.HRSections),
		pq.Array(approverPositions())); err != nil {
		log.Printf("แจ้งเตือนผู้อนุมัติคำขอปรับคะแนน #%d ไม่สำเร็จ: %v", requestID, err)
	}
}

// approverPositions คือรายชื่อตำแหน่งตั้งแต่ Chief Officer ขึ้นไป
//
// คลี่ออกมาเป็นรายชื่อเพื่อส่งให้ SQL เทียบได้ตรง ๆ
// ฝั่ง Go ยังใช้ org.IsApproverPosition เป็นตัวตัดสินจริงอยู่
func approverPositions() []string {
	out := []string{}
	for _, position := range org.Positions {
		if org.IsApproverPosition(position) {
			out = append(out, position)
		}
	}
	return out
}

/* ---------- รายการคำขอ ---------- */

// AdminPointRequests ส่งรายการคำขอพร้อมสถานะการอนุมัติของแต่ละใบ
func AdminPointRequests(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)
	status := web.Param(r, "status", "pending")
	if status != "pending" && status != "approved" && status != "rejected" &&
		status != "cancelled" && status != "all" {
		status = "pending"
	}

	rows, err := store.Query(`
		SELECT q.id, q.points, q.point_kind, q.title, q.reason, q.status,
		       q.expire_at, q.created_at, q.decided_at,
		       t.display_name AS target_name, t.employee_code AS target_code,
		       t.department   AS target_department,
		       q.requested_by AS requested_by_id,
		       a.display_name AS requested_by_name, a.department AS requested_by_department,
		       /*
		          สรุปว่าแต่ละฝั่งลงชื่อไปหรือยัง หน้าจอจะได้บอกได้ว่ายังขาดใคร
		          ไม่ใช่บอกแค่ "รออนุมัติ" ลอย ๆ แล้วให้ไปไล่เดาเอง
		       */
		       EXISTS (SELECT 1 FROM point_adjustment_approvals v
		               WHERE v.request_id = q.id AND v.decision = 'approve'
		                 AND v.approver_group = 'GA') AS approved_ga,
		       EXISTS (SELECT 1 FROM point_adjustment_approvals v
		               WHERE v.request_id = q.id AND v.decision = 'approve'
		                 AND v.approver_group = 'HR') AS approved_hr,
		       EXISTS (SELECT 1 FROM point_adjustment_approvals v
		               WHERE v.request_id = q.id AND v.approver_id = $2) AS mine,
		       COALESCE((
		         SELECT json_agg(json_build_object(
		                  'group', v.approver_group,
		                  'decision', v.decision,
		                  'note', v.note,
		                  'name', w.display_name,
		                  'position', w.position,
		                  'at', v.created_at)
		                ORDER BY v.created_at)
		         FROM point_adjustment_approvals v
		         JOIN users w ON w.id = v.approver_id
		         WHERE v.request_id = q.id), '[]'::json) AS decisions
		FROM point_adjustment_requests q
		JOIN users t ON t.id = q.user_id
		JOIN users a ON a.id = q.requested_by
		WHERE ($1 = 'all' OR q.status = $1)
		ORDER BY q.created_at DESC
		LIMIT 200`, status, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	group, canApprove := CanApprovePointAdjust(claims)

	/*
		ส่งจำนวนของทุกสถานะมาเสมอ ไม่ใช่เฉพาะสถานะที่เลือกอยู่

		พออนุมัติครบ คำขอจะย้ายจาก "รออนุมัติ" ไป "อนุมัติแล้ว"
		แล้วหายจากรายการที่เปิดอยู่ ซึ่งถูกต้อง
		แต่ถ้าไม่มีตัวเลขบอก คนกดจะนึกว่าข้อมูลหายไปเลย
		เลขบนชิปทำให้เห็นว่ามันย้ายไปอยู่ไหน ไม่ได้หายไปไหน
	*/
	counts := requestCounts()

	web.JSON(w, http.StatusOK, web.Map{
		"requests":   decodeJSONColumn(rows, "decisions"),
		"canRequest": CanRequestPointAdjust(claims),
		"canApprove": canApprove,
		"myGroup":    group,
		"counts":     counts,
		"pending":    counts["pending"],
	})
}

/*
decodeJSONColumn แปลงคอลัมน์ JSON จากข้อความให้เป็นโครงสร้างจริงก่อนส่งออก

ตัวอ่านผลลัพธ์กลางแปลง []byte เป็น string เสมอ คอลัมน์ที่เป็น json จึงออกไป
เป็นข้อความก้อนหนึ่ง พอ JSON.stringify อีกชั้นตอนส่ง หน้าเว็บจะได้สตริง
ไม่ใช่อาร์เรย์ แล้วพังตอนเรียก .map() — ซึ่งเกิดขึ้นมาแล้วจริง

ไม่แก้ที่ตัวอ่านผลลัพธ์กลาง เพราะคอลัมน์ translations ที่ใช้อยู่หลายที่
ตั้งใจรับเป็นข้อความแล้วไปแกะเอง การเปลี่ยนตรงนั้นจะพังเป็นวงกว้างโดยไม่จำเป็น

แปลงไม่สำเร็จก็ใส่อาร์เรย์ว่างแทน หน้าเว็บจะได้ไม่พังทั้งหน้าเพราะข้อมูลเสริมก้อนเดียว
*/
func decodeJSONColumn(rows []store.Row, column string) []store.Row {
	for _, row := range rows {
		text, ok := row[column].(string)
		if !ok {
			continue
		}

		var parsed any
		if err := json.Unmarshal([]byte(text), &parsed); err != nil {
			row[column] = []any{}
			continue
		}
		row[column] = parsed
	}
	return rows
}

// requestCounts นับคำขอแยกตามสถานะในคำสั่งเดียว
func requestCounts() store.Row {
	row, err := store.QueryOne(`
		SELECT count(*) FILTER (WHERE status = 'pending')::int   AS pending,
		       count(*) FILTER (WHERE status = 'approved')::int  AS approved,
		       count(*) FILTER (WHERE status = 'rejected')::int  AS rejected,
		       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
		       count(*)::int AS all
		FROM point_adjustment_requests`)
	if err != nil || row == nil {
		return store.Row{}
	}
	return row
}

/* ---------- อนุมัติและปฏิเสธ ---------- */

// AdminDecidePointRequest บันทึกการอนุมัติหรือปฏิเสธคำขอหนึ่งใบ
func AdminDecidePointRequest(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสคำขอไม่ถูกต้อง")
		return
	}

	group, mayApprove := CanApprovePointAdjust(claims)
	if !mayApprove {
		web.Error(w, http.StatusForbidden,
			"บัญชีนี้อนุมัติคำขอปรับคะแนนไม่ได้ — ต้องอยู่แผนก GA หรือ HR และมีตำแหน่งตั้งแต่ "+
				org.MinApproverPosition+" ขึ้นไป")
		return
	}

	var body struct {
		Decision string `json:"decision"` // approve | reject
		Note     string `json:"note"`
	}
	_ = web.Decode(r, &body)
	if body.Decision != "approve" && body.Decision != "reject" {
		web.Error(w, http.StatusBadRequest, "ระบุว่าอนุมัติหรือปฏิเสธ")
		return
	}

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	/*
		ล็อกแถวคำขอไว้ก่อน

		ผู้อนุมัติสองฝั่งมักกดไล่เลี่ยกัน ถ้าไม่ล็อก ทั้งสองคำสั่งจะอ่านเห็น
		"ยังขาดอีกฝั่ง" พร้อมกัน แล้วต่างคนต่างไม่ลงคะแนนให้ หรือแย่กว่านั้นคือ
		ลงให้คนละครั้งจนคะแนนเข้าสองเท่า
	*/
	var requester, targetID int64
	var points int
	var kind, title, status string
	var expireAt sql.NullString
	err = tx.QueryRow(`
		SELECT requested_by, user_id, points, point_kind, title, status,
		       to_char(expire_at, 'YYYY-MM-DD')
		FROM point_adjustment_requests WHERE id = $1 FOR UPDATE`, id).
		Scan(&requester, &targetID, &points, &kind, &title, &status, &expireAt)
	if err == sql.ErrNoRows {
		web.Error(w, http.StatusNotFound, "ไม่พบคำขอนี้")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}
	if status != "pending" {
		web.Error(w, http.StatusConflict, "คำขอนี้ถูกตัดสินไปแล้ว")
		return
	}

	/*
		คนยื่นอนุมัติคำขอของตัวเองไม่ได้

		ถ้าทำได้ คนที่อยู่ฝั่ง GA และมีตำแหน่งถึงเกณฑ์จะเหลือแค่หาคนฝั่ง HR มาอีกคนเดียว
		กติกา "สองคน" ก็เหลือครึ่งเดียวทันที
	*/
	if requester == claims.ID {
		web.Error(w, http.StatusForbidden, "ยื่นคำขอเองแล้วอนุมัติเองไม่ได้")
		return
	}

	if _, err := tx.Exec(`
		INSERT INTO point_adjustment_approvals
		  (request_id, approver_id, approver_group, decision, note)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (request_id, approver_id) DO NOTHING`,
		id, claims.ID, group, body.Decision, strings.TrimSpace(body.Note)); err != nil {
		web.Fail(w, err)
		return
	}

	// ปฏิเสธคนเดียวพอ ไม่ต้องรอให้ครบสองฝั่ง
	// คำขอที่ฝั่งหนึ่งไม่เห็นด้วยแล้ว ไม่มีเหตุผลให้ค้างรออีกฝั่งต่อ
	if body.Decision == "reject" {
		if _, err := tx.Exec(`
			UPDATE point_adjustment_requests
			SET status = 'rejected', decided_at = now() WHERE id = $1`, id); err != nil {
			web.Fail(w, err)
			return
		}
		if err := notifyRequester(tx, requester, id, false, points, kind); err != nil {
			web.Fail(w, err)
			return
		}
		if err := tx.Commit(); err != nil {
			web.Fail(w, err)
			return
		}
		logAudit(claims.ID, "points.adjust-reject", fmt.Sprintf("request #%d", id), group)
		web.JSON(w, http.StatusOK, web.Map{"ok": true, "status": "rejected"})
		return
	}

	// ครบทั้งสองฝั่งหรือยัง นับจากในฐานข้อมูล ไม่ใช่จากตัวแปรในหน่วยความจำ
	var hasGA, hasHR bool
	if err := tx.QueryRow(`
		SELECT bool_or(approver_group = 'GA'), bool_or(approver_group = 'HR')
		FROM point_adjustment_approvals
		WHERE request_id = $1 AND decision = 'approve'`, id).Scan(&hasGA, &hasHR); err != nil {
		web.Fail(w, err)
		return
	}

	if !hasGA || !hasHR {
		if err := tx.Commit(); err != nil {
			web.Fail(w, err)
			return
		}
		logAudit(claims.ID, "points.adjust-approve", fmt.Sprintf("request #%d", id),
			group+" · รออีกฝั่ง")
		web.JSON(w, http.StatusOK, web.Map{"ok": true, "status": "pending",
			"approvedGa": hasGA, "approvedHr": hasHR})
		return
	}

	// ครบแล้ว ลงคะแนนในธุรกรรมเดียวกับที่บันทึกการอนุมัติ
	var expire *string
	if expireAt.Valid {
		value := expireAt.String
		expire = &value
	}

	changedTier, err := applyPointAdjustment(tx, targetID, points, kind == "special", title, expire, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	if _, err := tx.Exec(`
		UPDATE point_adjustment_requests
		SET status = 'approved', decided_at = now() WHERE id = $1`, id); err != nil {
		web.Fail(w, err)
		return
	}
	if err := notifyRequester(tx, requester, id, true, points, kind); err != nil {
		web.Fail(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	unit := "คะแนน"
	if kind == "special" {
		unit = "คะแนนพิเศษ"
	}
	detail := fmt.Sprintf("%d %s · อนุมัติครบ GA+HR", points, unit)
	if changedTier != "" {
		detail += " · ระดับเปลี่ยนเป็น " + changedTier
	}
	logAudit(claims.ID, "points.adjust", fmt.Sprintf("user #%d", targetID), detail)

	web.JSON(w, http.StatusOK, web.Map{"ok": true, "status": "approved", "tier": changedTier})
}

// AdminCancelPointRequest ให้คนยื่นถอนคำขอของตัวเองก่อนมีคนอนุมัติครบ
func AdminCancelPointRequest(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสคำขอไม่ถูกต้อง")
		return
	}

	info, _ := whoIs(claims)

	// เจ้าของคำขอถอนได้ ผู้ดูแลระบบเก็บกวาดใบที่ค้างได้
	row, err := store.QueryOne(`
		UPDATE point_adjustment_requests
		SET status = 'cancelled', decided_at = now()
		WHERE id = $1 AND status = 'pending' AND ($2 OR requested_by = $3)
		RETURNING id`, id, info.Role == "admin", claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusConflict, "ถอนคำขอนี้ไม่ได้ — อาจถูกตัดสินไปแล้วหรือไม่ใช่คำขอของคุณ")
		return
	}

	logAudit(claims.ID, "points.adjust-cancel", fmt.Sprintf("request #%d", id), "")
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

// notifyRequester บอกผลให้คนยื่นคำขอรู้ ทั้งกรณีผ่านและไม่ผ่าน
func notifyRequester(tx *sql.Tx, requester, requestID int64, approved bool, points int, kind string) error {
	if !notificationEnabled("point_adjust_decided") {
		return nil
	}

	unit := "คะแนน"
	if kind == "special" {
		unit = "คะแนนพิเศษ"
	}

	title := "คำขอปรับคะแนนถูกปฏิเสธ"
	body := fmt.Sprintf("คำขอปรับ %d %s ไม่ผ่านการอนุมัติ", points, unit)
	if approved {
		title = "คำขอปรับคะแนนได้รับอนุมัติแล้ว"
		body = fmt.Sprintf("คำขอปรับ %d %s ผ่านการอนุมัติครบทั้งฝั่ง GA และ HR แล้ว คะแนนถูกปรับเรียบร้อย",
			points, unit)
	}

	_, err := tx.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'point',$2,$3)`, requester, title, body)
	return err
}
