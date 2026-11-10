package main

import (
	"fmt"
	"log"

	"rewards/bootstrap"
	"rewards/config"
)

// สร้างบัญชีตั้งต้นและค่าที่ระบบต้องใช้
// ปกติไม่ต้องสั่งเอง เพราะ go run . ทำให้แล้วตอนสร้างตารางครั้งแรก
// คำสั่งนี้มีไว้เผื่อเผลอลบบัญชีหรือระดับสมาชิกทิ้ง แล้วอยากสร้างคืน
func main() {
	config.LoadEnv(".env", "../.env")

	if err := config.Connect(); err != nil {
		fmt.Printf("ต่อฐานข้อมูลไม่สำเร็จ: %v\n", err)
		if hint := config.Hint(err); hint != "" {
			fmt.Printf("\n%s\n", hint)
		}
		log.Fatal("หยุดทำงาน")
	}

	if err := bootstrap.Run(); err != nil {
		log.Fatal(err)
	}

	fmt.Println("เตรียมข้อมูลตั้งต้นเรียบร้อย")
	fmt.Println("  พนักงาน : รหัส 1875 / รหัสผ่าน 2962")
	fmt.Println("  แอดมิน  : admin / รหัสผ่าน line")
}
