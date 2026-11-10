package main

import (
	"fmt"
	"log"
	"os"

	"rewards/bootstrap"
	"rewards/config"
	"rewards/store"
)

// ล้างตารางทั้งหมดแล้วสร้างใหม่ พร้อมข้อมูลตั้งต้น
//
// ปกติไม่ต้องสั่งเอง เพราะ go run . สร้างให้อยู่แล้วถ้ายังไม่มีตาราง
// คำสั่งนี้ใช้ตอนที่โครงตารางเปลี่ยนแล้วอยากเริ่มใหม่หมด
// ข้อมูลเดิมทั้งหมดจะหาย
func main() {
	config.LoadEnv(".env", "../.env")

	name := config.DatabaseName()
	if name == "" {
		fmt.Println("ไม่พบ DATABASE_URL — คัดลอก .env.example เป็น .env ก่อนแล้วลองใหม่")
		os.Exit(1)
	}

	created, err := config.EnsureDatabase()
	if err != nil {
		fail(err)
	}
	if created {
		fmt.Printf("สร้างฐานข้อมูล %q ให้แล้ว\n", name)
	} else {
		fmt.Printf("พบฐานข้อมูล %q อยู่แล้ว\n", name)
	}

	if err := config.Connect(); err != nil {
		fail(err)
	}

	schema, err := os.ReadFile(config.SchemaPath())
	if err != nil {
		fail(err)
	}
	if _, err := store.Exec(string(schema)); err != nil {
		fail(err)
	}
	fmt.Println("สร้างตารางเรียบร้อย (ข้อมูลเดิมถูกล้างทั้งหมด)")

	if err := bootstrap.Run(); err != nil {
		fail(err)
	}
	fmt.Println("สร้างข้อมูลตั้งต้นเรียบร้อย")
	fmt.Println("  พนักงาน : รหัส 1875 / รหัสผ่าน 2962")
	fmt.Println("  แอดมิน  : admin / รหัสผ่าน line")
}

func fail(err error) {
	fmt.Println("\nเตรียมฐานข้อมูลไม่สำเร็จ")
	fmt.Printf("  %v\n", err)
	if hint := config.Hint(err); hint != "" {
		fmt.Printf("\n%s\n", hint)
	}
	log.Fatal("หยุดทำงาน")
}
