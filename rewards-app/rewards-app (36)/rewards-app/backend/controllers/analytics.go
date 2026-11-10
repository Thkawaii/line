package controllers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"rewards/store"
	"rewards/web"
)

/*
หน้าการวิเคราะห์ของผู้ดูแลระบบ

รับตัวกรองสามตัวจากหน้าเว็บ แล้วส่งตัวเลขทุกบล็อกในหน้าเดียว
	range      year | quarter | month | all   ช่วงเวลาที่นับ
	department ชื่อแผนก หรือ all
	tier       ระดับสมาชิก หรือ all

ตัวกรองแผนกกับระดับใช้กับ "พนักงาน" ไม่ใช่กับกิจกรรมหรือของรางวัล
จึงต้อง join กลับไปที่ตาราง users ทุกคิวรี
*/

type analyticsFilter struct {
	since      time.Time
	department string
	tier       string
}

func readFilter(r *http.Request) analyticsFilter {
	now := time.Now()

	since := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.Local)
	switch web.Param(r, "range", "year") {
	case "month":
		since = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
	case "quarter":
		quarter := (int(now.Month())-1)/3*3 + 1
		since = time.Date(now.Year(), time.Month(quarter), 1, 0, 0, 0, 0, time.Local)
	case "all":
		since = time.Date(2000, 1, 1, 0, 0, 0, 0, time.Local)
	}

	return analyticsFilter{
		since:      since,
		department: web.Param(r, "department", "all"),
		tier:       web.Param(r, "tier", "all"),
	}
}

// userClause สร้างเงื่อนไขกรองพนักงาน พร้อมพารามิเตอร์ที่ต้องส่งเข้าไป
// alias คือชื่อที่ใช้อ้างตาราง users ในคิวรีนั้น
func (f analyticsFilter) userClause(alias string, args *[]any) string {
	clause := ""
	if f.department != "all" && f.department != "" {
		*args = append(*args, f.department)
		clause += fmt.Sprintf(" AND %s.department = $%d", alias, len(*args))
	}
	if f.tier != "all" && f.tier != "" {
		*args = append(*args, f.tier)
		clause += fmt.Sprintf(" AND %s.tier = $%d", alias, len(*args))
	}
	return clause
}

func AdminAnalytics(w http.ResponseWriter, r *http.Request) {
	f := readFilter(r)

	type block struct {
		key   string
		build func() (any, error)
	}

	result := web.Map{}

	blocks := []block{
		{"events", func() (any, error) { return eventStats(f) }},
		{"attendanceTrend", func() (any, error) { return attendanceTrend(f) }},
		{"topEvents", func() (any, error) { return topEvents(f) }},
		{"joinFrequency", func() (any, error) { return joinFrequency(f) }},
		{"departments", func() (any, error) { return departmentRates(f) }},
		{"points", func() (any, error) { return pointStats(f) }},
		{"pointTrend", func() (any, error) { return pointTrend(f) }},
		{"rewardSplit", func() (any, error) { return rewardSplit(f) }},
		{"topRewards", func() (any, error) { return topRewards(f) }},
	}

	for _, b := range blocks {
		value, err := b.build()
		if err != nil {
			web.Fail(w, err)
			return
		}
		result[b.key] = value
	}

	// รายการให้เลือกในตัวกรอง ส่งไปพร้อมกันจะได้ไม่ต้องยิงซ้ำ
	departments, err := store.Query(
		`SELECT DISTINCT department FROM users WHERE role = 'user' AND department <> '' ORDER BY department`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	names := make([]any, 0, len(departments))
	for _, row := range departments {
		names = append(names, row["department"])
	}
	result["departmentOptions"] = names

	web.JSON(w, http.StatusOK, result)
}

/* ---------- 1. การวิเคราะห์กิจกรรม ---------- */

func eventStats(f analyticsFilter) (web.Map, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	row, err := store.QueryOne(`
		SELECT count(*)::int AS registered,
		       count(*) FILTER (WHERE r.status = 'attended')::int AS attended
		FROM event_registrations r
		JOIN users u ON u.id = r.user_id
		WHERE r.created_at >= $1`+clause, args...)
	if err != nil {
		return nil, err
	}

	registered := toInt(row["registered"])
	attended := toInt(row["attended"])

	rate := 0.0
	if registered > 0 {
		rate = float64(attended) / float64(registered) * 100
	}

	return web.Map{
		"registered": registered,
		"attended":   attended,
		"noShow":     registered - attended,
		"rate":       round2(rate),
	}, nil
}

// แนวโน้มอัตราการเข้าร่วมรายเดือน
func attendanceTrend(f analyticsFilter) ([]store.Row, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	return store.Query(`
		SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month,
		       count(*)::int AS registered,
		       count(*) FILTER (WHERE r.status = 'attended')::int AS attended,
		       CASE WHEN count(*) > 0
		            THEN round(count(*) FILTER (WHERE r.status = 'attended') * 100.0 / count(*), 1)
		            ELSE 0 END::float AS rate
		FROM event_registrations r
		JOIN users u ON u.id = r.user_id
		WHERE r.created_at >= $1`+clause+`
		GROUP BY 1 ORDER BY 1`, args...)
}

// กิจกรรมที่ได้รับความสนใจสูงสุด
func topEvents(f analyticsFilter) ([]store.Row, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	return store.Query(`
		SELECT e.title, e.capacity,
		       count(r.id)::int AS joined,
		       CASE WHEN e.capacity > 0
		            THEN least(round(count(r.id) * 100.0 / e.capacity, 1), 100)
		            ELSE 100 END::float AS fill_rate
		FROM events e
		JOIN event_registrations r ON r.event_id = e.id AND r.created_at >= $1
		JOIN users u ON u.id = r.user_id`+strings.Replace(clause, " AND ", " AND ", 1)+`
		GROUP BY e.id ORDER BY joined DESC LIMIT 5`, args...)
}

// ความถี่การเข้าร่วมของพนักงาน แบ่งเป็นช่วง
func joinFrequency(f analyticsFilter) (web.Map, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	rows, err := store.Query(`
		WITH counted AS (
		  SELECT u.id,
		         (SELECT count(*) FROM event_registrations r
		          WHERE r.user_id = u.id AND r.status = 'attended' AND r.created_at >= $1) AS times
		  FROM users u WHERE u.role = 'user'`+clause+`
		)
		SELECT CASE
		         WHEN times = 0 THEN '0'
		         WHEN times = 1 THEN '1'
		         WHEN times BETWEEN 2 AND 3 THEN '2-3'
		         WHEN times BETWEEN 4 AND 5 THEN '4-5'
		         ELSE '5+'
		       END AS bucket,
		       count(*)::int AS people
		FROM counted GROUP BY 1`, args...)
	if err != nil {
		return nil, err
	}

	// เรียงช่วงให้คงที่เสมอ ไม่ขึ้นกับลำดับที่ฐานข้อมูลคืนมา
	order := []string{"0", "1", "2-3", "4-5", "5+"}
	found := map[string]int{}
	total := 0
	for _, row := range rows {
		bucket, _ := row["bucket"].(string)
		n := toInt(row["people"])
		found[bucket] = n
		total += n
	}

	buckets := make([]any, 0, len(order))
	for _, key := range order {
		buckets = append(buckets, web.Map{"bucket": key, "people": found[key]})
	}

	return web.Map{"total": total, "buckets": buckets}, nil
}

// อัตราการมีส่วนร่วมแยกตามแผนก นับจากสัดส่วนคนที่เข้าร่วมอย่างน้อยหนึ่งครั้ง
func departmentRates(f analyticsFilter) ([]store.Row, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	return store.Query(`
		SELECT u.department,
		       count(*)::int AS people,
		       count(*) FILTER (WHERE EXISTS (
		         SELECT 1 FROM event_registrations r
		         WHERE r.user_id = u.id AND r.status = 'attended' AND r.created_at >= $1
		       ))::int AS joined,
		       CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE EXISTS (
		         SELECT 1 FROM event_registrations r
		         WHERE r.user_id = u.id AND r.status = 'attended' AND r.created_at >= $1
		       )) * 100.0 / count(*), 1) ELSE 0 END::float AS rate
		FROM users u
		WHERE u.role = 'user' AND u.department <> ''`+clause+`
		GROUP BY u.department ORDER BY rate DESC, u.department`, args...)
}

/* ---------- 2. การวิเคราะห์คะแนน ---------- */

func pointStats(f analyticsFilter) (web.Map, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	row, err := store.QueryOne(`
		SELECT COALESCE(sum(t.points) FILTER (WHERE t.points > 0),0)::int AS given,
		       COALESCE(sum(-t.points) FILTER (WHERE t.points < 0),0)::int AS used
		FROM point_transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.created_at >= $1`+clause, args...)
	if err != nil {
		return nil, err
	}

	// คะแนนที่หมดอายุคือคะแนนที่ถูกตัดทิ้งตอนตัดยอดประจำปี
	// ยังไม่มีการบันทึกแยก จึงรายงานเป็น 0 ไว้ก่อนเพื่อไม่ให้ตัวเลขหลอกตา
	given := toInt(row["given"])
	used := toInt(row["used"])

	return web.Map{
		"given":   given,
		"used":    used,
		"expired": 0,
		"net":     given - used,
	}, nil
}

func pointTrend(f analyticsFilter) ([]store.Row, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	return store.Query(`
		SELECT to_char(date_trunc('month', t.created_at), 'YYYY-MM') AS month,
		       COALESCE(sum(t.points) FILTER (WHERE t.points > 0),0)::int AS given,
		       COALESCE(sum(-t.points) FILTER (WHERE t.points < 0),0)::int AS used
		FROM point_transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.created_at >= $1`+clause+`
		GROUP BY 1 ORDER BY 1`, args...)
}

/* ---------- 3. การวิเคราะห์ของรางวัล ---------- */

func rewardSplit(f analyticsFilter) (web.Map, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	rows, err := store.Query(`
		SELECT w.name, count(*)::int AS times,
		       COALESCE(sum(d.points_used),0)::int AS points
		FROM redemptions d
		JOIN rewards w ON w.id = d.reward_id
		JOIN users u ON u.id = d.user_id
		WHERE d.redeemed_at >= $1`+clause+`
		GROUP BY w.id ORDER BY times DESC LIMIT 5`, args...)
	if err != nil {
		return nil, err
	}

	total := 0
	for _, row := range rows {
		total += toInt(row["times"])
	}

	return web.Map{"total": total, "items": rows}, nil
}

func topRewards(f analyticsFilter) ([]store.Row, error) {
	args := []any{f.since}
	clause := f.userClause("u", &args)

	return store.Query(`
		SELECT w.name, count(*)::int AS redeemed,
		       COALESCE(sum(d.points_used),0)::int AS points
		FROM redemptions d
		JOIN rewards w ON w.id = d.reward_id
		JOIN users u ON u.id = d.user_id
		WHERE d.redeemed_at >= $1`+clause+`
		GROUP BY w.id ORDER BY redeemed DESC, points DESC LIMIT 5`, args...)
}

/* ---------- ตัวช่วย ---------- */

func toInt(value any) int {
	switch v := value.(type) {
	case int64:
		return int(v)
	case int:
		return v
	case float64:
		return int(v)
	default:
		return 0
	}
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
