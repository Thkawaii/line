package main

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"rewards/bootstrap"
	"rewards/config"
	"rewards/controllers"
	"rewards/middleware"
	"rewards/routes"
	"rewards/store"
)

// ตรวจทุกชั่วโมงว่าถึงกำหนดตัดยอดคะแนนประจำปีหรือยัง
//
// ใช้ตัวตั้งเวลาในโปรแกรมแทน cron ของระบบปฏิบัติการ เพราะติดตั้งง่ายกว่าและย้ายเครื่องแล้วตามไปด้วย
// ตัวที่ทำงานจริงเช็กก่อนทุกครั้งว่าปีนี้รีเซ็ตไปแล้วหรือยัง เปิดเซิร์ฟเวอร์หลายตัวก็ไม่รีเซ็ตซ้ำ
func startAnnualResetWatcher() {
	run := func() {
		summary, err := controllers.MaybeRunAnnualReset()
		if err != nil {
			log.Printf("⚠  ตัดยอดคะแนนประจำปีไม่สำเร็จ: %v", err)
			return
		}
		if summary.Executed {
			log.Printf("ตัดยอดคะแนนประจำปี %d เรียบร้อย — %d บัญชี คงระดับ %d ลดระดับ %d",
				summary.Year, summary.Total, summary.Kept, summary.Demoted)
		}
	}

	run() // เผื่อเซิร์ฟเวอร์ปิดอยู่ตอนถึงกำหนด เปิดมาแล้วทำให้ทันที

	go func() {
		for range time.Tick(time.Hour) {
			run()
		}
	}()
}

// translationInterval อ่านระยะห่างระหว่างรอบแปลจาก TRANSLATE_INTERVAL (หน่วยวินาที)
//
// ค่าเริ่มต้น 60 วินาที ถือว่าเร็วพอสำหรับงานจริง — ผู้ดูแลบันทึกของรางวัลใหม่
// แล้วรออีกไม่ถึงนาทีคำแปลก็ขึ้น และไม่ถี่จนยิงบริการแปลบ่อยเกินจำเป็น
func translationInterval() time.Duration {
	seconds, err := strconv.Atoi(config.Getenv("TRANSLATE_INTERVAL", "60"))
	if err != nil || seconds < 10 {
		seconds = 60
	}
	return time.Duration(seconds) * time.Second
}

func main() {
	config.LoadEnv()

	// เตรียมฐานข้อมูลให้พร้อมใช้เอง จะได้สั่ง go run . ทีเดียวจบ
	// ถ้ามีตารางอยู่แล้วจะไม่แตะอะไรเลย ข้อมูลเดิมจึงปลอดภัย
	setup, err := config.AutoSetup()
	if err != nil {
		log.Printf("⚠  เตรียมฐานข้อมูลไม่สำเร็จ: %v", err)
		if hint := config.Hint(err); hint != "" {
			log.Printf("\n%s\n", hint)
		}
		log.Fatal("หยุดทำงาน — แก้การเชื่อมต่อฐานข้อมูลก่อนแล้วรันใหม่")
	}

	if setup.CreatedDatabase {
		log.Printf("สร้างฐานข้อมูล %q ให้แล้ว", config.DatabaseName())
	}
	for _, name := range setup.Migrations {
		log.Printf("ต่อเติมโครงตาราง: %s", name)
	}
	if setup.CreatedTables {
		log.Println("สร้างตารางให้แล้ว")
		bootstrap.RunOrLog()
		log.Println("สร้างข้อมูลตั้งต้นให้แล้ว")
		log.Println("  พนักงาน : รหัส 1875 / รหัสผ่าน 2962")
		log.Println("  แอดมิน  : admin / รหัสผ่าน line")
	}

	if count, err := store.Count(`SELECT count(*)::int FROM users`); err != nil {
		log.Printf("⚠  %v", err)
	} else {
		log.Printf("ฐานข้อมูล: พร้อมใช้งาน (ผู้ใช้ %d คน)", count)
	}

	startAnnualResetWatcher()

	// ตัวแปลเนื้อหาอัตโนมัติ ทำงานเบื้องหลังตลอดเวลาที่เซิร์ฟเวอร์เปิดอยู่
	// รอบแรกจะไล่แปลข้อมูลเก่าที่ยังไม่มีคำแปลให้เองโดยไม่ต้องสั่งอะไร
	controllers.StartTranslationWorker(translationInterval())

	port := config.Getenv("PORT", "4007")

	server := &http.Server{
		Addr:              "0.0.0.0:" + port,
		Handler:           middleware.CORS(routes.Setup()),
		ReadHeaderTimeout: 10 * time.Second,
	}

	log.Printf("API ทำงานที่ http://localhost:%s", port)
	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
