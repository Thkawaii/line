package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"rewards/config"
	"rewards/controllers"
	"rewards/security"
	"rewards/store"
)

/*
ใส่ข้อมูลทดสอบครบทุกรูปแบบ พร้อมรูปภาพ

ใช้ตอนอยากลองดูหน้าตาจริงของทุกเคส โดยไม่ต้องนั่งกรอกเอง
ของรางวัลและกิจกรรมที่ใส่ให้ครอบคลุมทุกสถานะที่ระบบรองรับ

สั่ง:  go run ./cmd/demo
ลบทิ้ง: go run ./cmd/demo clear

ข้อมูลนี้แยกจากข้อมูลตั้งต้น (bootstrap) อย่างชัดเจน
ของจริงที่ขึ้นใช้งานไม่ต้องสั่งคำสั่งนี้
*/

// รหัสผ่านของบัญชีตัวอย่างทุกคน ใช้ตัวเดียวกันเพื่อให้สลับบัญชีทดสอบได้เร็ว
// ชุดนี้สำหรับทดสอบเท่านั้น ห้ามใช้กับระบบจริง
const demoPassword = "test1234"

/*
demoUser จำกัดคำสั่งให้ทำกับพนักงานชุดทดสอบเท่านั้น

รหัสพนักงานของชุดนี้เป็นตัวเลขสี่หลักขึ้นต้น 21 หรือ 22
ต้องกรองให้ชัดก่อนแปลงรหัสเป็นตัวเลข เพราะบัญชีผู้ดูแลระบบใช้รหัสเป็นตัวอักษร
แปลงแล้วจะพัง และยังกันไม่ให้ไปแตะข้อมูลพนักงานจริงที่นำเข้ามาเองด้วย
*/
const demoUser = `u.employee_code ~ '^2[12][0-9]{2}$'`

const marker = "[ข้อมูลทดสอบ]" // ใส่ไว้ใน audit log เพื่อให้รู้ว่าชุดไหนมาจากคำสั่งนี้

func main() {
	config.LoadEnv(".env", "../.env")

	if err := config.Connect(); err != nil {
		fmt.Printf("ต่อฐานข้อมูลไม่สำเร็จ: %v\n", err)
		if hint := config.Hint(err); hint != "" {
			fmt.Printf("\n%s\n", hint)
		}
		log.Fatal("หยุดทำงาน")
	}

	if len(os.Args) > 1 && os.Args[1] == "clear" {
		clear()
		return
	}

	/*
		โหมดใส่เฉพาะตัวอย่างประชาสัมพันธ์ ไม่ล้างอะไรเลย

		คำสั่งเต็มล้างข้อมูลทั้งระบบก่อนเสมอ ซึ่งถูกต้องสำหรับเครื่องทดสอบ
		แต่ถ้าเผลอสั่งบนเครื่องที่มีข้อมูลจริง ของรางวัล กิจกรรม ประกาศ
		และคะแนนของพนักงานทุกคนจะหายไปทั้งหมด

		โหมดนี้จึงมีไว้ให้ดูตัวอย่างประชาสัมพันธ์โดยไม่ต้องเสี่ยง
		สั่งซ้ำได้ ตัวอย่างชุดเดิมจะถูกแทนที่ ไม่ใช่เพิ่มซ้อนขึ้นมาอีกชุด
	*/
	if len(os.Args) > 1 && os.Args[1] == "pr" {
		copyImages()
		insertPr()
		fmt.Println("ใส่ตัวอย่างประชาสัมพันธ์ 4 เรื่องเรียบร้อย (ข้อความ 1 · รูปภาพ 1 · วิดีโอ 2)")
		fmt.Println("ข้อมูลอื่นไม่ถูกแตะต้อง")
		return
	}

	/*
		ล้างของเดิมก่อนเสมอ

		ไม่งั้นรันซ้ำแล้วของรางวัลกับกิจกรรมจะซ้อนกันเป็นสองเท่าสามเท่า
		ซึ่งเกิดง่ายมากเวลาไล่ทดสอบ แล้วตัวเลขในรายงานจะเพี้ยนโดยไม่รู้สาเหตุ

		รันกี่ครั้งก็ได้ข้อมูลชุดเดียวกันเสมอ
	*/
	wipe()

	copyImages()
	insertEmployees()
	insertRewards()
	insertSpecialRewards()
	insertEvents()
	insertBanners()
	insertFaqs()
	insertAnnouncements()
	insertPr()
	givePoints()
	insertPointHistory()
	insertRegistrations()
	insertRedemptions()
	insertPointRequests()
	insertFeedback()
	insertNotifications()
	syncTiers()

	report()
}

// report สรุปว่าใส่อะไรลงไปบ้าง นับจากฐานข้อมูลจริง ไม่ใช่ตัวเลขที่พิมพ์ไว้ตายตัว
// ถ้าคำสั่งไหนใส่ไม่สำเร็จ ตัวเลขจะไม่ตรงและเห็นได้ทันที
func report() {
	count := func(table string) int {
		var n int
		_ = config.DB.QueryRow(`SELECT count(*) FROM ` + table).Scan(&n)
		return n
	}

	fmt.Println("ใส่ข้อมูลทดสอบเรียบร้อย")
	fmt.Println()
	fmt.Printf("  พนักงาน           %3d คน ครอบคลุม %d แผนก %d สาขา\n",
		count(`users WHERE role = 'user'`),
		count(`(SELECT DISTINCT department FROM users WHERE role='user') d`),
		count(`(SELECT DISTINCT branch FROM users WHERE role='user') b`))
	fmt.Printf("  ของรางวัล         %3d ชิ้น (แลกด้วยคะแนนพิเศษ %d ชิ้น)\n",
		count("rewards"), count(`rewards WHERE point_kind = 'special'`))
	fmt.Printf("  กิจกรรม           %3d รายการ (ตรวจตำแหน่ง %d · ให้คะแนนพิเศษ %d)\n",
		count("events"),
		count("events WHERE venue_lat IS NOT NULL"),
		count("events WHERE special_points > 0"))
	fmt.Printf("  ลงทะเบียนกิจกรรม  %3d รายการ\n", count("event_registrations"))
	fmt.Printf("  แลกของรางวัล      %3d รายการ (รอรับ %d)\n",
		count("redemptions"), count(`redemptions WHERE status = 'pending'`))
	fmt.Printf("  ผลประเมิน         %3d ชุด จาก %d กิจกรรม\n",
		count("event_feedback"), count(`(SELECT DISTINCT event_id FROM event_feedback) f`))
	fmt.Printf("  ประวัติคะแนน      %3d รายการ ย้อนหลัง 6 เดือน\n", count("point_transactions"))
	fmt.Printf("  ประกาศข่าวสาร     %3d ฉบับ · แบนเนอร์ %d · คำถามที่พบบ่อย %d · แจ้งเตือน %d\n",
		count("announcements WHERE channel = 'gate'"), count("banners"), count("faqs"), count("notifications"))
	fmt.Printf("  ประชาสัมพันธ์     %3d เรื่อง (ข้อความ %d · รูปภาพ %d · วิดีโอ %d)\n",
		count("announcements WHERE channel = 'pr'"),
		count("announcements WHERE channel = 'pr' AND kind = 'text'"),
		count("announcements WHERE channel = 'pr' AND kind = 'image'"),
		count("announcements WHERE channel = 'pr' AND kind = 'video'"))

	fmt.Println()
	fmt.Println("  บัญชีสำหรับทดสอบ (รหัสผ่าน test1234 ทุกคน)")
	fmt.Println("    admin / line  ผู้ดูแลระบบ ทำได้ทุกอย่าง")
	fmt.Println("    2101  HRM / Manager          หลังบ้านได้ · ปรับคะแนนได้")
	fmt.Println("    2102  GAG / Chief Officer    หลังบ้านได้ · ปรับคะแนนได้")
	fmt.Println("    2103  HRD / Officer          หลังบ้านได้ · ปรับคะแนนไม่ได้")
	fmt.Println("    2104  PDF / Manager          หลังบ้านไม่ได้ (คนละแผนก)")
	fmt.Println("    2105  PCT / Operator         พนักงานทั่วไป Elite + คะแนนพิเศษ 450")
	fmt.Println("    2212  SMD / Assembly Worker  พนักงานที่ยังไม่มีคะแนนเลย")
	fmt.Println()
	fmt.Println("  ลบข้อมูลชุดนี้ทิ้ง: go run ./cmd/demo clear")
	fmt.Println("  ใส่เฉพาะตัวอย่างประชาสัมพันธ์ โดยไม่ล้างอะไร: go run ./cmd/demo pr")
}

func exec(query string, args ...any) {
	if _, err := store.Exec(query, args...); err != nil {
		log.Fatalf("ใส่ข้อมูลไม่สำเร็จ: %v", err)
	}
}

// คัดลอกไฟล์ตัวอย่าง (รูปภาพและ PDF) เข้าโฟลเดอร์ uploads
// เพื่อให้เสิร์ฟผ่าน /uploads/ ได้เหมือนไฟล์ที่อัปโหลดเอง
func copyImages() {
	dir := controllers.UploadDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Fatal(err)
	}

	source := demoDir()
	entries, err := os.ReadDir(source)
	if err != nil {
		log.Fatalf("ไม่พบโฟลเดอร์รูปตัวอย่างที่ %s: %v", source, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		in, err := os.Open(filepath.Join(source, entry.Name()))
		if err != nil {
			log.Fatal(err)
		}
		out, err := os.Create(filepath.Join(dir, entry.Name()))
		if err != nil {
			log.Fatal(err)
		}
		if _, err := io.Copy(out, in); err != nil {
			log.Fatal(err)
		}
		in.Close()
		out.Close()
	}
}

func demoDir() string {
	for _, candidate := range []string{"db/demo", "backend/db/demo", "../db/demo"} {
		if _, err := os.Stat(candidate); err == nil {
			abs, _ := filepath.Abs(candidate)
			return abs
		}
	}
	return "db/demo"
}

/*
พนักงานเต็มองค์กร

สร้างให้ครบทุกสาขาและหลายแผนก เพื่อให้รายงานสรุปรายแผนกมีข้อมูลจริงให้ดู
ไม่ใช่มีแค่สามสี่คนแล้วทุกแผนกขึ้น 100% เหมือนกันหมด

รหัสพนักงานแบ่งเป็นช่วงให้จำง่าย

	21xx  แผนกหลังบ้าน เข้าหน้าผู้ดูแลระบบได้
	22xx  ฝ่ายผลิตและฝ่ายอื่น พนักงานทั่วไป

รหัสผ่านเหมือนกันหมดคือ test1234 ชุดนี้สำหรับทดสอบเท่านั้น
*/
type person struct {
	code, name, dept, position, branch string
	points                             int
}

var roster = []person{
	// แผนกหลังบ้าน เข้าหลังบ้านได้
	{"2101", "สุนิสา ตั้งใจดี", "HRM", "Manager", "PD", 320},
	{"2102", "ธีรพงศ์ วัฒนกิจ", "GAG", "Chief Officer", "TS", 1850},
	{"2103", "ปวีณา ศรีสุข", "HRD", "Officer", "PD", 90},
	{"2106", "วรรณา เจริญพร", "ER", "Assistant Manager", "BKK", 2400},
	{"2107", "ชัยวัฒน์ มีทรัพย์", "HR", "Co-Manager", "PD", 980},

	// ฝ่ายผลิตและฝ่ายอื่น พนักงานทั่วไป
	{"2104", "อนุชา มั่นคง", "PDF", "Manager", "PD", 640},
	{"2105", "กิตติพงษ์ ใจกล้า", "PCT", "Operator", "TS", 5200},
	{"2201", "สมหมาย รักงาน", "PDF", "Welder", "PD", 1200},
	{"2202", "จันทร์เพ็ญ ขยันยิ่ง", "PDF", "Inspector", "PD", 450},
	{"2203", "ประสิทธิ์ ตั้งมั่น", "PDF", "Leader", "PD", 2100},
	{"2204", "นภา พูนผล", "PCT", "Clerk", "TS", 80},
	{"2205", "วิชัย เกียรติยศ", "PCT", "Senior Engineer", "TS", 3100},
	{"2206", "อรทัย สมบูรณ์", "QAS", "Inspector", "PD", 760},
	{"2207", "ธนากร กล้าหาญ", "QCS", "Chief Engineer", "PD", 1640},
	{"2208", "มาลี ศรีทอง", "ACC", "Senior Officer", "BKK", 540},
	{"2209", "สุรชัย ใจเย็น", "ITS", "Engineer", "BKK", 1980},
	{"2210", "กนกวรรณ ดีงาม", "LOG", "Coordinator", "TS", 260},
	{"2211", "พิชิต เรืองฤทธิ์", "MTS", "Maintenance", "TS", 1450},
	{"2212", "สมใจ รุ่งเรือง", "SMD", "Assembly Worker", "PD", 0},
	{"2213", "เอกชัย พัฒนา", "ERG", "Specialist", "PD", 2850},
	{"2214", "รุ่งทิพย์ แสงจันทร์", "FNS", "Officer", "BKK", 420},
	{"2215", "ณรงค์ชัย ถาวร", "PCM", "Supervisor", "PD", 1100},
}

func insertEmployees() {
	// สร้างค่า bcrypt จากรหัสผ่านจริงตอนรัน ไม่ฝังค่าตายตัวไว้
	// ค่า bcrypt ที่คัดลอกมาจากที่อื่นมักไม่ตรงกับรหัสผ่านที่คิดว่าใช่
	// แล้วจะได้บัญชีที่ล็อกอินไม่ได้โดยไม่มีอะไรฟ้อง
	hash, err := security.HashPassword(demoPassword)
	if err != nil {
		log.Fatalf("สร้างรหัสผ่านตัวอย่างไม่สำเร็จ: %v", err)
	}

	for _, p := range roster {
		exec(`
			INSERT INTO users (employee_code, username, password_hash, display_name,
			                   department, position, branch, role, status,
			                   terms_accepted_at)
			VALUES ($1, $1, $2, $3, $4, $5, $6, 'user', 'Active', now())
			ON CONFLICT (employee_code) DO NOTHING`,
			p.code, hash, p.name, p.dept, p.position, p.branch)
	}
}

/*
ประวัติคะแนนย้อนหลังหกเดือน

กราฟการเคลื่อนไหวของคะแนนต้องมีข้อมูลหลายเดือนถึงจะอ่านแนวโน้มออก
ถ้าใส่ทุกรายการไว้ที่วันนี้วันเดียว กราฟจะเหลือแท่งเดียวและดูไม่ออกว่าใช้งานได้ไหม

กระจายให้เดือนเก่าได้คะแนนน้อยกว่าเดือนใหม่ เพื่อให้เห็นเส้นแนวโน้มขยับจริง
และใส่รายการใช้คะแนนปนไปด้วย กราฟจะได้มีแท่งสองสีทุกเดือน
*/
func insertPointHistory() {
	for monthsAgo := 5; monthsAgo >= 0; monthsAgo-- {
		// เดือนยิ่งใหม่ยิ่งแจกเยอะ จำลองการใช้งานที่โตขึ้นเรื่อย ๆ
		base := 60 + (5-monthsAgo)*25

		exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points, created_at)
			SELECT u.id, 'earn', 'event', $1,
			       $2 + (u.employee_code::int % 5) * 20,
			       date_trunc('month', now()) - make_interval(months => $3) + interval '8 days'
			FROM users u WHERE u.role = 'user' AND `+demoUser+``,
			marker+" เข้าร่วมกิจกรรมประจำเดือน", base, monthsAgo)

		// เดือนเว้นเดือนมีการแลกของรางวัล จะได้เห็นทั้งเดือนที่มีและไม่มีแท่งสีน้ำเงิน
		if monthsAgo%2 == 0 {
			exec(`
				INSERT INTO point_transactions (user_id, kind, source, title, points, created_at)
				SELECT u.id, 'redeem', 'reward', $1, -(80 + (u.employee_code::int % 3) * 40),
				       date_trunc('month', now()) - make_interval(months => $2) + interval '20 days'
				FROM users u WHERE u.role = 'user' AND `+demoUser+` AND u.employee_code LIKE '22%'`,
				marker+" แลกของรางวัล", monthsAgo)
		}
	}
}

/*
การลงทะเบียนกิจกรรม

ตั้งใจให้แต่ละแผนกมีสัดส่วนไม่เท่ากัน รายงานสรุปรายแผนกจะได้เห็นความต่างจริง
ไม่ใช่ทุกแผนกขึ้น 100% หรือ 0% เหมือนกันหมดจนดูไม่ออกว่าคำนวณถูกไหม

	งานใหญ่    คนมาเกือบหมด
	งานอบรม    มาเฉพาะบางแผนก
	งานโหวต    มาไม่กี่คน
*/
func insertRegistrations() {
	/*
		เลื่อนสามงานที่จะมีคนลงทะเบียนให้จบไปแล้ว

		ตัววัดที่เฉลี่ยต่อกิจกรรมนับเฉพาะงานที่จบแล้ว ถ้าทุกงานอยู่ในอนาคต
		หน้าภาพรวมจะขึ้น 0% ทั้งหน้าและดูไม่ออกว่าคำนวณถูกไหม
		วันที่ตรงกับวันที่ลงทะเบียนด้านล่าง เรื่องราวจึงสมเหตุสมผล
	*/
	exec(`UPDATE events SET event_date = CURRENT_DATE - 20, end_date = NULL
	      WHERE title LIKE 'Sport Day%'`)
	exec(`UPDATE events SET event_date = CURRENT_DATE - 12, end_date = NULL
	      WHERE title LIKE 'อบรมความปลอดภัยประจำปี%'`)
	exec(`UPDATE events SET event_date = CURRENT_DATE - 3, end_date = NULL
	      WHERE title LIKE '9.9%'`)

	// งานใหญ่ คนมาเยอะ ได้คะแนนไปแล้ว
	exec(`
		INSERT INTO event_registrations (event_id, user_id, status, checked_in_at, created_at)
		SELECT e.id, u.id, 'attended', now() - interval '20 days', now() - interval '20 days'
		FROM events e CROSS JOIN users u
		WHERE e.title LIKE 'Sport Day%' AND u.role = 'user'
		  AND ` + demoUser + ` AND (u.employee_code::int % 4) <> 0
		ON CONFLICT DO NOTHING`)

	// งานอบรม มาเฉพาะฝ่ายผลิต
	exec(`
		INSERT INTO event_registrations (event_id, user_id, status, checked_in_at, created_at)
		SELECT e.id, u.id, 'attended', now() - interval '12 days', now() - interval '12 days'
		FROM events e CROSS JOIN users u
		WHERE e.title LIKE 'อบรมความปลอดภัย%' AND u.role = 'user'
		  AND u.department IN ('PDF','PCT','MTS','QCS','SMD')
		ON CONFLICT DO NOTHING`)

	// งานวิชาการ มาเฉพาะฝ่ายสำนักงาน
	exec(`
		INSERT INTO event_registrations (event_id, user_id, status, checked_in_at, created_at)
		SELECT e.id, u.id, 'attended', now() - interval '3 days', now() - interval '3 days'
		FROM events e CROSS JOIN users u
		WHERE e.title LIKE '9.9%' AND u.role = 'user'
		  AND u.department IN ('ACC','ITS','FNS','HRM','HRD','GAG','ER','HR','LOG')
		ON CONFLICT DO NOTHING`)

	// งานโหวต มาไม่กี่คน
	exec(`
		INSERT INTO event_registrations (event_id, user_id, option_id, status, created_at)
		SELECT e.id, u.id,
		       (SELECT o.id FROM event_options o WHERE o.event_id = e.id
		        ORDER BY o.id LIMIT 1 OFFSET (u.employee_code::int % 2)),
		       'attended', now() - interval '5 days'
		FROM events e CROSS JOIN users u
		WHERE e.kind = 'vote' AND u.role = 'user' AND ` + demoUser + `
		  AND (u.employee_code::int % 3) = 0
		ON CONFLICT DO NOTHING`)
}

/*
การแลกของรางวัล

ใส่ทั้งที่รอรับและรับไปแล้ว หน้าจัดการของรางวัลจะได้มีทั้งสองสถานะให้ทดสอบ
*/
func insertRedemptions() {
	exec(`
		INSERT INTO redemptions (user_id, reward_id, ref_code, points_used, status,
		                         redeemed_at, received_at)
		SELECT u.id, r.id,
		       'RW-' || to_char(now(), 'YYMMDD') || '-' || u.employee_code,
		       r.points,
		       CASE WHEN (u.employee_code::int % 2) = 0 THEN 'received' ELSE 'pending' END,
		       now() - make_interval(days => (u.employee_code::int % 25)),
		       CASE WHEN (u.employee_code::int % 2) = 0
		            THEN now() - make_interval(days => (u.employee_code::int % 25)) END
		FROM users u
		JOIN rewards r ON r.point_kind = 'point' AND r.status = 'active'
		WHERE u.role = 'user' AND ` + demoUser + ` AND u.employee_code LIKE '22%'
		  AND (u.employee_code::int % 3) = 0
		  AND r.id = (SELECT min(id) FROM rewards WHERE point_kind = 'point' AND status = 'active')
		ON CONFLICT DO NOTHING`)

	// ใส่รายการที่ยกเลิกไว้ด้วย ชิป "ยกเลิก" ในหน้ารายการแลกจะได้ไม่เป็นศูนย์ตลอด
	// และได้เห็นว่าสีกับป้ายสถานะแสดงถูกต้อง
	exec(`
		UPDATE redemptions SET status = 'cancelled', received_at = NULL
		WHERE id IN (SELECT id FROM redemptions WHERE status = 'pending' ORDER BY id LIMIT 2)`)
}

/*
คำขอปรับคะแนนที่รออนุมัติ

ใส่ไว้ใบหนึ่งที่ยังไม่มีใครลงชื่อ และอีกใบที่ฝั่ง GA อนุมัติแล้วรอฝั่ง HR
ผู้ทดสอบจะได้เห็นทั้งสถานะ "ยังไม่มีใครดู" และ "ขาดอีกฝั่งเดียว" โดยไม่ต้องสร้างเอง

ผูกกับพนักงานที่มีอยู่แล้วเท่านั้น ถ้าหาคนในแผนกที่กำหนดไม่เจอก็ข้ามไปเงียบ ๆ
ข้อมูลตัวอย่างไม่ควรทำให้การเตรียมข้อมูลทั้งชุดล้ม
*/
func insertPointRequests() {
	exec(`
		INSERT INTO point_adjustment_requests
		  (user_id, requested_by, points, point_kind, title, reason, created_at)
		SELECT t.id, a.id, 150, 'point', 'ชดเชยคะแนนกิจกรรมที่ระบบไม่บันทึก',
		       $1,
		       now() - interval '2 days'
		FROM (SELECT id FROM users WHERE role = 'user' ORDER BY id LIMIT 1) t
		CROSS JOIN (SELECT id FROM users
		            WHERE department = ANY(ARRAY['ER','ERG','GA','GAG','HR','HRM','HRD'])
		            ORDER BY id LIMIT 1) a
		ON CONFLICT DO NOTHING`,
		marker+" พนักงานมาร่วมงานจริงแต่สแกน QR ไม่ติดหน้างาน มีรูปถ่ายหมู่ยืนยัน")

	exec(`
		INSERT INTO point_adjustment_requests
		  (user_id, requested_by, points, point_kind, title, reason, created_at)
		SELECT t.id, a.id, -200, 'point', 'หักคืนคะแนนที่จ่ายซ้ำ',
		       $1, now() - interval '1 day'
		FROM (SELECT id FROM users WHERE role = 'user' ORDER BY id OFFSET 1 LIMIT 1) t
		CROSS JOIN (SELECT id FROM users
		            WHERE department = ANY(ARRAY['ER','ERG','GA','GAG','HR','HRM','HRD'])
		            ORDER BY id LIMIT 1) a
		ON CONFLICT DO NOTHING`,
		marker+" ระบบจ่ายคะแนนกิจกรรมเดียวกันสองรอบจากการสแกนซ้ำ ตรวจสอบแล้วตามรายงาน")

	// ใบล่าสุดให้ฝั่ง GA ลงชื่อไว้แล้ว เหลือรอ HR อีกฝั่งเดียว
	exec(`
		INSERT INTO point_adjustment_approvals (request_id, approver_id, approver_group, decision, note)
		SELECT q.id, g.id, 'GA', 'approve', 'ตรวจกับรายงานการสแกนแล้ว ซ้ำจริง'
		FROM (SELECT id FROM point_adjustment_requests
		      WHERE status = 'pending' ORDER BY id DESC LIMIT 1) q
		CROSS JOIN (SELECT id FROM users
		            WHERE department = ANY(ARRAY['GA','GAG'])
		              AND position = ANY(ARRAY['Director','Co-General Manager',
		                'Assistant General Manager','Co-Manager','Manager','Assistant Manager',
		                'Specialist','Chief Engineer','Senior Engineer','Engineer','Chief Officer'])
		            ORDER BY id LIMIT 1) g
		ON CONFLICT DO NOTHING`)
}

/*
ผลประเมินความพึงพอใจ

ใส่ให้สามกิจกรรมในเดือนต่างกัน เพื่อให้หน้าผลประเมินมีทั้ง

	กราฟแท่งหลายเดือน
	แท่งหลายกิจกรรมในเดือนเดียวกัน
	กิจกรรมที่คะแนนดีและคะแนนแย่ปนกัน

คะแนนตั้งให้ต่างกันจริง จะได้เห็นว่าแถบสีเขียว/ทอง/แดงทำงาน
*/
func insertFeedback() {
	type score struct {
		title             string
		q                 [5]int
		monthsAgo         int
		comment, comment2 string
	}

	rounds := []score{
		{"Sport Day", [5]int{5, 5, 4, 5, 5}, 2,
			"งานสนุกมาก อยากให้จัดทุกปีครับ", "อาหารอร่อย ของรางวัลเยอะดี"},
		{"อบรมความปลอดภัย", [5]int{3, 3, 2, 4, 3}, 1,
			"ห้องเล็กไป คนนั่งไม่พอ ควรหาที่ใหญ่กว่านี้", "เนื้อหาดีแต่เวลาน้อยไปหน่อย"},
		{"9.9 Compliance", [5]int{4, 4, 4, 5, 4}, 0,
			"วิทยากรอธิบายเข้าใจง่ายดีครับ", ""},
	}

	for i, r := range rounds {
		exec(`
			INSERT INTO event_feedback (event_id, user_id, q1,q2,q3,q4,q5, comment, created_at)
			SELECT e.id, u.id,
			       $2, $3, $4, $5, $6,
			       CASE WHEN (u.employee_code::int % 7) = 0 THEN $7
			            WHEN (u.employee_code::int % 7) = 3 THEN $8
			            ELSE '' END,
			       date_trunc('month', now()) - make_interval(months => $9) + interval '14 days'
			FROM events e
			JOIN event_registrations reg ON reg.event_id = e.id
			JOIN users u ON u.id = reg.user_id
			WHERE e.title LIKE $1 || '%' AND `+demoUser+` AND (u.employee_code::int % 2) = $10
			ON CONFLICT DO NOTHING`,
			r.title, r.q[0], r.q[1], r.q[2], r.q[3], r.q[4],
			r.comment, r.comment2, r.monthsAgo, i%2)
	}
}

/*
แจ้งเตือนในแอป

ใส่ทั้งที่อ่านแล้วและยังไม่อ่าน จะได้เห็นจุดแดงบนกระดิ่งและทดสอบการกดอ่านได้
*/
func insertNotifications() {
	exec(`
		INSERT INTO notifications (user_id, category, title, body, read_at, created_at)
		SELECT u.id, c.category, c.title, c.body,
		       CASE WHEN c.seen THEN now() - interval '1 day' END,
		       now() - make_interval(days => c.age::int)
		FROM users u
		CROSS JOIN (VALUES
		  ('event',  'เปิดรับสมัคร Sport Day 2026', 'กดลงทะเบียนได้แล้ววันนี้ถึงสิ้นเดือน', false, 1),
		  ('reward', 'ของรางวัลใหม่มาแล้ว',        'เสื้อแจ็คเก็ตรุ่นพิเศษ แลกได้ด้วยคะแนนพิเศษ', false, 3),
		  ('point',  'คุณได้รับคะแนนเพิ่ม',          'จากการเข้าร่วมกิจกรรมประจำเดือน',        true, 10)
		) AS c(category, title, body, seen, age)
		WHERE u.role = 'user' AND ` + demoUser + ``)
}

func day(offset int) string {
	return time.Now().AddDate(0, 0, offset).Format("2006-01-02")
}

/*
ของรางวัล ครอบคลุมทุกเคสที่หน้าเว็บต้องรับมือ

 1. ปกติ มีส่วนลด (ขีดฆ่าราคาเดิม)
 2. ปกติ ราคาเดียว
 3. ของหมด (stock = 0)
 4. เฉพาะ Silver ขึ้นไป
 5. เฉพาะ Elite
 6. กิจกรรมพิเศษ เหลืออีก 5 วัน
 7. กิจกรรมพิเศษ วันสุดท้าย
 8. ยังไม่ถึงวันเริ่ม (ต้องไม่โผล่ฝั่งพนักงาน)
 9. หมดเขตแล้ว (ต้องไม่โผล่ฝั่งพนักงาน)
 10. ซ่อนไว้ (status = hidden)
 11. ไม่มีรูป (ต้องขึ้นบล็อกเทา)
*/
func insertRewards() {
	exec(`
		INSERT INTO rewards (name, description, how_to, conditions, category, image_url,
		                     points, old_points, stock, status, min_tier, starts_at, ends_at) VALUES

		('แก้วเก็บความเย็น 20 ออนซ์',
		 E'• เก็บความเย็นได้ยาวนานสูงสุด 24 ชั่วโมง\n• สแตนเลสสองชั้น ไม่เกิดหยดน้ำ',
		 E'• ติดต่อรับได้ที่ฝ่ายบริหารงานทั่วไปและทรัพยากรบุคคล\n• แสดงประวัติการทำรายการเป็นหลักฐาน',
		 E'• จำกัด 1 ชิ้นต่อคนต่อเดือน', 'ของใช้', '/uploads/07_20oz_tumbler.jpg',
		 1000, 1500, 12, 'active', 'Member', NULL, NULL),

		('กระเป๋าผ้าแคนวาส',
		 E'• ขนาด 35x40 ซม. ผ้าหนา 12 ออนซ์', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 2 ใบต่อปี', 'ของใช้', '/uploads/12_canvas_tote_bag.jpg',
		 800, NULL, 25, 'active', 'Member', NULL, NULL),

		('ร่มพับ 3 ตอน',
		 E'• กันยูวี ขนาดพกพา', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 คันต่อปี', 'ของใช้', '/uploads/06_foldable_umbrella.jpg',
		 600, NULL, 0, 'active', 'Member', NULL, NULL),

		('เสื้อโปโลบริษัท',
		 E'• ผ้าคอตตอน 100% มีไซส์ S ถึง XL', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 ตัวต่อปี', 'เครื่องแต่งกาย', '/uploads/11_company_polo_shirt.jpg',
		 2000, NULL, 10, 'active', 'Silver', NULL, NULL),

		('พาวเวอร์แบงก์ 10,000 mAh',
		 E'• ชาร์จเร็ว 20W รองรับ USB-C', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• รับประกัน 1 ปี', 'อุปกรณ์ไอที', '/uploads/10_power_bank_10000mah.jpg',
		 2500, 3000, 5, 'active', 'Elite', NULL, NULL),

		('บัตรกำนัล 500 บาท',
		 E'• ใช้ได้ที่ร้านค้าที่ร่วมรายการ', E'• รับรหัสทางอีเมลภายใน 3 วันทำการ',
		 E'• ไม่สามารถแลกเป็นเงินสด', 'บัตรกำนัล', '/uploads/05_500_thb_voucher.jpg',
		 1500, NULL, 40, 'active', 'Member', $1::date, $2::date),

		('กระเช้าปีใหม่',
		 E'• ของขวัญชุดพิเศษประจำเทศกาล', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 ชุดต่อคน', 'ของขวัญ', '/uploads/09_new_year_gift_basket.jpg',
		 1200, NULL, 8, 'active', 'Member', $3::date, $4::date),

		('หูฟังไร้สาย (เริ่มแลกสัปดาห์หน้า)',
		 E'• ตัดเสียงรบกวน แบตใช้ได้ 30 ชั่วโมง', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 ชิ้นต่อคน', 'อุปกรณ์ไอที', '/uploads/08_wireless_headphones.jpg',
		 3000, NULL, 6, 'active', 'Member', $5::date, $6::date),

		('ของรางวัลที่หมดเขตแล้ว',
		 E'• ใช้ทดสอบว่าระบบซ่อนให้เองเมื่อพ้นกำหนด', E'• -', E'• -',
		 'ของใช้', '/uploads/04_expired_reward.jpg',
		 500, NULL, 10, 'active', 'Member', $7::date, $8::date),

		('ของรางวัลที่ซ่อนไว้',
		 E'• ใช้ทดสอบสถานะซ่อน', E'• -', E'• -',
		 'ของใช้', '/uploads/03_hidden_reward.jpg',
		 700, NULL, 10, 'hidden', 'Member', NULL, NULL),

		('ของรางวัลที่ยังไม่ใส่รูป',
		 E'• ใช้ทดสอบกรณีไม่มีรูป ต้องขึ้นบล็อกสีเทา', E'• -', E'• -',
		 'ของใช้', '/uploads/13_no_photo_reward.jpg',
		 300, NULL, 15, 'active', 'Member', NULL, NULL)`,
		day(-2), day(5), // บัตรกำนัล: กำลังอยู่ในช่วง เหลือ 5 วัน
		day(-3), day(0), // กระเช้า: วันสุดท้าย
		day(7), day(21), // หูฟัง: ยังไม่เริ่ม
		day(-14), day(-1)) // หมดเขตแล้ว
}

/*
กิจกรรม ครอบคลุม

 1. ลงทะเบียน มีจำนวนจำกัด
 2. โหวต ได้คะแนนทันที
 3. ลงทะเบียน ไม่จำกัดจำนวน
 4. ไม่มีรูป
 5. ปิดรับแล้ว (status = closed ต้องไม่โผล่ฝั่งพนักงาน)
*/
// ของรางวัลที่แลกด้วยคะแนนพิเศษ แยกคำสั่งเพราะใช้คอลัมน์ point_kind ที่เพิ่มมาทีหลัง
func insertSpecialRewards() {
	exec(`
		INSERT INTO rewards (name, description, how_to, conditions, category, points,
		                     stock, status, image_url, min_tier, point_kind) VALUES

		('เสื้อแจ็คเก็ตรุ่นพิเศษ ครบรอบบริษัท',
		 E'เสื้อแจ็คเก็ตปักโลโก้ครบรอบ ผลิตจำนวนจำกัด แลกด้วยคะแนนพิเศษเท่านั้น',
		 E'แสดงรหัสแลกรับที่ฝ่ายบุคคล ชั้น 2', E'จำกัด 1 ตัวต่อคน',
		 'ของที่ระลึก', 120, 50, 'active', '/uploads/02_anniversary_jacket.jpg', 'Member', 'special'),

		('กระเป๋าเป้รุ่นพิเศษ',
		 E'กระเป๋าเป้สำหรับพนักงาน แลกด้วยคะแนนพิเศษ',
		 E'แสดงรหัสแลกรับที่ฝ่ายบุคคล', E'ของมีจำนวนจำกัด',
		 'ของที่ระลึก', 200, 20, 'active', '/uploads/01_special_backpack.jpg', 'Member', 'special')`)
}

func insertEvents() {
	exec(`
		INSERT INTO events (title, description, agenda, location, image_url,
		                    event_date, start_time, end_time, points, kind, capacity, status) VALUES

		('9.9 Compliance Day',
		 E'ขอเชิญพนักงานทุกท่านเข้าร่วมกิจกรรมอัปเดตกฎระเบียบใหม่ของบริษัท พร้อมร่วมสนุกตอบคำถามชิงรางวัล',
		 E'10:00 - 10:15 น. : ลงทะเบียนเข้างาน\n10:15 - 11:30 น. : บรรยายหัวข้อ Compliance Policy\n11:30 - 12:00 น. : ถาม-ตอบ และรับคะแนนสะสม',
		 'โรงอาหาร โรงงานตาสิทธิ์', '/uploads/05_compliance_day.jpg',
		 $1::date, '10:00', '12:00', 100, 'register', 500, 'open'),

		('โหวตทริปท่องเที่ยวประจำปี',
		 E'มาร่วมโหวตสถานที่ที่คุณอยากไปมากที่สุด ผลโหวตจะใช้จัดทริปประจำปี',
		 E'เปิดโหวตถึงสิ้นเดือนนี้', 'ออนไลน์', '/uploads/06_annual_trip_vote.jpg',
		 $2::date, '09:00', '18:00', 20, 'vote', 0, 'open'),

		('Workshop AI สำหรับงานออฟฟิศ',
		 E'เรียนรู้การใช้เครื่องมือ AI ช่วยงานเอกสารและการวิเคราะห์ข้อมูล',
		 E'13:00 - 14:30 น. : ปฏิบัติการจริง\n14:30 - 16:00 น. : ถาม-ตอบ',
		 'ห้องประชุมใหญ่ ชั้น 3', '/uploads/02_workshop_ai_office.jpg',
		 $3::date, '13:00', '16:00', 150, 'register', 80, 'open'),

		('Sport Day 2026',
		 E'กีฬาสีประจำปี ร่วมแรง ร่วมใจ สู่ชัยชนะ',
		 E'08:00 น. : พิธีเปิด\n09:00 น. : เริ่มการแข่งขัน',
		 'สนามกีฬากลาง', '/uploads/01_sport_day_2026.jpg',
		 $4::date, '08:00', '17:00', 200, 'register', 0, 'open'),

		('อบรมความปลอดภัยประจำปี (ยังไม่ใส่รูป)',
		 E'อบรมภาคบังคับประจำปีสำหรับพนักงานทุกคน',
		 E'09:00 - 12:00 น. : ภาคทฤษฎี', 'ห้องอบรม ชั้น 2', '/uploads/04_annual_safety_training.jpg',
		 $5::date, '09:00', '12:00', 120, 'register', 200, 'open'),

		('กิจกรรมที่ปิดรับแล้ว',
		 E'ใช้ทดสอบว่ากิจกรรมสถานะปิดต้องไม่แสดงฝั่งพนักงาน',
		 E'-', 'ห้องประชุม', '/uploads/08_registration_closed.jpg',
		 $6::date, '09:00', '12:00', 50, 'register', 100, 'closed')`,
		day(12), day(5), day(30), day(45), day(20), day(-10))

	/*
		สองรายการนี้ใช้ความสามารถที่เพิ่มมาทีหลัง จึงแยกคำสั่งออกมา
		คำสั่งด้านบนไม่ได้ระบุคอลัมน์ใหม่ไว้ ถ้าไปต่อท้ายจะต้องแก้ทุกแถว

		  ตรวจตำแหน่ง  ลงทะเบียนได้เฉพาะตอนอยู่ในรัศมีงาน แล้วได้คะแนนทันที
		  คะแนนพิเศษ   จ่ายคะแนนพิเศษเพิ่มจากคะแนนปกติ พร้อมวันหมดอายุ

		พิกัดที่ใส่ไว้เป็นของโรงงานลาดกระบังโดยประมาณ
		ทดสอบจริงให้กดปุ่ม "ใช้ตำแหน่งปัจจุบัน" ในฟอร์มแก้ไขเพื่อเปลี่ยนเป็นที่ตั้งจริง
	*/
	exec(`
		INSERT INTO events (title, description, agenda, location, image_url,
		                    event_date, start_time, end_time, points, kind, capacity, status,
		                    special_points, special_points_expire_at,
		                    venue_lat, venue_lng, venue_radius) VALUES

		('ประชุมความปลอดภัยประจำเดือน (ตรวจตำแหน่ง)',
		 E'กิจกรรมนี้ต้องลงทะเบียนที่หน้างานเท่านั้น ระบบจะตรวจตำแหน่งของคุณก่อน\nลงทะเบียนผ่านแล้วได้คะแนนทันที ไม่ต้องรอเช็คอินอีกรอบ',
		 E'09:00 - 09:15 น. : ลงทะเบียนหน้างาน\n09:15 - 10:30 น. : อบรมความปลอดภัย',
		 'โรงอาหาร โรงงานลาดกระบัง', '/uploads/07_monthly_safety_meeting.jpg',
		 $1::date, '09:00', '10:30', 80, 'register', 0, 'open',
		 0, NULL, 13.7244, 100.7853, 150),

		('กิจกรรมพิเศษ ครบรอบบริษัท',
		 E'ร่วมงานครบรอบบริษัท รับทั้งคะแนนปกติและคะแนนพิเศษ\nคะแนนพิเศษใช้แลกของรางวัลรุ่นพิเศษได้เท่านั้น และมีวันหมดอายุ',
		 E'17:00 น. : เริ่มงาน\n18:00 น. : จับรางวัลใหญ่',
		 'ลานกิจกรรมกลาง', '/uploads/03_company_anniversary.jpg',
		 $2::date, '17:00', '21:00', 150, 'register', 0, 'open',
		 300, $3::date, NULL, NULL, 150)`,
		day(3), day(25), day(90))
}

func insertBanners() {
	exec(`
		INSERT INTO banners (title, image_url, link_url, sort_order, active) VALUES
		('ยินดีต้อนรับสู่ K-POINT', '/uploads/banner-welcome.jpg', NULL, 1, true),
		('ของรางวัลใหม่ประจำเดือน', '/uploads/banner-rewards.jpg', '/rewards', 2, true),
		('Sport Day 2026', '/uploads/banner-sportday.jpg', 'https://example.com/sportday', 3, true)`)
}

func insertFaqs() {
	exec(`
		INSERT INTO faqs (question, answer, sort_order) VALUES
		('คะแนนสะสมคืออะไร',
		 'คะแนนสะสมคือแต้มที่พนักงานได้รับจากการเข้าร่วมกิจกรรมของบริษัท นำไปแลกของรางวัลในระบบได้', 1),
		('ฉันจะได้รับคะแนนสะสมได้อย่างไร',
		 'ลงทะเบียนและเข้าร่วมกิจกรรม แล้วให้เจ้าหน้าที่สแกน QR ของคุณที่หน้างาน ระบบจะเพิ่มคะแนนให้อัตโนมัติ', 2),
		('คะแนนสะสมมีวันหมดอายุหรือไม่',
		 'มี คะแนนมีอายุ 1 ปีปฏิทิน ตัดยอดวันที่ 31 ธันวาคมของทุกปี ระบบแจ้งเตือนล่วงหน้า 30 วัน', 3),
		('กดแลกของรางวัลไปแล้ว ยกเลิกได้หรือไม่',
		 'ไม่สามารถยกเลิกได้ กรุณาตรวจสอบรายการให้เรียบร้อยก่อนกดยืนยัน', 4)`)
}

/*
ประกาศข่าวสาร ครอบคลุมทุกหน้าตาที่ผู้ใช้จะเจอ

 1. ประกาศสั้น ไม่มีรูป  — เนื้อหาไม่เกินหนึ่งหน้าจอ กดรับทราบได้ทันที
 2. ประกาศยาว มีรูป      — ต้องเลื่อนอ่านจนสุดก่อนจึงกดรับทราบได้
 3. แนบลิงก์แบบสำรวจ     — มีปุ่มพาไป Google Form
 4. แนบทั้งไฟล์และลิงก์   — มีทั้งปุ่มเปิด PDF และปุ่มลิงก์ในฉบับเดียว
 5. ฉบับร่าง             — ต้องไม่แสดงฝั่งพนักงาน
*/
func insertAnnouncements() {
	long := `บริษัทขอแจ้งกำหนดการวันหยุดประจำปี 2569 ดังนี้

ไตรมาสที่ 1
  1 มกราคม        วันขึ้นปีใหม่
  3 กุมภาพันธ์     วันมาฆบูชา
  6 เมษายน        วันจักรี

ไตรมาสที่ 2
  13 - 15 เมษายน  วันสงกรานต์
  1 พฤษภาคม       วันแรงงานแห่งชาติ
  4 พฤษภาคม       วันฉัตรมงคล

ไตรมาสที่ 3
  1 สิงหาคม        วันอาสาฬหบูชา
  12 สิงหาคม       วันแม่แห่งชาติ

ไตรมาสที่ 4
  13 ตุลาคม        วันนวมินทรมหาราช
  23 ตุลาคม        วันปิยมหาราช
  5 ธันวาคม        วันพ่อแห่งชาติ
  10 ธันวาคม       วันรัฐธรรมนูญ
  31 ธันวาคม       วันสิ้นปี

หมายเหตุ
  พนักงานที่ต้องปฏิบัติงานในวันหยุดข้างต้น จะได้รับค่าทำงานในวันหยุด
  ตามระเบียบของบริษัท กรุณาประสานกับหัวหน้างานล่วงหน้าอย่างน้อย 7 วัน

  กรณีต้องการใช้สิทธิ์วันหยุดชดเชย ให้ยื่นเรื่องผ่านฝ่ายบุคคล
  ภายใน 30 วันนับจากวันที่ปฏิบัติงาน

จึงเรียนมาเพื่อทราบโดยทั่วกัน

ฝ่ายทรัพยากรบุคคล`

	exec(`
		INSERT INTO announcements (title, body, image_url, status, require_ack,
		                           link_url, link_label, created_at) VALUES

		('แจ้งปิดระบบสะสมคะแนนชั่วคราว',
		 E'ระบบจะปิดปรับปรุงวันเสาร์ที่ 15 เวลา 22:00 - 02:00 น.\nระหว่างนี้จะไม่สามารถแลกของรางวัลได้ ขออภัยในความไม่สะดวก',
		 NULL, 'published', true, NULL, '', now() - interval '2 days'),

		('กำหนดการวันหยุดประจำปี 2569', $1,
		 '/uploads/news-holidays.jpg', 'published', true, NULL, '', now() - interval '1 day'),

		('ขอความร่วมมือทำแบบสำรวจความพึงพอใจ',
		 E'ฝ่ายบุคคลขอความร่วมมือพนักงานทุกท่านทำแบบสำรวจความพึงพอใจประจำปี\n\nใช้เวลาประมาณ 5 นาที คำตอบของท่านจะถูกเก็บเป็นความลับ\nและนำไปใช้ปรับปรุงสวัสดิการในปีถัดไป\n\nกรุณาทำให้เสร็จภายในวันที่ 30 ของเดือนนี้',
		 NULL, 'published', true,
		 'https://forms.gle/example-survey-2569', 'ทำแบบสำรวจ', now()),

		('คู่มือสวัสดิการพนักงานฉบับปรับปรุง',
		 E'ฝ่ายบุคคลได้ปรับปรุงคู่มือสวัสดิการพนักงานประจำปี 2569 เรียบร้อยแล้ว\n\nสาระสำคัญที่เปลี่ยนแปลง\n  • เพิ่มวงเงินค่ารักษาพยาบาลผู้ป่วยนอกเป็น 20,000 บาทต่อปี\n  • ขยายสิทธิ์ตรวจสุขภาพประจำปีให้ครอบคลุมคู่สมรส\n  • ปรับเงินสมทบกองทุนสำรองเลี้ยงชีพเป็น 5% เท่ากันทุกระดับ\n\nกรุณาเปิดอ่านคู่มือฉบับเต็มตามไฟล์แนบ\nหากมีข้อสงสัยสามารถสอบถามเพิ่มเติมผ่านแบบฟอร์มด้านล่าง',
		 NULL, 'published', true,
		 'https://forms.gle/example-welfare-question', 'สอบถามเพิ่มเติม',
		 now() - interval '3 hours'),

		('ร่างประกาศ ยังไม่เผยแพร่',
		 E'ใช้ทดสอบว่าประกาศสถานะร่างต้องไม่แสดงฝั่งพนักงาน',
		 NULL, 'draft', true, NULL, '', now())`, long)

	// แนบไฟล์ PDF ให้ประกาศคู่มือสวัสดิการ
	// แยกเป็นคำสั่งต่างหากเพื่อไม่ต้องใส่คอลัมน์ file_url ว่าง ๆ ให้ทุกแถวข้างบน
	exec(`
		UPDATE announcements
		SET file_url = '/uploads/doc-welfare-handbook.pdf',
		    file_name = 'คู่มือสวัสดิการพนักงาน 2569.pdf'
		WHERE title = 'คู่มือสวัสดิการพนักงานฉบับปรับปรุง'`)
}

// ให้คะแนนพนักงานทดสอบพอให้เห็นทั้งของที่แลกได้และของที่ยังไม่ถึงระดับ
//
// ตั้งแต่คะแนนอย่างเดียว ไม่กำหนดระดับทับ เพราะระดับต้องมาจากการคำนวณของระบบ
// ถ้ากำหนดเองจะได้ข้อมูลที่ระดับไม่ตรงกับคะแนน ซึ่งไม่มีทางเกิดจากการใช้งานจริง
/*
ประชาสัมพันธ์ตัวอย่าง ครบทั้งสามชนิดเนื้อหา

ตั้งเงื่อนไขให้ต่างกันทุกเรื่อง เพื่อให้เห็นว่าหน้าจอแสดงผลแต่ละแบบยังไง
  ข้อความ  อ่านครบ 30 วินาที        คะแนน 1
  รูปภาพ   อ่านครบ 45 วินาที        คะแนน 2   (ค่าที่ไม่ได้อยู่ในตัวเลือกสำเร็จรูป)
  วิดีโอ    ดูครบ 70% ของคลิป        คะแนน 3   (คลิปจริงยาว 24 วินาที)
  ยูทูบ     ดูจบแล้วกดยืนยัน         คะแนน 2

เรื่องที่เป็นวิดีโออัปโหลดใช้ไฟล์จริงที่มากับชุดตัวอย่าง
กดเล่นได้ เลื่อนได้ และนับความคืบหน้าได้จริง ไม่ใช่ลิงก์ที่ชี้ไปไฟล์ที่ไม่มีอยู่
*/
func insertPr() {
	safety := `ขอความร่วมมือพนักงานทุกท่านปฏิบัติตามมาตรการความปลอดภัยในพื้นที่ปฏิบัติงานอย่างเคร่งครัด

1. อุปกรณ์ป้องกันส่วนบุคคล
   สวมหมวกนิรภัย แว่นตานิรภัย และรองเท้าหัวเหล็กทุกครั้งที่เข้าพื้นที่ผลิต
   เสื้อสะท้อนแสงจำเป็นสำหรับผู้ที่ทำงานใกล้เส้นทางรถยก

2. ก่อนเริ่มงานทุกกะ
   ตรวจสภาพเครื่องจักรตามใบตรวจประจำวัน หากพบความผิดปกติ
   ให้หยุดใช้งานทันทีและแจ้งหัวหน้างาน ห้ามซ่อมเองโดยไม่ได้รับมอบหมาย

3. การรายงานอุบัติเหตุ
   รายงานทุกเหตุการณ์ภายใน 24 ชั่วโมง รวมถึงเหตุการณ์เกือบเกิดอุบัติเหตุ
   ข้อมูลส่วนนี้ใช้ปรับปรุงมาตรการ ไม่ได้ใช้ลงโทษผู้รายงาน

4. เส้นทางหนีไฟ
   ห้ามวางสิ่งของกีดขวางทางเดินและประตูหนีไฟทุกกรณี
   ซ้อมอพยพประจำปีจัดในเดือนมีนาคมและกันยายน

ฝ่ายความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน`

	family := `บริษัทขอเชิญพนักงานและครอบครัวร่วมงานวันครอบครัว KOBELCO ประจำปี 2569

วันเสาร์ที่ 14 มีนาคม 2569 เวลา 08:30 - 16:00 น.
ณ ลานกิจกรรมหน้าอาคารสำนักงานใหญ่

กิจกรรมภายในงาน
  • ซุ้มอาหารและเครื่องดื่มฟรีตลอดงาน
  • กิจกรรมฐานสำหรับเด็ก พร้อมของรางวัล
  • การแสดงจากชมรมพนักงาน
  • จับฉลากของรางวัลใหญ่ช่วงบ่าย

พนักงานพาครอบครัวเข้าร่วมได้ท่านละไม่เกิน 4 คน
ลงทะเบียนล่วงหน้าที่ฝ่ายบุคคลภายในวันที่ 28 กุมภาพันธ์`

	/*
		ลบตัวอย่างชุดเดิมก่อน เจาะจงด้วยหัวข้อ

		ลบทั้ง channel = 'pr' ไม่ได้ เพราะจะไปลบข่าวประชาสัมพันธ์จริงที่ผู้ดูแลสร้างเอง
		ซึ่งเป็นคนละเรื่องกับข้อมูลตัวอย่าง
	*/
	exec(`DELETE FROM announcements WHERE channel = 'pr' AND title IN (
	        'ประกาศนโยบายความปลอดภัยในการทำงาน',
	        'กิจกรรมวันครอบครัว KOBELCO ประจำปี 2569',
	        'วิดีโอแนะนำการใช้งานเครื่องจักร KOBELCO',
	        'สรุปผลการดำเนินงานประจำไตรมาส')`)

	exec(`
		INSERT INTO announcements
		  (channel, kind, category, title, summary, body, image_url,
		   video_url, video_kind, video_seconds, points, read_seconds, watch_percent,
		   status, starts_at, require_ack, created_at) VALUES

		('pr', 'text', 'announce',
		 'ประกาศนโยบายความปลอดภัยในการทำงาน', '',
		 $1, NULL, NULL, 'upload', 0, 1, 30, 90,
		 'published', CURRENT_DATE - 5, false, now() - interval '5 days'),

		('pr', 'image', 'news',
		 'กิจกรรมวันครอบครัว KOBELCO ประจำปี 2569', '',
		 $2, '/uploads/banner-sportday.jpg', NULL, 'upload', 0, 2, 45, 90,
		 'published', CURRENT_DATE - 2, false, now() - interval '2 days'),

		('pr', 'video', 'news',
		 'วิดีโอแนะนำการใช้งานเครื่องจักร KOBELCO', '',
		 E'คลิปแนะนำขั้นตอนการใช้งานและการตรวจสภาพเครื่องจักรก่อนเริ่มงาน\nความยาว 24 วินาที',
		 NULL, '/uploads/pr-machine-guide.mp4', 'upload', 24, 3, 30, 70,
		 'published', CURRENT_DATE - 1, false, now() - interval '1 day'),

		('pr', 'video', 'news',
		 'สรุปผลการดำเนินงานประจำไตรมาส', '',
		 E'คลิปสรุปผลการดำเนินงานประจำไตรมาส ฝากไว้ที่ YouTube\nผู้ดูแลกรอกความยาวคลิปไว้ 10 นาที 34 วินาที ระบบใช้คำนวณว่าต้องดูกี่วินาที',
		 NULL, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'youtube', 634, 2, 30, 90,
		 'published', CURRENT_DATE, false, now())`,
		safety, family)
}

func givePoints() {
	exec(`UPDATE users SET points = 1500 WHERE employee_code = '1875'`)
	exec(`
		UPDATE users u SET tier = COALESCE(
		  (SELECT t.key FROM tiers t WHERE u.points >= t.min_points AND t.status = 'active'
		   ORDER BY t.min_points DESC LIMIT 1), u.tier)
		WHERE u.employee_code = '1875'`)

	exec(`
		INSERT INTO point_transactions (user_id, kind, source, title, points, created_at)
		SELECT id, 'adjust', 'system', $1, 1500, now() FROM users WHERE employee_code = '1875'`,
		marker+" คะแนนเริ่มต้นสำหรับทดสอบ")

	/*
		คะแนนของพนักงานตัวอย่าง มาจากตาราง roster ด้านบน

		ตั้งให้ต่างกันทั้งองค์กร จะได้เห็นทุกระดับสมาชิกพร้อมกันในหน้าจัดการพนักงาน
		และรายงานกระจายตัวเหมือนข้อมูลจริง ไม่ใช่ทุกคนคะแนนเท่ากัน
	*/
	for _, p := range roster {
		exec(`UPDATE users SET points = $2 WHERE employee_code = $1`, p.code, p.points)
	}

	// 2105 มีคะแนนพิเศษไว้ทดสอบการแลกของรางวัลรุ่นพิเศษได้ทันที
	exec(`UPDATE users SET special_points = 450, special_points_expire_at = CURRENT_DATE + 90
	      WHERE employee_code = '2105'`)

	exec(`
		INSERT INTO point_transactions (user_id, kind, source, title, points, point_kind, created_at)
		SELECT id, 'earn', 'event', $1, 450, 'special', now() - interval '5 days'
		FROM users WHERE employee_code = '2105'`,
		marker+" คะแนนพิเศษจากกิจกรรมครบรอบบริษัท")

	// 2106 มีคะแนนพิเศษที่เหลืออีก 7 วัน ไว้ดูป้ายเตือน "ใกล้หมดอายุ"
	// และใบแจ้งเตือนล่วงหน้า โดยไม่ต้องนั่งแก้วันในฐานข้อมูลเอง
	exec(`UPDATE users SET special_points = 120, special_points_expire_at = CURRENT_DATE + 7
	      WHERE employee_code = '2106'`)

	exec(`
		INSERT INTO point_transactions (user_id, kind, source, title, points, point_kind, created_at)
		SELECT id, 'earn', 'event', $1, 120, 'special', now() - interval '20 days'
		FROM users WHERE employee_code = '2106'`,
		marker+" คะแนนพิเศษจากกิจกรรมครบรอบบริษัท")
}

func clear() {
	wipe()
	fmt.Println("ลบข้อมูลทดสอบเรียบร้อย เหลือเฉพาะบัญชีและค่าตั้งระบบ")
}

// wipe ลบข้อมูลทดสอบทั้งหมด ใช้ทั้งตอนสั่ง clear และตอนเริ่มใส่ข้อมูลรอบใหม่
func wipe() {
	exec(`DELETE FROM event_feedback`)
	exec(`DELETE FROM redemptions`)
	/*
		ลบเฉพาะคำขอที่คำสั่งนี้สร้างไว้เอง ไม่ใช่ทั้งตาราง

		คำขอปรับคะแนนกับรายชื่อผู้อนุมัติเป็นหลักฐานว่าใครอนุมัติให้ใครเมื่อไหร่
		ไม่ใช่ข้อมูลตกแต่งหน้าจอแบบของรางวัลหรือแบนเนอร์
		ถ้าเผลอสั่งใส่ข้อมูลทดสอบทับระบบที่ใช้งานจริง หลักฐานพวกนี้ต้องไม่หายไปด้วย

		ตารางการอนุมัติตามไปเองด้วย ON DELETE CASCADE
	*/
	exec(`DELETE FROM point_adjustment_requests WHERE reason LIKE $1`, marker+"%")
	exec(`DELETE FROM event_registrations`)
	exec(`DELETE FROM favorites`)
	exec(`DELETE FROM rewards`)
	exec(`DELETE FROM events`)
	exec(`DELETE FROM banners`)
	exec(`DELETE FROM faqs`)
	exec(`DELETE FROM announcement_acks`)
	exec(`DELETE FROM announcements`)
	exec(`DELETE FROM notifications`)
	exec(`DELETE FROM point_transactions`)
	// ลบเฉพาะพนักงานตัวอย่างของชุดนี้ ไม่แตะบัญชีอื่น
	// ลบเฉพาะพนักงานตัวอย่างของชุดนี้ (รหัสขึ้นต้นด้วย 21 หรือ 22) ไม่แตะบัญชีอื่น
	exec(`DELETE FROM users WHERE role = 'user'
	      AND (employee_code LIKE '21__' OR employee_code LIKE '22__')`)
	// ล้างวันที่เคยเตือนไปแล้วด้วย ไม่งั้นใส่ข้อมูลทดสอบรอบใหม่แล้วใบแจ้งเตือนไม่ขึ้น
	// เพราะระบบจำว่าเตือนวันหมดอายุเดิมไปแล้ว
	exec(`UPDATE users SET points = 0, special_points = 0, special_points_expire_at = NULL,
	      special_points_notified_for = NULL, tier = 'Member' WHERE role = 'user'`)
}

/*
syncTiers ตั้งระดับสมาชิกให้ตรงกับคะแนนที่มี

ต้องทำหลังใส่คะแนนเสร็จ เพราะระดับเป็นผลลัพธ์ของคะแนน ไม่ใช่ค่าที่ตั้งเองได้
ถ้าตั้งระดับไว้ล่วงหน้าแล้วคะแนนไม่ตรง จะได้ข้อมูลทดสอบที่ไม่มีทางเกิดจากการใช้งานจริง
*/
func syncTiers() {
	exec(`
		UPDATE users u SET tier = COALESCE(
		  (SELECT t.key FROM tiers t
		   WHERE u.points >= t.min_points AND t.status = 'active'
		   ORDER BY t.min_points DESC LIMIT 1), 'Member')
		WHERE u.role = 'user'`)
}
