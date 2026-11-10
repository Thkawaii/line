package controllers

import (
	"database/sql"
	"net/http"

	"rewards/store"
	"rewards/web"
)

/*
ส่วนเสริมของกิจกรรม

  - ตัวเลือกของกิจกรรมแบบโหวต
  - รายชื่อผู้ลงทะเบียน สำหรับพิมพ์เป็นใบเซ็นชื่อหน้างาน
*/

// attachOptions เติมตัวเลือกให้กิจกรรมแบบโหวต พร้อมจำนวนโหวตของแต่ละตัวเลือก
// กิจกรรมแบบลงทะเบียนจะได้ options เป็นลิสต์ว่าง หน้าเว็บจึงเช็กแค่ความยาวได้เลย
func attachOptions(events []store.Row, lang string) error {
	ids := make([]any, 0, len(events))
	index := map[int64]store.Row{}

	for _, event := range events {
		if kind, _ := event["kind"].(string); kind != "vote" {
			continue
		}
		id, ok := event["id"].(int64)
		if !ok {
			continue
		}
		ids = append(ids, id)
		index[id] = event
		event["options"] = []store.Row{}
	}

	if len(ids) == 0 {
		return nil
	}

	placeholders := ""
	for i := range ids {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "$" + itoa(i+1)
	}

	rows, err := store.Query(`
		SELECT o.id, o.event_id, o.label, o.detail, o.sort_order,
		       (SELECT count(*)::int FROM event_registrations r WHERE r.option_id = o.id) AS votes
		FROM event_options o
		WHERE o.event_id IN (`+placeholders+`)
		ORDER BY o.sort_order, o.id`, ids...)
	if err != nil {
		return err
	}

	for _, row := range rows {
		eventID, _ := row["event_id"].(int64)
		event, ok := index[eventID]
		if !ok {
			continue
		}
		delete(row, "event_id")
		list, _ := event["options"].([]store.Row)
		event["options"] = append(list, row)
	}

	return nil
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

// AdminEventRegistrations คืนรายชื่อผู้ลงทะเบียนของกิจกรรมหนึ่ง สำหรับดูและพิมพ์
func AdminEventRegistrations(w http.ResponseWriter, r *http.Request) {
	id, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสกิจกรรมไม่ถูกต้อง")
		return
	}

	event, err := store.QueryOne(`
		SELECT id, title, event_date, end_date, start_time, end_time, location, kind, capacity, points
		FROM events WHERE id = $1`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if event == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบกิจกรรมนี้")
		return
	}

	people, err := store.Query(`
		SELECT u.employee_code, u.display_name, u.department, u.position, u.branch,
		       r.status, r.walk_in, r.created_at, r.checked_in_at, o.label AS option_label
		FROM event_registrations r
		JOIN users u ON u.id = r.user_id
		LEFT JOIN event_options o ON o.id = r.option_id
		WHERE r.event_id = $1
		ORDER BY u.department, u.display_name`, id)
	if err != nil {
		web.Fail(w, err)
		return
	}

	attended := 0
	for _, row := range people {
		if status, _ := row["status"].(string); status == "attended" {
			attended++
		}
	}

	// กิจกรรมโหวตให้ส่งผลนับคะแนนมาด้วย จะได้ดูผลได้จากหน้าเดียวกัน
	var tally []store.Row
	if kind, _ := event["kind"].(string); kind == "vote" {
		tally, err = store.Query(`
			SELECT o.label, o.detail,
			       (SELECT count(*)::int FROM event_registrations r WHERE r.option_id = o.id) AS votes
			FROM event_options o WHERE o.event_id = $1 ORDER BY votes DESC, o.sort_order`, id)
		if err != nil {
			web.Fail(w, err)
			return
		}
	}

	web.JSON(w, http.StatusOK, web.Map{
		"event":         event,
		"registrations": people,
		"total":         len(people),
		"attended":      attended,
		"tally":         tally,
	})
}

// saveOptions เขียนตัวเลือกของกิจกรรมโหวตใหม่ทั้งชุด
//
// ลบของเดิมแล้วใส่ใหม่ เพราะผู้ดูแลแก้ลำดับหรือลบตัวเลือกกลางชุดได้
// การไล่เทียบทีละแถวซับซ้อนกว่าโดยไม่ได้ประโยชน์เพิ่ม
// ตัวเลือกที่มีคนโหวตแล้วจะไม่ถูกลบ เพื่อไม่ให้ผลโหวตหาย
func saveOptions(eventID int64, options []eventOption) error {
	if options == nil {
		return nil
	}

	keep := map[int64]bool{}
	for _, option := range options {
		if option.ID > 0 {
			keep[option.ID] = true
		}
	}

	existing, err := store.Query(`
		SELECT o.id, (SELECT count(*)::int FROM event_registrations r WHERE r.option_id = o.id) AS votes
		FROM event_options o WHERE o.event_id = $1`, eventID)
	if err != nil {
		return err
	}

	for _, row := range existing {
		id, _ := row["id"].(int64)
		votes := toInt(row["votes"])
		if keep[id] || votes > 0 {
			continue
		}
		if _, err := store.Exec(`DELETE FROM event_options WHERE id = $1`, id); err != nil {
			return err
		}
	}

	for index, option := range options {
		if option.Label == "" {
			continue
		}
		if option.ID > 0 {
			_, err = store.Exec(`
				UPDATE event_options SET label = $2, detail = $3, sort_order = $4
				WHERE id = $1 AND event_id = $5`,
				option.ID, option.Label, option.Detail, index+1, eventID)
		} else {
			_, err = store.Exec(`
				INSERT INTO event_options (event_id, label, detail, sort_order) VALUES ($1,$2,$3,$4)`,
				eventID, option.Label, option.Detail, index+1)
		}
		if err != nil {
			return err
		}
	}

	return nil
}

// checkVoteOption ตรวจว่าตัวเลือกที่ส่งมาเป็นของกิจกรรมนี้จริง
// คืนข้อความบอกปัญหาถ้าไม่ผ่าน
func checkVoteOption(tx *sql.Tx, eventID int64, optionID int64) (string, error) {
	var count int
	if err := tx.QueryRow(
		`SELECT count(*)::int FROM event_options WHERE event_id = $1`, eventID).Scan(&count); err != nil {
		return "", err
	}
	if count == 0 {
		return "", nil // กิจกรรมโหวตที่ยังไม่ได้ตั้งตัวเลือก ให้โหวตได้เหมือนเดิม
	}

	if optionID == 0 {
		return "กรุณาเลือกตัวเลือกก่อนยืนยันการโหวต", nil
	}

	var owned int
	if err := tx.QueryRow(
		`SELECT count(*)::int FROM event_options WHERE id = $1 AND event_id = $2`,
		optionID, eventID).Scan(&owned); err != nil {
		return "", err
	}
	if owned == 0 {
		return "ตัวเลือกที่ส่งมาไม่ใช่ของกิจกรรมนี้", nil
	}

	return "", nil
}
