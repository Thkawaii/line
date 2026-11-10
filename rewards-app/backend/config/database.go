package config

import (
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/lib/pq"
)

var DB *sql.DB

// DatabaseURL คืนค่า DATABASE_URL พร้อมเติม sslmode=disable ให้ถ้ายังไม่ได้ระบุ
// (PostgreSQL ที่ติดตั้งในเครื่องส่วนใหญ่ไม่ได้เปิด SSL ไว้)
func DatabaseURL() (string, error) {
	raw := os.Getenv("DATABASE_URL")
	if raw == "" {
		return "", errors.New("ไม่พบ DATABASE_URL — คัดลอก .env.example เป็น .env ก่อน")
	}

	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("DATABASE_URL ไม่ถูกต้อง: %w", err)
	}

	query := parsed.Query()
	if query.Get("sslmode") == "" {
		query.Set("sslmode", "disable")
		parsed.RawQuery = query.Encode()
	}
	return parsed.String(), nil
}

// DatabaseName ดึงชื่อฐานข้อมูลออกจาก DATABASE_URL
func DatabaseName() string {
	raw := os.Getenv("DATABASE_URL")
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(parsed.Path, "/")
}

func Connect() error {
	dsn, err := DatabaseURL()
	if err != nil {
		return err
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return err
	}

	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	if err := db.Ping(); err != nil {
		return err
	}

	DB = db
	return nil
}

// EnsureDatabase สร้างฐานข้อมูลให้อัตโนมัติถ้ายังไม่มี
//
// PostgreSQL สร้างฐานข้อมูลจากคอนเนกชันที่ต่อฐานข้อมูลนั้นอยู่ไม่ได้
// จึงต้องต่อเข้าฐานข้อมูลกลางชื่อ postgres ก่อน แล้วค่อยสั่ง CREATE DATABASE
//
// คืนค่า true ถ้าเพิ่งสร้างใหม่
func EnsureDatabase() (bool, error) {
	dsn, err := DatabaseURL()
	if err != nil {
		return false, err
	}

	parsed, _ := url.Parse(dsn)
	name := strings.TrimPrefix(parsed.Path, "/")
	if name == "" {
		return false, errors.New("DATABASE_URL ไม่ได้ระบุชื่อฐานข้อมูล")
	}

	// บางเครื่องไม่มีฐานข้อมูลชื่อ postgres ลอง template1 เป็นตัวสำรอง
	var lastErr error
	for _, maintenance := range []string{"postgres", "template1"} {
		admin := *parsed
		admin.Path = "/" + maintenance

		conn, err := sql.Open("postgres", admin.String())
		if err != nil {
			lastErr = err
			continue
		}

		if err := conn.Ping(); err != nil {
			conn.Close()
			lastErr = err
			continue
		}

		created, err := createIfMissing(conn, name)
		conn.Close()
		if err != nil {
			return false, err
		}
		return created, nil
	}

	return false, lastErr
}

func createIfMissing(conn *sql.DB, name string) (bool, error) {
	var exists int
	err := conn.QueryRow(`SELECT 1 FROM pg_database WHERE datname = $1`, name).Scan(&exists)
	if err == nil {
		return false, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}

	// ชื่อฐานข้อมูลใส่เป็นพารามิเตอร์ไม่ได้ ต้องต่อเป็นข้อความ จึงใช้ตัวช่วย escape ของ lib/pq
	_, err = conn.Exec(`CREATE DATABASE ` + pq.QuoteIdentifier(name))
	if err != nil {
		var pgErr *pq.Error
		if errors.As(err, &pgErr) {
			switch pgErr.Code {
			case "42P04": // คนอื่นสร้างพร้อมกันพอดี ถือว่าสำเร็จ
				return false, nil
			case "42501":
				return false, fmt.Errorf(
					"บัญชีนี้ไม่มีสิทธิ์สร้างฐานข้อมูล\n"+
						"  ให้สร้างเองด้วยบัญชี postgres:  CREATE DATABASE %q;\n"+
						"  หรือให้สิทธิ์บัญชีนี้:  ALTER ROLE ชื่อผู้ใช้ CREATEDB;", name)
			}
		}
		return false, err
	}
	return true, nil
}

// Hint แปลง error ของฐานข้อมูลเป็นคำแนะนำภาษาไทย
func Hint(err error) string {
	if err == nil {
		return ""
	}

	var pgErr *pq.Error
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "28P01", "28000":
			return "ชื่อผู้ใช้หรือรหัสผ่านของฐานข้อมูลไม่ถูกต้อง\n" +
				"  แก้ DATABASE_URL ในไฟล์ backend/.env ให้ตรงกับของจริง\n" +
				"  รูปแบบ: postgres://ชื่อผู้ใช้:รหัสผ่าน@localhost:5432/line"
		case "3D000":
			return "ยังไม่มีฐานข้อมูลชื่อนี้\n  สั่ง go run ./cmd/migrate ได้เลย ระบบจะสร้างให้อัตโนมัติ"
		case "42P01":
			return "ต่อฐานข้อมูลได้ แต่ยังไม่มีตาราง\n  สั่ง go run ./cmd/migrate แล้ว go run ./cmd/seed"
		}
	}

	message := err.Error()
	if strings.Contains(message, "connection refused") {
		return "ต่อ PostgreSQL ไม่ได้ — เครื่องปลายทางปฏิเสธการเชื่อมต่อ\n" +
			"  • PostgreSQL ยังไม่ได้เปิดอยู่หรือเปล่า\n" +
			"    ใช้ Docker:  docker compose up -d\n" +
			"    ติดตั้งเอง: เปิด service ชื่อ postgresql ใน Services ของ Windows\n" +
			"  • พอร์ตใน DATABASE_URL ตรงกับที่ PostgreSQL ใช้ไหม (ปกติ 5432)"
	}
	if strings.Contains(message, "no such host") {
		return "หา host ใน DATABASE_URL ไม่เจอ ตรวจชื่อเครื่องอีกครั้ง"
	}
	return ""
}
