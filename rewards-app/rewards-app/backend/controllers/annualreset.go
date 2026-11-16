package controllers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"rewards/config"
	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
รีเซ็ตคะแนนประจำปี

ทุกคนถูกตัดยอดคะแนนในวันที่กำหนด (ตั้งได้ที่หน้า System Settings)
คะแนนกลับไปเป็น 0 ทุกคนเท่ากัน สิ่งที่ต่างกันคือระดับที่รักษาไว้ได้

เงื่อนไขการคงระดับดูจาก "คะแนนที่ได้รับ" ตลอดรอบปีที่ผ่านมา ไม่ใช่คะแนนคงเหลือ
เพราะคนที่เข้าร่วมกิจกรรมและได้รับคะแนนสม่ำเสมอคือคนที่มีส่วนร่วมกับระบบจริง
(เดิมวัดจากคะแนนที่ใช้แลกของรางวัล เปลี่ยนมาวัดจากคะแนนที่ได้รับแทน)

	ระดับเดิม   คะแนนที่ได้รับในรอบปี   ระดับหลังรีเซ็ต   คะแนนหลังรีเซ็ต
	Member     ไม่กำหนด               Member           0
	Silver     ตั้งแต่ 500            Silver           0
	Silver     ต่ำกว่า 500            Member           0
	Elite      ตั้งแต่ 1,000          Elite            0
	Elite      ต่ำกว่า 1,000          Silver           0
*/

// เกณฑ์คะแนนที่ต้องได้รับเพื่อคงระดับ และระดับที่จะถูกลดลงไปถ้าทำไม่ถึง
var retention = map[string]struct {
	needEarned int
	fallback   string
}{
	"Silver": {500, "Member"},
	"Elite":  {1000, "Silver"},
}

const lastResetKey = "points_reset_last_year"

// AnnualResetSummary สรุปผลการรีเซ็ตเพื่อแสดงให้ผู้ดูแลระบบเห็น
type AnnualResetSummary struct {
	Total    int `json:"total"`
	Kept     int `json:"kept"`
	Demoted  int `json:"demoted"`
	Year     int `json:"year"`
	Executed bool
}

// RunAnnualReset ตัดยอดคะแนนของพนักงานทุกคนและปรับระดับตามเงื่อนไข
func RunAnnualReset(actorID int64, cycleStart time.Time) (AnnualResetSummary, error) {
	// ปีที่บันทึกคือปีที่ "ลงมือตัดยอด" ไม่ใช่ปีที่รอบเริ่ม
	// ถ้าผู้ดูแลกดเองก่อนถึงกำหนด ตัวตั้งเวลาต้องไม่มาตัดซ้ำอีกตอนสิ้นปีเดียวกัน
	summary := AnnualResetSummary{Year: time.Now().Year()}

	tx, err := config.DB.Begin()
	if err != nil {
		return summary, err
	}
	defer tx.Rollback()

	// คะแนนที่ได้รับตลอดรอบปี นับจากรายการที่เพิ่มคะแนนทั้งหมด
	people, err := tx.Query(`
		SELECT u.id, u.tier,
		       COALESCE((SELECT sum(t.points) FROM point_transactions t
		                 WHERE t.user_id = u.id AND t.points > 0 AND t.created_at >= $1), 0)::int AS earned
		FROM users u WHERE u.role = 'user'`, cycleStart)
	if err != nil {
		return summary, err
	}

	type change struct {
		id     int64
		tier   string
		demote bool
	}
	var changes []change

	for people.Next() {
		var id int64
		var tier string
		var earned int
		if err := people.Scan(&id, &tier, &earned); err != nil {
			people.Close()
			return summary, err
		}

		next := tier
		rule, hasRule := retention[tier]
		if hasRule && earned < rule.needEarned {
			next = rule.fallback
		}

		changes = append(changes, change{id: id, tier: next, demote: next != tier})
	}
	people.Close()

	for _, c := range changes {
		// คะแนนกลับไปเป็น 0 ทุกคน ไม่ว่าจะรักษาระดับไว้ได้หรือไม่
		if _, err := tx.Exec(`UPDATE users SET points = 0, tier = $2 WHERE id = $1`,
			c.id, c.tier); err != nil {
			return summary, err
		}

		title := "ตัดยอดคะแนนประจำปี"
		if c.demote {
			title += " และปรับระดับเป็น " + c.tier
		}
		if _, err := tx.Exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points)
			VALUES ($1,'adjust','system',$2,0)`, c.id, title); err != nil {
			return summary, err
		}
		if _, err := tx.Exec(`
			INSERT INTO notifications (user_id, category, title, body)
			VALUES ($1,'point',$2,$3)`, c.id, title,
			fmt.Sprintf("เริ่มรอบใหม่ด้วย 0 คะแนน ระดับ %s", c.tier)); err != nil {
			return summary, err
		}

		summary.Total++
		if c.demote {
			summary.Demoted++
		} else {
			summary.Kept++
		}
	}

	// จำปีที่รีเซ็ตไปแล้ว กันไม่ให้ตัวตั้งเวลารันซ้ำในปีเดียวกัน
	if _, err := tx.Exec(`
		INSERT INTO settings (key, value, label, kind) VALUES ($1,$2,'ปีที่ตัดยอดคะแนนล่าสุด','number')
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
		lastResetKey, strconv.Itoa(summary.Year)); err != nil {
		return summary, err
	}

	if _, err := tx.Exec(`
		INSERT INTO audit_logs (actor_id, action, target, detail)
		VALUES ($1,'points.annual-reset','พนักงานทั้งหมด',$2)`,
		nullActor(actorID),
		fmt.Sprintf("%d บัญชี · คงระดับ %d · ลดระดับ %d", summary.Total, summary.Kept, summary.Demoted)); err != nil {
		return summary, err
	}

	if err := tx.Commit(); err != nil {
		return summary, err
	}

	summary.Executed = true
	return summary, nil
}

// ตัวตั้งเวลารันเองโดยไม่มีผู้ดูแลเป็นคนสั่ง จึงไม่มี actor
func nullActor(id int64) any {
	if id == 0 {
		return nil
	}
	return id
}

// resetDate อ่านวันตัดยอดจากค่าตั้งระบบ ค่าเริ่มต้นคือ 31 ธันวาคม
func resetDate(year int) time.Time {
	month := settingInt("points_expire_month", 12, 1, 12)
	day := settingInt("points_expire_day", 31, 1, 31)

	// เผื่อกรณีตั้งวันที่ 31 ในเดือนที่ไม่มีวันที่ 31 ให้ถอยมาเป็นวันสุดท้ายของเดือนนั้น
	last := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.Local).Day()
	if day > last {
		day = last
	}
	return time.Date(year, time.Month(month), day, 0, 0, 0, 0, time.Local)
}

func settingInt(key string, fallback, min, max int) int {
	value, err := strconv.Atoi(setting(key, ""))
	if err != nil || value < min || value > max {
		return fallback
	}
	return value
}

// MaybeRunAnnualReset ตรวจว่าถึงกำหนดตัดยอดหรือยัง ถ้าถึงแล้วและยังไม่ได้ทำในปีนี้ก็ทำให้เลย
// เรียกซ้ำได้ ถ้าทำไปแล้วจะไม่ทำซ้ำ
func MaybeRunAnnualReset() (AnnualResetSummary, error) {
	now := time.Now()
	due := resetDate(now.Year())

	if now.Before(due) {
		return AnnualResetSummary{}, nil
	}

	last, _ := strconv.Atoi(setting(lastResetKey, "0"))
	if last >= now.Year() {
		return AnnualResetSummary{}, nil
	}

	// รอบที่ผ่านมาเริ่มตั้งแต่วันตัดยอดของปีก่อน
	return RunAnnualReset(0, resetDate(now.Year()-1))
}

/* ---------- เส้นทางสำหรับผู้ดูแลระบบ ---------- */

// AdminAnnualReset ให้ผู้ดูแลสั่งตัดยอดเองได้ ใช้ตอนอยากทำก่อนกำหนดหรือทดสอบ
func AdminAnnualReset(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	// นับรอบปีที่ผ่านมาจากวันตัดยอดของปีก่อน เหมือนกับที่ตัวตั้งเวลาใช้
	summary, err := RunAnnualReset(claims.ID, resetDate(time.Now().Year()-1))
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"total": summary.Total, "kept": summary.Kept, "demoted": summary.Demoted,
	})
}

// AdminResetStatus บอกว่าถึงกำหนดตัดยอดเมื่อไหร่ และทำไปล่าสุดเมื่อปีไหน
func AdminResetStatus(w http.ResponseWriter, r *http.Request) {
	last, _ := strconv.Atoi(setting(lastResetKey, "0"))
	due := resetDate(time.Now().Year())

	pending, err := store.Count(`
		SELECT count(*)::int FROM users u
		WHERE u.role = 'user' AND u.tier <> 'Member'
		  AND COALESCE((SELECT sum(t.points) FROM point_transactions t
		                WHERE t.user_id = u.id AND t.points > 0 AND t.created_at >= $1), 0)
		      < CASE u.tier WHEN 'Silver' THEN 500 WHEN 'Elite' THEN 1000 ELSE 0 END`,
		resetDate(time.Now().Year()-1))
	if err != nil && err != sql.ErrNoRows {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"nextResetAt":   due.Format("2006-01-02"),
		"lastResetYear": last,
		"atRisk":        pending,
	})
}
