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

/*
lastResetAtKey เก็บ "เวลาที่ตัดยอดจริง" ไม่ใช่แค่ปี

ปีอย่างเดียวบอกไม่ได้ว่ารอบปัจจุบันเริ่มนับเมื่อไหร่ ถ้าผู้ดูแลกดตัดยอดเองกลางปี
รอบใหม่เริ่มนับจากวันนั้น ไม่ใช่จากวันตัดยอดตามปฏิทินของปีก่อน

เดิมใช้ resetDate(ปีนี้ - 1) เป็นจุดเริ่มรอบเสมอ คนที่ได้คะแนนเยอะก่อนถูกตัดยอด
จึงยังถูกนับว่า "ได้คะแนนในรอบนี้" ทั้งที่คะแนนก้อนนั้นถูกล้างไปแล้ว
ผลคือจำนวนคนเสี่ยงถูกลดระดับขึ้นเป็น 0 ทั้งที่ความจริงรอบใหม่ยังไม่มีใครได้คะแนนเลย
*/
const lastResetAtKey = "points_reset_last_at"

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
	// ดึงยอดคะแนนคงเหลือมาด้วย เพื่อบันทึกจำนวนที่ถูกตัดจริงลงรายการเดินคะแนน
	people, err := tx.Query(`
		SELECT u.id, u.tier, u.points,
		       COALESCE((SELECT sum(t.points) FROM point_transactions t
		                 WHERE t.user_id = u.id AND t.points > 0 AND t.created_at >= $1), 0)::int AS earned
		FROM users u WHERE u.role = 'user'`, cycleStart)
	if err != nil {
		return summary, err
	}

	type change struct {
		id      int64
		tier    string
		demote  bool
		balance int // ยอดคงเหลือก่อนถูกตัด ใช้บันทึกเป็นรายการติดลบ
	}
	var changes []change

	for people.Next() {
		var id int64
		var tier string
		var balance, earned int
		if err := people.Scan(&id, &tier, &balance, &earned); err != nil {
			people.Close()
			return summary, err
		}

		next := tier
		rule, hasRule := retention[tier]
		if hasRule && earned < rule.needEarned {
			next = rule.fallback
		}

		changes = append(changes, change{id: id, tier: next, demote: next != tier, balance: balance})
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

		/*
			บันทึกจำนวนที่ถูกตัดจริง ไม่ใช่ 0

			เดิมลงรายการไว้ด้วยคะแนน 0 คือมีบรรทัดบอกว่า "ตัดยอดแล้ว"
			แต่ไม่มีตัวเลขว่าตัดไปเท่าไหร่ ผลคือผลรวมของรายการเดินคะแนน
			ไม่เท่ากับยอดคงเหลือจริงอีกต่อไป

			กราฟการเคลื่อนไหวของคะแนนคิดยอดยกมาจากผลรวมนั้น เส้นยอดสะสม
			จึงเริ่มต้นสูงเกินจริงทุกปีหลังตัดยอด และยิ่งห่างขึ้นเรื่อย ๆ ทุกรอบ

			คนที่เปิดดูประวัติคะแนนของตัวเองก็จะเห็นว่าคะแนนหายไปเฉย ๆ
			โดยไม่มีรายการอธิบาย
		*/
		if _, err := tx.Exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points)
			VALUES ($1,'adjust','system',$2,$3)`, c.id, title, -c.balance); err != nil {
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

	// จำเวลาที่ตัดยอดจริงด้วย ใช้เป็นจุดเริ่มของรอบถัดไป
	if _, err := tx.Exec(`
		INSERT INTO settings (key, value, label, kind) VALUES ($1,$2,'เวลาที่ตัดยอดคะแนนล่าสุด','text')
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
		lastResetAtKey, time.Now().Format(time.RFC3339)); err != nil {
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

/*
cycleStart คืนวันที่รอบปีปัจจุบันเริ่มนับคะแนน

ปกติคือวันตัดยอดตามปฏิทินของปีก่อน แต่ถ้าเคยตัดยอดจริงหลังจากวันนั้น
(ผู้ดูแลกดเองกลางปี หรือตัวตั้งเวลาทำช้ากว่ากำหนด) ให้ใช้เวลาที่ตัดจริงแทน

ไม่งั้นคะแนนที่ได้ก่อนถูกตัดยอดจะถูกนับซ้ำเข้ารอบใหม่ ทั้งที่ถูกล้างไปแล้ว
*/
func cycleStart() time.Time {
	start := resetDate(time.Now().Year() - 1)

	last, err := time.Parse(time.RFC3339, setting(lastResetAtKey, ""))
	if err == nil && last.After(start) {
		return last
	}
	return start
}

/*
resetDone บอกว่ารอบของวันตัดยอดที่ส่งมาถูกตัดไปแล้วหรือยัง

ดูจากปีที่บันทึกไว้ ไม่ใช่จากวันที่ปัจจุบัน เพราะผู้ดูแลกดตัดยอดก่อนกำหนดได้
พอกดแล้ว วันตัดยอดของปีนั้นถือว่าผ่านไปแล้ว ไม่ใช่ "กำลังจะถึง"
*/
func resetDone(year int) bool {
	last, _ := strconv.Atoi(setting(lastResetKey, "0"))
	return last >= year
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

	if resetDone(now.Year()) {
		return AnnualResetSummary{}, nil
	}

	// รอบที่ผ่านมาเริ่มตั้งแต่วันตัดยอดของปีก่อน หรือเวลาที่ตัดยอดจริงถ้ามาทีหลัง
	return RunAnnualReset(0, cycleStart())
}

/* ---------- เส้นทางสำหรับผู้ดูแลระบบ ---------- */

// AdminAnnualReset ให้ผู้ดูแลสั่งตัดยอดเองได้ ใช้ตอนอยากทำก่อนกำหนดหรือทดสอบ
func AdminAnnualReset(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	/*
		ใช้กติกาเดิมของการปรับคะแนน คือแผนกหลังบ้าน + ตำแหน่งในรายการ

		การตัดยอดกระทบคะแนนและระดับของทุกคนในระบบพร้อมกันและย้อนกลับไม่ได้
		จึงไม่เปิดกว้างตามการปรับคะแนนรายคนที่ย้ายไปใช้ระบบขออนุมัติแล้ว
		ซ่อนปุ่มที่หน้าจอเป็นแค่ความสุภาพกับสายตา ของจริงกันตรงนี้
	*/
	if !CanRunAnnualReset(claims) {
		web.Error(w, http.StatusForbidden,
			"บัญชีนี้ไม่มีสิทธิ์ตัดยอดคะแนนประจำปี")
		return
	}

	// นับรอบปีที่ผ่านมาจากวันที่รอบนี้เริ่มจริง เหมือนกับที่ตัวตั้งเวลาใช้
	summary, err := RunAnnualReset(claims.ID, cycleStart())
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

	// ใช้ตัวเดียวกับที่แสดงวันหมดอายุให้พนักงาน สองหน้าจะได้ไม่บอกคนละวัน
	due := NextResetDate()

	// นับจากวันที่รอบนี้เริ่มจริง ไม่ใช่วันตัดยอดตามปฏิทินของปีก่อนเสมอไป
	start := cycleStart()

	pending, err := store.Count(`
		SELECT count(*)::int FROM users u
		WHERE u.role = 'user' AND u.tier <> 'Member'
		  AND COALESCE((SELECT sum(t.points) FROM point_transactions t
		                WHERE t.user_id = u.id AND t.points > 0 AND t.created_at >= $1), 0)
		      < CASE u.tier WHEN 'Silver' THEN 500 WHEN 'Elite' THEN 1000 ELSE 0 END`,
		start)
	if err != nil && err != sql.ErrNoRows {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"nextResetAt":   due.Format("2006-01-02"),
		"lastResetYear": last,
		"atRisk":        pending,
		// บอกไปด้วยว่านับคะแนนตั้งแต่เมื่อไหร่ หน้าจอจะได้อธิบายเลขให้ผู้ดูแลเข้าใจ
		"cycleStart": start.Format("2006-01-02"),
	})
}

/*
NextResetDate คืนวันตัดยอดคะแนนครั้งถัดไป

ถ้าปีนี้ยังไม่ถึงวันตัดยอด ก็คือวันนั้นของปีนี้
ถ้าเลยมาแล้ว ก็ข้ามไปวันเดียวกันของปีหน้า

มีไว้เพื่อให้พนักงานเห็นวันหมดอายุเสมอ ไม่ใช่ขีดกลางว่าง ๆ
คะแนนมีกำหนดหมดอายุอยู่แล้วตามรอบปี ต่อให้ยังไม่เคยถูกตัดสักครั้ง
การแสดงขีดกลางทำให้เข้าใจผิดว่าคะแนนอยู่ได้ตลอดไป แล้วไปตกใจตอนถูกตัดจริง
*/
func NextResetDate() time.Time {
	now := time.Now()

	/*
		ข้ามไปปีหน้าในสองกรณี ไม่ใช่กรณีเดียว

		หนึ่ง เลยวันตัดยอดของปีนี้มาแล้ว
		สอง ยังไม่ถึงวันตามปฏิทิน แต่ตัดยอดของปีนี้ไปเรียบร้อยแล้ว
		     (ผู้ดูแลกดเองก่อนกำหนด)

		เดิมดูแต่ข้อแรก พอกดตัดยอดเองกลางปี หน้าจอจึงยังขึ้นวันของปีนี้
		ทั้งที่รอบนั้นจบไปแล้ว และตัวตั้งเวลาก็จะไม่มาตัดซ้ำอีกในปีเดียวกัน
	*/
	due := resetDate(now.Year())
	if now.Before(due) && !resetDone(now.Year()) {
		return due
	}
	return resetDate(now.Year() + 1)
}

// withExpiry เติมวันหมดอายุให้ข้อมูลผู้ใช้เมื่อยังไม่ได้ตั้งไว้รายคน
//
// ค่าในคอลัมน์ points_expire_at มีไว้สำหรับกรณีพิเศษที่ต้องกำหนดเองรายคน
// ถ้าไม่ได้ตั้ง ให้ใช้วันตัดยอดประจำปีของทั้งระบบ
func withExpiry(user map[string]any) map[string]any {
	if user == nil {
		return user
	}
	if value, ok := user["points_expire_at"]; !ok || value == nil {
		user["points_expire_at"] = NextResetDate().Format("2006-01-02")
	}
	return user
}
