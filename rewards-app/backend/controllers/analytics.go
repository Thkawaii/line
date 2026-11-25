package controllers

import (
	"fmt"
	"net/http"
	"strconv"
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
	until      time.Time // วันถัดจากวันสุดท้ายที่นับ ใช้เทียบแบบ < จะได้ไม่ต้องคิดเรื่องเวลาในวัน
	department string
	tier       string

	/*
		กิจกรรมที่เลือกดูเจาะจง 0 คือดูทุกกิจกรรม

		อยู่บนแถบตัวกรองรวมแถวเดียวกับช่วงวันที่ แผนก และระดับสมาชิก
		เลือกแล้วมีผลกับทุกบล็อกที่ผูกกับกิจกรรมได้ ไม่ใช่เฉพาะกราฟใดกราฟหนึ่ง

		บล็อกที่ผูกกับกิจกรรมไม่ได้ (ของรางวัล, ภาพรวมคะแนนรวม) ไม่มีทางกรองให้ถูกต้อง
		ฝั่งหน้าเว็บจึงซ่อนไว้ตอนเลือกกิจกรรม ดีกว่าโชว์ตัวเลขที่ไม่เกี่ยวกับงานที่เลือก
	*/
	event int64
}

/*
readFilter อ่านช่วงเวลาที่หน้าเว็บส่งมา

	month   เดือนนี้
	year    ปีนี้ (ค่าเริ่มต้น)
	custom  กำหนดเอง ส่ง year, fromMonth, toMonth มาด้วย
*/
func readFilter(r *http.Request) analyticsFilter {
	now := time.Now()
	since := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.Local)
	until := since.AddDate(1, 0, 0)

	switch web.Param(r, "range", "year") {
	case "month":
		since = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
		until = since.AddDate(0, 1, 0)

	case "custom":
		year := intParam(r, "year", now.Year(), 2000, 2100)
		from := intParam(r, "fromMonth", 1, 1, 12)
		to := intParam(r, "toMonth", 12, 1, 12)
		if to < from {
			from, to = to, from
		}
		since = time.Date(year, time.Month(from), 1, 0, 0, 0, 0, time.Local)
		until = time.Date(year, time.Month(to), 1, 0, 0, 0, 0, time.Local).AddDate(0, 1, 0)
	}

	return analyticsFilter{
		since:      since,
		until:      until,
		department: web.Param(r, "department", "all"),
		tier:       web.Param(r, "tier", "all"),
		event:      eventParam(r, "event"),
	}
}

// eventParam อ่านรหัสกิจกรรมจาก query string ค่าที่อ่านไม่ออกหรือติดลบถือว่าไม่ได้เลือก
func eventParam(r *http.Request, name string) int64 {
	id, err := strconv.ParseInt(web.Param(r, name, ""), 10, 64)
	if err != nil || id < 0 {
		return 0
	}
	return id
}

/*
eventClause กรองให้เหลือกิจกรรมเดียว

column คือคอลัมน์ที่เก็บรหัสกิจกรรมในคิวรีนั้น ซึ่งคนละชื่อกันในแต่ละกราฟ
(e.id สำหรับตารางกิจกรรม, t.event_id สำหรับรายการเดินคะแนน)
*/
func (f analyticsFilter) eventClause(column string, event int64, args *[]any) string {
	if event <= 0 {
		return ""
	}
	*args = append(*args, event)
	return fmt.Sprintf(" AND %s = $%d", column, len(*args))
}

/*
eventOptions คือรายการกิจกรรมให้เลือกในช่องกรอง

ต้องสร้างจากช่วงเวลาที่เลือกอยู่ ไม่ใช่ดึงกิจกรรมทั้งหมดมาเสมอ
เพราะแต่ละปีมีกิจกรรมคนละชุด ถ้าโชว์ทั้งหมดผู้ดูแลจะเลือกงานของปี 2568
ตอนที่กำลังดูข้อมูลปี 2569 แล้วได้กราฟว่างเปล่าโดยไม่รู้ว่าทำไม

ติดปีไว้ท้ายชื่อด้วย กิจกรรมประจำปีที่ชื่อซ้ำกันทุกปีจะได้แยกออกจากกัน
*/
func eventOptions(f analyticsFilter) ([]store.Row, error) {
	return store.Query(`
		SELECT e.id, e.title, to_char(e.event_date, 'YYYY-MM-DD') AS event_date,
		       e.title || ' (' || (extract(year from e.event_date)::int + 543) || ')' AS label
		FROM events e
		WHERE e.event_date >= $1 AND e.event_date < $2`+publishedEvents+`
		ORDER BY e.event_date DESC, e.id DESC`, f.since, f.until)
}

func intParam(r *http.Request, name string, fallback, min, max int) int {
	value, err := strconv.Atoi(web.Param(r, name, ""))
	if err != nil || value < min || value > max {
		return fallback
	}
	return value
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

/*
eventSummary สรุปตัวเลขของกิจกรรมเดียวที่เลือกอยู่

มีไว้ตอบคำถามที่ถามกันบ่อยที่สุดตรง ๆ
"เดือนนี้จัดหลายงาน งานนี้งานเดียวแจกไปกี่คะแนน และมีคนมากี่คน"

กราฟแนวโน้มตอบคำถามนี้ได้ไม่ดี เพราะพอเลือกเดือนเดียวกับงานเดียว
เส้นกราฟจะเหลือจุดเดียวและแท่งเดียว ซึ่งอ่านตัวเลขจริงได้ยากกว่าดูตัวเลขตรง ๆ

คืน nil เมื่อไม่ได้เลือกกิจกรรม หน้าเว็บจะได้ไม่ต้องวาดแถบนี้
*/
func eventSummary(f analyticsFilter, eventID int64) (web.Map, error) {
	if eventID <= 0 {
		return nil, nil
	}

	event, err := store.QueryOne(`
		SELECT e.id, e.title, e.points, e.special_points, e.status,
		       to_char(e.event_date, 'YYYY-MM-DD') AS event_date,
		       to_char(e.end_date,   'YYYY-MM-DD') AS end_date
		FROM events e WHERE e.id = $1`, eventID)
	if err != nil || event == nil {
		return nil, err
	}

	// ตัวหารเดียวกับทุกบล็อกในหน้านี้ เปอร์เซ็นต์จะได้เทียบกันได้
	audience, err := activeAudience(f)
	if err != nil {
		return nil, err
	}

	joinArgs := []any{eventID}
	people, err := store.QueryOne(`
		SELECT count(*)::int AS registered,
		       count(*) FILTER (WHERE r.status = 'attended')::int AS attended,
		       count(*) FILTER (WHERE r.status = 'absent')::int   AS no_show
		FROM event_registrations r
		JOIN users u ON u.id = r.user_id
		WHERE r.event_id = $1`+f.userClause("u", &joinArgs), joinArgs...)
	if err != nil {
		return nil, err
	}

	/*
		คะแนนที่แจกไปจริง อ่านจากรายการเดินคะแนน ไม่ใช่เอาคะแนนต่อหัวคูณจำนวนคน

		สองอย่างนี้ไม่เท่ากันเสมอไป กิจกรรมอาจถูกแก้คะแนนกลางทาง
		หรือมีคนได้คะแนนจากการสแกนย้อนหลังหลังปิดงานไปแล้ว
		ตัวเลขที่ผู้ดูแลต้องใช้คือคะแนนที่ออกจากระบบไปจริง
	*/
	givenArgs := []any{eventID}
	given, err := store.QueryOne(`
		SELECT COALESCE(sum(t.points) FILTER (WHERE t.point_kind <> 'special'),0)::int AS points,
		       COALESCE(sum(t.points) FILTER (WHERE t.point_kind =  'special'),0)::int AS special_points,
		       count(DISTINCT t.user_id)::int AS people
		FROM point_transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.event_id = $1 AND t.points > 0`+f.userClause("u", &givenArgs), givenArgs...)
	if err != nil {
		return nil, err
	}

	attended, _ := toInt64(people["attended"])

	return web.Map{
		"event":      event,
		"audience":   audience,
		"registered": people["registered"],
		"attended":   people["attended"],
		"noShow":     people["no_show"],
		/*
			อัตราเข้าร่วมคิดแบบเดียวกับการ์ดด้านบนและกราฟแนวโน้ม
			คือ "คนที่มาจริง หารด้วยพนักงานทั้งหมดในขอบเขต"

			เดิมตรงนี้หารจากจำนวนคนที่ลงทะเบียน ซึ่งเป็นนิยามที่สี่ในหน้าเดียวกัน
			ตัวเลขจึงไม่มีทางตรงกับที่อื่นเลย
		*/
		"rate":          round2(float64(attended) / float64(audience) * 100),
		"points":        given["points"],
		"specialPoints": given["special_points"],
		"paidPeople":    given["people"],
	}, nil
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
		{"eventOptions", func() (any, error) { return eventOptions(f) }},
		{"eventSummary", func() (any, error) { return eventSummary(f, f.event) }},
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

/*
publishedEvents คือเงื่อนไขว่ากิจกรรมไหนเอามาคิดในรายงาน

กิจกรรมสถานะ "ร่าง" ยังไม่ได้เผยแพร่ พนักงานมองไม่เห็นและลงทะเบียนไม่ได้
จึงไม่ควรถูกนับเป็นตัวหารของอัตราใด ๆ ไม่งั้นผู้ดูแลที่เตรียมงานไว้ล่วงหน้า
จะเห็นอัตราการมีส่วนร่วมตกลงทันทีที่กดบันทึกร่าง ทั้งที่ยังไม่มีอะไรเกิดขึ้น

ส่วน "ปิดแล้ว" นับด้วย เพราะเป็นงานที่เคยเปิดรับและเกิดขึ้นจริง
แค่ปิดรับลงทะเบียนไปแล้วเท่านั้น
*/
const publishedEvents = ` AND e.status <> 'draft'`

/*
eventStats ตัวเลขรวมของกิจกรรมในช่วงที่เลือก

ยึด "วันจัดงาน" เป็นตัวกรองช่วงเวลา ไม่ใช่วันที่กดลงทะเบียน
เพราะคนถามว่า "เดือนนี้กิจกรรมเป็นยังไง" หมายถึงงานที่จัดเดือนนี้
ไม่ใช่งานเดือนหน้าที่บังเอิญมีคนกดลงทะเบียนไว้เดือนนี้

เดิมบล็อกนี้กรองจากวันลงทะเบียน ส่วนกราฟแนวโน้มกรองจากวันจัดงาน
สองตัวเลขในหน้าเดียวกันจึงนับคนละชุดและไม่มีทางตรงกัน

คืนสองอัตราที่คนละความหมายกัน และตั้งชื่อให้ต่างกันชัด ๆ

	audience     จำนวนพนักงานทั้งหมดในขอบเขตของตัวกรอง = ตัวหารของทั้งหน้า
	joinRate     เฉลี่ยคนเข้าร่วมต่อหนึ่งกิจกรรม / พนักงานทั้งหมด
	noShowRate   ส่วนที่เหลือจาก 100% คือสัดส่วนพนักงานที่ไม่ได้มา

ส่งตัวหารออกไปแสดงบนหน้าจอด้วย ผู้ดูแลจะได้ตรวจทานเลขเปอร์เซ็นต์เองได้
ตัวเลขที่ตรวจทานไม่ได้คือตัวเลขที่ต้องเชื่อทั้งดุ้น ซึ่งพอผิดขึ้นมาก็ไม่มีใครจับได้
*/
func eventStats(f analyticsFilter) (web.Map, error) {
	audience, err := activeAudience(f)
	if err != nil {
		return nil, err
	}

	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	/*
		ตัวกรองกิจกรรมต้องมีตรงนี้ด้วย

		บล็อกนี้คือการ์ดสี่ใบหัวหน้าจอ ซึ่งเป็นตัวเลขที่คนอ่านก่อนเพื่อน
		ของเดิมไม่ได้ใส่เงื่อนไขกิจกรรมไว้ เลือกกิจกรรมเดียวแล้วกราฟข้างล่างเปลี่ยน
		แต่การ์ดสี่ใบยังเป็นของทั้งช่วงอยู่ กลายเป็นตัวเลขสองชุดบนหน้าจอเดียวกัน
		ที่นับคนละขอบเขตโดยไม่มีอะไรบอก
	*/
	clause += f.eventClause("e.id", f.event, &args)

	/*
		นับ "เฉลี่ยต่อหนึ่งกิจกรรม" ไม่ใช่ผลรวมของทุกกิจกรรม

		เดิมเอาจำนวนการเข้าร่วมทั้งหมดในช่วงมาหารด้วยจำนวนพนักงาน
		เดือนที่จัดสามงานแล้วคนเดิมไปครบทั้งสามงาน จะถูกนับเป็นสามครั้ง
		อัตราจึงทะลุ 100% ได้สบาย ๆ (ที่เจอจริงคือ 183.87%)
		ซึ่งอ่านไม่ได้ความหมาย เพราะเกินจำนวนคนที่มีอยู่จริง

		เฉลี่ยต่องานตอบคำถามที่คนถามจริง ๆ ว่า "จัดงานหนึ่งครั้ง คนมากี่ % ขององค์กร"
		และใช้สูตรเดียวกับกราฟแนวโน้ม ตัวเลขสองที่จึงตรงกัน
	*/
	row, err := store.QueryOne(`
		WITH per_event AS (
		  SELECT e.id,
		         count(r.id)::int AS registered,
		         count(r.id) FILTER (WHERE r.status = 'attended')::int AS attended
		  FROM events e
		  JOIN event_registrations r ON r.event_id = e.id
		  JOIN users u ON u.id = r.user_id
		  WHERE e.event_date >= $1 AND e.event_date < $2`+publishedEvents+clause+`
		  GROUP BY e.id
		)
		SELECT COALESCE(sum(registered), 0)::int AS registered,
		       COALESCE(sum(attended), 0)::int   AS attended,
		       COALESCE(avg(attended), 0)::float AS avg_attended,
		       count(*)::int                     AS events
		FROM per_event`, args...)
	if err != nil {
		return nil, err
	}

	registered := toInt(row["registered"])
	attended := toInt(row["attended"])
	avgAttended, _ := row["avg_attended"].(float64)

	/*
		สองอัตรานี้บวกกันได้ 100% เสมอ เพราะใช้ตัวหารเดียวกันคือพนักงานทั้งหมด

		เดิม "ไม่เข้าร่วม" หารด้วยจำนวนคนที่ลงทะเบียน ซึ่งเป็นคนละตัวหารกับ
		"อัตราการเข้าร่วม" ที่หารด้วยพนักงานทั้งหมด สองเลขข้างกันจึงเทียบกันไม่ได้
		และทำให้เกิดภาพแปลก ๆ อย่างเข้าร่วม 26.27% คู่กับไม่เข้าร่วม 0%
		ซึ่งอ่านแล้วขัดกันเองทั้งที่แต่ละตัวถูกตามนิยามของมัน
	*/
	joinRate := capPercent(avgAttended / float64(audience) * 100)

	/*
		ส่งจำนวนกิจกรรมที่ถูกเฉลี่ยออกไปด้วย

		ตัวหารของเปอร์เซ็นต์คือจำนวนพนักงาน แต่ตัวเศษคือ "ค่าเฉลี่ยจาก N กิจกรรม"
		ถ้าหน้าจอไม่บอก N คนอ่านจะแยกไม่ออกว่ากำลังดูค่าเฉลี่ยของทั้งปี
		หรือดูกิจกรรมเดียว ซึ่งเป็นสองความหมายที่ตัดสินใจต่างกันคนละเรื่อง
		เลือกกิจกรรมเดียว N = 1 ค่าเฉลี่ยจึงเท่ากับอัตราของกิจกรรมนั้นพอดี
	*/
	return web.Map{
		"registered": registered,
		"attended":   attended,
		"audience":   audience,
		"events":     toInt(row["events"]),
		"noShow":     registered - attended,
		"joinRate":   round2(joinRate),
		"noShowRate": round2(100 - joinRate),
	}, nil
}

/*
capPercent ไม่ให้เปอร์เซ็นต์ทะลุ 100

ยังมีทางที่ตัวเศษจะมากกว่าตัวหารได้อยู่ เช่น คนที่ลาออกไปแล้ว (ไม่นับในตัวหาร)
เคยเข้าร่วมกิจกรรมในช่วงที่กำลังดูอยู่ (นับในตัวเศษ)

กรณีแบบนั้นแปลว่า "เกือบทุกคนมา" ไม่ใช่ "มามากกว่าจำนวนคนที่มี"
แสดง 100% จึงใกล้ความจริงกว่าแสดงตัวเลขที่อ่านแล้วงง
*/
func capPercent(value float64) float64 {
	if value > 100 {
		return 100
	}
	if value < 0 {
		return 0
	}
	return value
}

/*
activeAudience คือตัวหารที่ทุกบล็อกในหน้านี้ใช้ร่วมกัน

พนักงานที่ยังทำงานอยู่และอยู่ในขอบเขตของตัวกรองแผนก/ระดับ
ถ้าแต่ละบล็อกไปนับตัวหารเอง เปอร์เซ็นต์ในหน้าเดียวกันจะเทียบกันไม่ได้

คืนอย่างน้อย 1 เสมอ กันหารด้วยศูนย์ตอนกรองจนไม่เหลือใคร
*/
func activeAudience(f analyticsFilter) (int, error) {
	args := []any{}
	clause := f.userClause("u", &args)

	count, err := store.Count(`
		SELECT count(*) FROM users u
		WHERE u.role = 'user' AND u.status = 'Active'`+clause, args...)
	if err != nil {
		return 1, err
	}
	if count < 1 {
		return 1, nil
	}
	return int(count), nil
}

// แนวโน้มอัตราการเข้าร่วมรายเดือน
func attendanceTrend(f analyticsFilter) ([]store.Row, error) {
	/*
		อัตราการเข้าร่วมเฉลี่ยต่อกิจกรรม

		คิดจาก "เฉลี่ยแต่ละกิจกรรมมีคนเข้าร่วมกี่เปอร์เซ็นต์ของพนักงานทั้งหมด"
		เดือนไหนจัดสามงานแล้วมีคนมางานละราว ๆ หนึ่งในสี่ขององค์กร ก็จะได้ประมาณ 25%
		อ่านแล้วรู้ทันทีว่าเดือนนั้นกิจกรรมดึงคนได้ดีแค่ไหน และเทียบข้ามเดือนได้

		ใช้กติกาเดียวกับอีกสองตัววัดในหน้านี้
		  ช่วงเวลา   ยึดวันจัดงาน ไม่ใช่วันที่กดลงทะเบียน
		  การเข้าร่วม นับเฉพาะรายการที่ได้รับคะแนนแล้ว
		  ตัวหาร     เฉพาะพนักงานที่ยังทำงานอยู่ และอยู่ในขอบเขตของตัวกรอง

		เติมเดือนที่ไม่มีกิจกรรมให้ครบช่วงด้วย เส้นกราฟจะได้ไม่เหลือจุดเดียว
	*/
	audience, err := activeAudience(f)
	if err != nil {
		return nil, err
	}

	args := []any{f.since, f.until, audience}
	clause := f.userClause("u", &args)

	// เลือกกิจกรรมเดียว เส้นกราฟจะเหลือเฉพาะเดือนที่กิจกรรมนั้นจัด
	// เดือนอื่นยังอยู่บนแกนเวลาแต่เป็นช่องว่าง ไม่ใช่ศูนย์ จะได้ไม่อ่านเป็น "จัดแล้วไม่มีคนมา"
	clause += f.eventClause("e.id", f.event, &args)

	return store.Query(`
		WITH months AS (
		  SELECT to_char(m, 'YYYY-MM') AS month
		  FROM generate_series(
		    date_trunc('month', $1::timestamptz),
		    date_trunc('month', $2::timestamptz - interval '1 day'),
		    interval '1 month'
		  ) AS m
		),
		per_event AS (
		  SELECT to_char(date_trunc('month', e.event_date), 'YYYY-MM') AS month,
		         e.id,
		         /* นับเฉพาะคนที่มาจริง ให้ตรงกับคำว่า "เข้าร่วม" ที่ใช้ทั้งหน้า
		            เดิมนับทุกคนที่กดลงทะเบียน ซึ่งรวมคนที่ไม่มาด้วย */
		         count(r.id) FILTER (WHERE r.status = 'attended')::int AS joined
		  FROM events e
		  LEFT JOIN event_registrations r ON r.event_id = e.id
		  LEFT JOIN users u ON u.id = r.user_id
		  /*
		     นับกิจกรรมที่เผยแพร่แล้วทุกงานในช่วง ไม่ต้องรอให้งานจบ

		     งานที่เปิดรับอยู่ก็นับทันที เพราะยอดลงทะเบียนเป็นข้อมูลที่ใช้ได้แล้ว
		     ผู้ดูแลจะได้เห็นว่างานที่กำลังเปิดรับมีคนสนใจแค่ไหนตั้งแต่ตอนนี้
		     ไม่ต้องรอจนงานจบถึงจะรู้

		     งานที่ยังไม่มีใครลงทะเบียนนับเป็น 0 ในค่าเฉลี่ย ไม่ใช่ข้ามไป
		     เพราะงานที่เปิดแล้วไม่มีคนสนใจก็เป็นข้อมูลที่ต้องเห็น
		  */
		  WHERE e.event_date >= $1 AND e.event_date < $2`+publishedEvents+``+clause+`
		  GROUP BY 1, e.id
		),
		by_month AS (
		  SELECT month, count(*)::int AS events, avg(joined)::float AS avg_joined
		  FROM per_event GROUP BY month
		)
		SELECT months.month,
		       COALESCE(by_month.events, 0)                               AS events,
		       COALESCE(round(by_month.avg_joined::numeric, 1), 0)::float AS avg_joined,
		       /* ไม่ให้ทะลุ 100% ด้วยเหตุผลเดียวกับการ์ดสถิติ
		          คนที่ลาออกไปแล้วไม่ถูกนับในตัวหาร แต่ยังอยู่ในประวัติการเข้าร่วม */
		       LEAST(COALESCE(round(by_month.avg_joined::numeric * 100 / $3, 1), 0), 100)::float AS rate,
		       (by_month.month IS NOT NULL) AS has_data
		FROM months LEFT JOIN by_month USING (month)
		ORDER BY months.month`, args...)
}

// กิจกรรมที่ได้รับความสนใจสูงสุด
func topEvents(f analyticsFilter) ([]store.Row, error) {
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)
	clause += f.eventClause("e.id", f.event, &args)

	/*
		สัดส่วนที่แสดงคือ "เข้าร่วมกี่คน จากพนักงานทั้งหมดกี่คน"

		เดิมหารด้วย capacity ของแต่ละกิจกรรม ซึ่งผู้ดูแลตั้งไว้ไม่เท่ากัน
		บางงานตั้ง 500 บางงานไม่ตั้งเลย (0 = ไม่จำกัด แล้วนับเป็น 100%)
		ตัวเลขที่ได้จึงเทียบกันไม่ได้ — กิจกรรมที่มีคนเข้าร่วมเท่ากัน 4 คน
		กลับแสดง 0.8% กับ 100% อยู่ข้างกัน และไม่ตรงกับความยาวของแถบด้วย

		เปลี่ยนมาหารด้วยจำนวนพนักงานทั้งหมด ซึ่งเป็นตัวหารเดียวกันทุกแถว
		อ่านแล้วเทียบกันได้จริง และตรงกับความยาวแถบ
	*/
	audience, err := activeAudience(f)
	if err != nil {
		return nil, err
	}

	/*
	   ยึดวันจัดงานเหมือนบล็อกอื่น และนับเฉพาะคนที่มาจริง

	   เดิมกรองจากวันที่กดลงทะเบียน งานเดือนหน้าที่เปิดรับล่วงหน้า
	   จึงโผล่ขึ้นมาติดอันดับของเดือนนี้ ทั้งที่ยังไม่ได้จัด
	*/
	rows, err := store.Query(`
		SELECT e.title, e.capacity,
		       count(r.id) FILTER (WHERE r.status = 'attended')::int AS joined
		FROM events e
		JOIN event_registrations r ON r.event_id = e.id
		JOIN users u ON u.id = r.user_id
		WHERE e.event_date >= $1 AND e.event_date < $2`+publishedEvents+clause+`
		GROUP BY e.id ORDER BY joined DESC LIMIT 5`, args...)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		joined := toInt(row["joined"])
		row["audience"] = audience
		row["rate"] = round2(float64(joined) * 100 / float64(audience))
	}
	return rows, nil
}

// ความถี่การเข้าร่วมของพนักงาน แบ่งเป็นช่วง
func joinFrequency(f analyticsFilter) (web.Map, error) {
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	// ตัวกรองกิจกรรมอยู่ในคิวรีย่อย จึงต้องแยกตัวแปรกัน ไม่ปนกับ clause ของ users
	eventOnly := f.eventClause("e.id", f.event, &args)

	rows, err := store.Query(`
		WITH counted AS (
		  SELECT u.id,
		         -- ไม่นับกิจกรรมร่าง ให้ตรงกับการ์ดอื่นในหน้าเดียวกัน
		         (SELECT count(*) FROM event_registrations r
		          JOIN events e ON e.id = r.event_id
		          WHERE r.user_id = u.id AND r.status = 'attended'
		                -- ยึดวันจัดงานเหมือนบล็อกอื่นในหน้าเดียวกัน ไม่ใช่วันที่กดลงทะเบียน
		                AND e.event_date >= $1 AND e.event_date < $2`+publishedEvents+eventOnly+`) AS times
		  -- ตัดคนที่ลาออกออก ใช้ตัวหารชุดเดียวกับทั้งหน้า (activeAudience)
		  -- ไม่งั้นยอดรวมกลางโดนัทจะมากกว่าจำนวนพนักงานที่การ์ดด้านบนบอก
		  FROM users u WHERE u.role = 'user' AND u.status = 'Active'`+clause+`
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
	/*
		อัตราการมีส่วนร่วมเฉลี่ยตามแผนก

		    (จำนวนผู้เข้าร่วมเฉลี่ยต่อกิจกรรมของแผนก ÷ จำนวนพนักงานทั้งหมดในแผนก) × 100

		เฉลี่ยหารด้วยจำนวนกิจกรรมทั้งหมดในช่วง ไม่ใช่เฉพาะกิจกรรมที่แผนกนั้นไป
		ไม่งั้นแผนกที่ไปงานเดียวแต่ไปกันครบจะได้ 100% เท่ากับแผนกที่ไปครบทุกงาน
		ซึ่งอ่านแล้วเข้าใจผิดว่ามีส่วนร่วมเท่ากัน

		ใช้วิธีเดียวกับกราฟแนวโน้ม คือมองที่ "เฉลี่ยต่อกิจกรรม" ตัวเลขสองที่จึงเทียบกันได้
	*/
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	// เลือกกิจกรรมเดียว ตารางนี้จะกลายเป็น "แต่ละแผนกมางานนี้กี่ %"
	eventOnly := f.eventClause("e.id", f.event, &args)

	return store.Query(`
		WITH staff AS (
		  SELECT u.id, u.department FROM users u
		  -- ตัดคนที่ลาออกออกเหมือนบล็อกอื่น ไม่งั้นแผนกที่มีคนลาออกจะถูกหารด้วยหัวที่ไม่มีอยู่แล้ว
		  -- แล้วอัตราของแผนกนั้นจะต่ำกว่าความจริงโดยไม่มีอะไรบอก
		  WHERE u.role = 'user' AND u.status = 'Active' AND u.department <> ''`+clause+`
		),
		dept AS (
		  SELECT department, count(*)::int AS people FROM staff GROUP BY department
		),
		evs AS (
		  -- กิจกรรมที่เผยแพร่แล้วทุกงานในช่วง ไม่ต้องรอให้งานจบ
		  -- งานที่ยังไม่มีคนลงทะเบียนนับเป็น 0 ในค่าเฉลี่ย ไม่ใช่ข้ามไป
		  SELECT e.id FROM events e
		  WHERE e.event_date >= $1 AND e.event_date < $2`+publishedEvents+eventOnly+`
		),
		joined AS (
		  SELECT s.department, count(*)::int AS total
		  FROM event_registrations r
		  JOIN staff s ON s.id = r.user_id
		  JOIN evs ON evs.id = r.event_id
		  WHERE r.status = 'attended'
		  GROUP BY s.department
		)
		SELECT d.department,
		       d.people,
		       /*
		          ส่งตัวเลขดิบไปด้วย ไม่ส่งแต่ค่าเฉลี่ย

		          ค่าเฉลี่ยอย่าง 3 ÷ 8 = 0.375 ปัดกี่ตำแหน่งก็ไม่ลงตัว
		          ผู้อ่านที่ลองคำนวณตามจะได้เลขไม่ตรงกับอัตราที่แสดงข้าง ๆ
		          แล้วคิดว่าระบบคำนวณผิด ส่งจำนวนครั้งกับจำนวนกิจกรรมไปตรง ๆ
		          หน้าเว็บจึงเขียนได้ว่า "เข้าร่วมรวม 3 ครั้ง จาก 8 กิจกรรม"
		       */
		       COALESCE(j.total, 0)::int AS attendances,
		       (SELECT count(*) FROM evs)::int AS events,
		       CASE WHEN (SELECT count(*) FROM evs) > 0
		            THEN round(COALESCE(j.total, 0)::numeric / (SELECT count(*) FROM evs), 2)
		            ELSE 0 END::float AS joined,
		       CASE WHEN (SELECT count(*) FROM evs) > 0 AND d.people > 0
		            THEN round(COALESCE(j.total, 0)::numeric * 100
		                       / (SELECT count(*) FROM evs) / d.people, 1)
		            ELSE 0 END::float AS rate
		FROM dept d
		LEFT JOIN joined j ON j.department = d.department
		ORDER BY rate DESC, d.department`, args...)
}

/* ---------- 2. การวิเคราะห์คะแนน ---------- */

func pointStats(f analyticsFilter) (web.Map, error) {
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	row, err := store.QueryOne(`
		SELECT COALESCE(sum(t.points) FILTER (WHERE t.points > 0),0)::int AS given,
		       COALESCE(sum(-t.points) FILTER (WHERE t.points < 0),0)::int AS used
		FROM point_transactions t
		JOIN users u ON u.id = t.user_id
		WHERE t.created_at >= $1 AND t.created_at < $2`+clause, args...)
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
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	/*
		เลือกกิจกรรมเดียว = ดูเฉพาะคะแนนที่แจกจากกิจกรรมนั้น

		แท่ง "คะแนนที่ใช้ไป" จะเป็นศูนย์เสมอ เพราะการแลกของรางวัลไม่ได้ผูกกับกิจกรรม
		ไม่ใช่ข้อผิดพลาด แต่เป็นความจริงที่ว่าคะแนนที่ใช้ไปแยกไม่ได้ว่ามาจากงานไหน
		เส้นยอดสะสมจึงกลายเป็น "คะแนนที่งานนี้แจกไปแล้วทั้งหมด"

		ใส่เงื่อนไขเดียวกันทั้ง opening และ moved ไม่งั้นยอดยกมาจะเป็นของทั้งระบบ
		แต่ยอดรายเดือนเป็นของกิจกรรมเดียว เส้นกับแท่งจะคนละเรื่องกัน
	*/
	clause += f.eventClause("t.event_id", f.event, &args)

	/*
		เติมเดือนที่ไม่มีรายการให้ครบทั้งช่วงที่เลือก

		เดิมคืนเฉพาะเดือนที่มีรายการ เดือนที่ว่างจะหายไปจากกราฟเลย
		แท่งสองเดือนที่ห่างกันครึ่งปีจึงวางติดกัน ทำให้อ่านแนวโน้มผิด
		generate_series สร้างทุกเดือนในช่วงมาก่อน แล้วค่อย LEFT JOIN ข้อมูลจริง
		เดือนที่ไม่มีรายการจะได้ค่า 0 และยังกินพื้นที่บนแกนเวลาตามจริง
	*/
	return store.Query(`
		WITH months AS (
		  SELECT to_char(m, 'YYYY-MM') AS month
		  FROM generate_series(
		    date_trunc('month', $1::timestamptz),
		    date_trunc('month', $2::timestamptz - interval '1 day'),
		    interval '1 month'
		  ) AS m
		),
		opening AS (
		  -- คะแนนที่ค้างอยู่ในระบบก่อนเริ่มช่วงที่เลือก
		  SELECT COALESCE(sum(t.points), 0)::int AS total
		  FROM point_transactions t
		  JOIN users u ON u.id = t.user_id
		  WHERE t.created_at < $1`+clause+`
		),
		moved AS (
		  SELECT to_char(date_trunc('month', t.created_at), 'YYYY-MM') AS month,
		         COALESCE(sum(t.points) FILTER (WHERE t.points > 0),0)::int AS given,
		         COALESCE(sum(-t.points) FILTER (WHERE t.points < 0),0)::int AS used
		  FROM point_transactions t
		  JOIN users u ON u.id = t.user_id
		  WHERE t.created_at >= $1 AND t.created_at < $2`+clause+`
		  GROUP BY 1
		)
		SELECT months.month,
		       COALESCE(moved.given, 0) AS given,
		       COALESCE(moved.used, 0)  AS used,
		       -- เดือนที่ไม่มีรายการเลย หน้าเว็บจะเว้นว่างไว้ ไม่วาดแท่งเป็นศูนย์
		       (moved.month IS NOT NULL) AS has_data,
		       /*
		          ยอดคงเหลือสะสม ณ สิ้นเดือนนั้น

		          เริ่มนับจากยอดที่ค้างอยู่ก่อนเข้าช่วงที่เลือก ไม่ใช่เริ่มจากศูนย์
		          ถ้าเริ่มจากศูนย์ เส้นในเดือนแรก ๆ จะต่ำกว่าแท่งเสมอ
		          เพราะยอดสะสมของเดือนเดียวย่อมน้อยกว่าคะแนนที่แจกทั้งเดือน
		          ทั้งที่ความจริงองค์กรมีคะแนนค้างในระบบอยู่ก่อนแล้ว
		       */
		       (opening.total + sum(COALESCE(moved.given,0) - COALESCE(moved.used,0))
		          OVER (ORDER BY months.month))::int AS balance
		FROM months
		LEFT JOIN moved USING (month)
		CROSS JOIN opening
		ORDER BY months.month`, args...)
}

/* ---------- 3. การวิเคราะห์ของรางวัล ---------- */

func rewardSplit(f analyticsFilter) (web.Map, error) {
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	rows, err := store.Query(`
		SELECT w.name, count(*)::int AS times,
		       COALESCE(sum(d.points_used),0)::int AS points
		FROM redemptions d
		JOIN rewards w ON w.id = d.reward_id
		JOIN users u ON u.id = d.user_id
		WHERE d.redeemed_at >= $1 AND d.redeemed_at < $2`+clause+`
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
	args := []any{f.since, f.until}
	clause := f.userClause("u", &args)

	return store.Query(`
		SELECT w.name, count(*)::int AS redeemed,
		       COALESCE(sum(d.points_used),0)::int AS points
		FROM redemptions d
		JOIN rewards w ON w.id = d.reward_id
		JOIN users u ON u.id = d.user_id
		WHERE d.redeemed_at >= $1 AND d.redeemed_at < $2`+clause+`
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

/*
AdminFrequencyPeople คืนรายชื่อพนักงานในช่วงความถี่ที่เลือกจากโดนัท

หน้าวิเคราะห์บอกได้แค่ว่ามีกี่คนในแต่ละช่วง แต่คำถามถัดไปของผู้ดูแลคือ
"แล้วใครบ้าง" โดยเฉพาะช่วงที่ไม่เคยเข้าร่วมเลย ซึ่งเป็นกลุ่มที่ต้องตามต่อ
เส้นทางนี้จึงรับช่วงที่กดมาแล้วคืนรายชื่อพร้อมจำนวนครั้งที่เข้าร่วม

ใช้ตัวกรองชุดเดียวกับหน้าวิเคราะห์ เพื่อให้ตัวเลขตรงกับที่เห็นในโดนัท
*/
func AdminFrequencyPeople(w http.ResponseWriter, r *http.Request) {
	f := readFilter(r)
	bucket := web.Param(r, "bucket", "")

	// แปลงชื่อช่วงเป็นเงื่อนไขของจำนวนครั้ง
	var condition string
	switch bucket {
	case "0":
		condition = "times = 0"
	case "1":
		condition = "times = 1"
	case "2-3":
		condition = "times BETWEEN 2 AND 3"
	case "4-5":
		condition = "times BETWEEN 4 AND 5"
	case "5+":
		condition = "times > 5"
	default:
		web.Error(w, http.StatusBadRequest, "ช่วงความถี่ไม่ถูกต้อง")
		return
	}

	args := []any{f.since, f.until}
	eventOnly := f.eventClause("e.id", f.event, &args)
	clause := f.userClause("u", &args)

	/*
		รายชื่อในช่องนี้ต้องนับด้วยกติกาเดียวกับโดนัทที่กดมา

		เดิมต่างกันสามจุด กดช่อง "ไป 2-3 ครั้ง" แล้วได้รายชื่อไม่ตรงกับตัวเลขบนช่อง
		  - โดนัทยึดวันจัดงาน ตรงนี้ยึดวันที่กดลงทะเบียน
		  - โดนัทกรองตามกิจกรรมที่เลือก ตรงนี้ไม่กรอง
		  - ทั้งคู่ไม่ได้ตัดคนที่ลาออกออก (แก้พร้อมกันที่บล็อกโดนัท)
	*/
	people, err := store.Query(`
		WITH counted AS (
		  SELECT u.id, u.employee_code, u.display_name, u.department, u.position, u.branch, u.tier,
		         (SELECT count(*) FROM event_registrations r
		          JOIN events e ON e.id = r.event_id
		          WHERE r.user_id = u.id AND r.status = 'attended'
		            AND e.event_date >= $1 AND e.event_date < $2`+publishedEvents+eventOnly+`) AS times
		  FROM users u WHERE u.role = 'user' AND u.status = 'Active'`+clause+`
		)
		SELECT employee_code, display_name, department, position, branch, tier, times::int
		FROM counted WHERE `+condition+`
		ORDER BY times DESC, employee_code`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"bucket": bucket, "people": people, "total": len(people)})
}
