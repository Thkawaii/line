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

	copyImages()
	insertRewards()
	insertEvents()
	insertBanners()
	insertFaqs()
	givePoints()

	fmt.Println("ใส่ข้อมูลทดสอบเรียบร้อย")
	fmt.Println("  ของรางวัล 9 ชิ้น · กิจกรรม 5 รายการ · แบนเนอร์ 3 ใบ · คำถาม 4 ข้อ")
	fmt.Println("  พนักงาน 1875 ได้คะแนนเริ่มต้น 1,500 คะแนน (ระบบคำนวณระดับให้เอง)")
	fmt.Println()
	fmt.Println("  ลบข้อมูลชุดนี้ทิ้ง: go run ./cmd/demo clear")
}

func exec(query string, args ...any) {
	if _, err := store.Exec(query, args...); err != nil {
		log.Fatalf("ใส่ข้อมูลไม่สำเร็จ: %v", err)
	}
}

// คัดลอกรูปตัวอย่างเข้าโฟลเดอร์ uploads เพื่อให้เสิร์ฟผ่าน /uploads/ ได้เหมือนรูปที่อัปโหลดเอง
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
		 E'• จำกัด 1 ชิ้นต่อคนต่อเดือน', 'ของใช้', '/uploads/reward-tumbler.jpg',
		 1000, 1500, 12, 'active', 'Member', NULL, NULL),

		('กระเป๋าผ้าแคนวาส',
		 E'• ขนาด 35x40 ซม. ผ้าหนา 12 ออนซ์', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 2 ใบต่อปี', 'ของใช้', '/uploads/reward-tote.jpg',
		 800, NULL, 25, 'active', 'Member', NULL, NULL),

		('ร่มพับ 3 ตอน',
		 E'• กันยูวี ขนาดพกพา', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 คันต่อปี', 'ของใช้', '/uploads/reward-umbrella.jpg',
		 600, NULL, 0, 'active', 'Member', NULL, NULL),

		('เสื้อโปโลบริษัท',
		 E'• ผ้าคอตตอน 100% มีไซส์ S ถึง XL', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 ตัวต่อปี', 'เครื่องแต่งกาย', '/uploads/reward-shirt.jpg',
		 2000, NULL, 10, 'active', 'Silver', NULL, NULL),

		('พาวเวอร์แบงก์ 10,000 mAh',
		 E'• ชาร์จเร็ว 20W รองรับ USB-C', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• รับประกัน 1 ปี', 'อุปกรณ์ไอที', '/uploads/reward-powerbank.jpg',
		 2500, 3000, 5, 'active', 'Elite', NULL, NULL),

		('บัตรกำนัล 500 บาท',
		 E'• ใช้ได้ที่ร้านค้าที่ร่วมรายการ', E'• รับรหัสทางอีเมลภายใน 3 วันทำการ',
		 E'• ไม่สามารถแลกเป็นเงินสด', 'บัตรกำนัล', '/uploads/reward-giftcard.jpg',
		 1500, NULL, 40, 'active', 'Member', $1::date, $2::date),

		('กระเช้าปีใหม่',
		 E'• ของขวัญชุดพิเศษประจำเทศกาล', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 ชุดต่อคน', 'ของขวัญ', '/uploads/reward-hamper.jpg',
		 1200, NULL, 8, 'active', 'Member', $3::date, $4::date),

		('หูฟังไร้สาย (เริ่มแลกสัปดาห์หน้า)',
		 E'• ตัดเสียงรบกวน แบตใช้ได้ 30 ชั่วโมง', E'• ติดต่อรับได้ที่ฝ่ายบุคคล',
		 E'• จำกัด 1 ชิ้นต่อคน', 'อุปกรณ์ไอที', '/uploads/reward-headphone.jpg',
		 3000, NULL, 6, 'active', 'Member', $5::date, $6::date),

		('ของรางวัลที่หมดเขตแล้ว',
		 E'• ใช้ทดสอบว่าระบบซ่อนให้เองเมื่อพ้นกำหนด', E'• -', E'• -',
		 'ของใช้', '/uploads/reward-tote.jpg',
		 500, NULL, 10, 'active', 'Member', $7::date, $8::date),

		('ของรางวัลที่ซ่อนไว้',
		 E'• ใช้ทดสอบสถานะซ่อน', E'• -', E'• -',
		 'ของใช้', '/uploads/reward-hamper.jpg',
		 700, NULL, 10, 'hidden', 'Member', NULL, NULL),

		('ของรางวัลที่ยังไม่ใส่รูป',
		 E'• ใช้ทดสอบกรณีไม่มีรูป ต้องขึ้นบล็อกสีเทา', E'• -', E'• -',
		 'ของใช้', NULL,
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
func insertEvents() {
	exec(`
		INSERT INTO events (title, description, agenda, location, image_url,
		                    event_date, start_time, end_time, points, kind, capacity, status) VALUES

		('9.9 Compliance Day',
		 E'ขอเชิญพนักงานทุกท่านเข้าร่วมกิจกรรมอัปเดตกฎระเบียบใหม่ของบริษัท พร้อมร่วมสนุกตอบคำถามชิงรางวัล',
		 E'10:00 - 10:15 น. : ลงทะเบียนเข้างาน\n10:15 - 11:30 น. : บรรยายหัวข้อ Compliance Policy\n11:30 - 12:00 น. : ถาม-ตอบ และรับคะแนนสะสม',
		 'โรงอาหาร โรงงานตาสิทธิ์', '/uploads/event-compliance.jpg',
		 $1::date, '10:00', '12:00', 100, 'register', 500, 'open'),

		('โหวตทริปท่องเที่ยวประจำปี',
		 E'มาร่วมโหวตสถานที่ที่คุณอยากไปมากที่สุด ผลโหวตจะใช้จัดทริปประจำปี',
		 E'เปิดโหวตถึงสิ้นเดือนนี้', 'ออนไลน์', '/uploads/event-vote.jpg',
		 $2::date, '09:00', '18:00', 20, 'vote', 0, 'open'),

		('Workshop AI สำหรับงานออฟฟิศ',
		 E'เรียนรู้การใช้เครื่องมือ AI ช่วยงานเอกสารและการวิเคราะห์ข้อมูล',
		 E'13:00 - 14:30 น. : ปฏิบัติการจริง\n14:30 - 16:00 น. : ถาม-ตอบ',
		 'ห้องประชุมใหญ่ ชั้น 3', '/uploads/event-workshop.jpg',
		 $3::date, '13:00', '16:00', 150, 'register', 80, 'open'),

		('Sport Day 2026',
		 E'กีฬาสีประจำปี ร่วมแรง ร่วมใจ สู่ชัยชนะ',
		 E'08:00 น. : พิธีเปิด\n09:00 น. : เริ่มการแข่งขัน',
		 'สนามกีฬากลาง', '/uploads/event-sportday.jpg',
		 $4::date, '08:00', '17:00', 200, 'register', 0, 'open'),

		('อบรมความปลอดภัยประจำปี (ยังไม่ใส่รูป)',
		 E'อบรมภาคบังคับประจำปีสำหรับพนักงานทุกคน',
		 E'09:00 - 12:00 น. : ภาคทฤษฎี', 'ห้องอบรม ชั้น 2', NULL,
		 $5::date, '09:00', '12:00', 120, 'register', 200, 'open'),

		('กิจกรรมที่ปิดรับแล้ว',
		 E'ใช้ทดสอบว่ากิจกรรมสถานะปิดต้องไม่แสดงฝั่งพนักงาน',
		 E'-', 'ห้องประชุม', '/uploads/event-safety.jpg',
		 $6::date, '09:00', '12:00', 50, 'register', 100, 'closed')`,
		day(12), day(5), day(30), day(45), day(20), day(-10))
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

// ให้คะแนนพนักงานทดสอบพอให้เห็นทั้งของที่แลกได้และของที่ยังไม่ถึงระดับ
//
// ตั้งแต่คะแนนอย่างเดียว ไม่กำหนดระดับทับ เพราะระดับต้องมาจากการคำนวณของระบบ
// ถ้ากำหนดเองจะได้ข้อมูลที่ระดับไม่ตรงกับคะแนน ซึ่งไม่มีทางเกิดจากการใช้งานจริง
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
}

func clear() {
	exec(`DELETE FROM redemptions`)
	exec(`DELETE FROM event_registrations`)
	exec(`DELETE FROM favorites`)
	exec(`DELETE FROM rewards`)
	exec(`DELETE FROM events`)
	exec(`DELETE FROM banners`)
	exec(`DELETE FROM faqs`)
	exec(`DELETE FROM notifications`)
	exec(`DELETE FROM point_transactions`)
	exec(`UPDATE users SET points = 0, tier = 'Member' WHERE role = 'user'`)
	fmt.Println("ลบข้อมูลทดสอบเรียบร้อย เหลือเฉพาะบัญชีและค่าตั้งระบบ")
}
