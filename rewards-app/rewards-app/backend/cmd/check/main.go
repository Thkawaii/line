package main

import (
	"fmt"
	"os"
	"regexp"

	"rewards/config"
	"rewards/store"
)

// ตรวจว่าต่อ PostgreSQL ได้ไหมและมีตารางครบหรือยัง
// ใช้เวลาเจอปัญหา จะได้รู้ว่าติดตรงไหนโดยไม่ต้องเดา
// รัน: go run ./cmd/check
var tables = []string{
	"users", "point_transactions", "events", "event_registrations", "rewards",
	"redemptions", "favorites", "notifications", "banners", "faqs", "policies",
	"tiers", "settings", "audit_logs", "notification_events",
}

var passwordPattern = regexp.MustCompile(`://([^:/@]+):[^@]*@`)

func main() {
	config.LoadEnv(".env", "../.env")

	dsn, err := config.DatabaseURL()
	if err != nil {
		fmt.Println(err)
		os.Exit(1)
	}

	// ซ่อนรหัสผ่านตอนพิมพ์ออกหน้าจอ
	fmt.Printf("กำลังต่อ: %s\n", passwordPattern.ReplaceAllString(dsn, "://$1:****@"))

	if err := config.Connect(); err != nil {
		report(err)
	}

	version, err := store.QueryOne(`SELECT current_database() AS db, version() AS version`)
	if err != nil {
		report(err)
	}

	fmt.Printf("ต่อสำเร็จ — ฐานข้อมูล %q\n", version["db"])
	fmt.Printf("  %s\n", firstSegment(fmt.Sprint(version["version"])))

	found, err := store.Query(`
		SELECT table_name FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = ANY($1)`, pgArray(tables))
	if err != nil {
		report(err)
	}

	present := map[string]bool{}
	for _, row := range found {
		name, _ := row["table_name"].(string)
		present[name] = true
	}

	missing := []string{}
	for _, table := range tables {
		if !present[table] {
			missing = append(missing, table)
		}
	}

	if len(missing) > 0 {
		fmt.Printf("\nยังไม่มีตาราง %d ตาราง: %v\n", len(missing), missing)
		fmt.Println("  สั่ง go run ./cmd/migrate แล้วตามด้วย go run ./cmd/seed")
		os.Exit(1)
	}

	counts, err := store.QueryOne(`
		SELECT (SELECT count(*) FROM users)::int AS users,
		       (SELECT count(*) FROM rewards)::int AS rewards,
		       (SELECT count(*) FROM events)::int AS events`)
	if err != nil {
		report(err)
	}

	fmt.Printf("ตารางครบ %d ตาราง\n", len(tables))
	fmt.Printf("  ผู้ใช้ %v คน · ของรางวัล %v ชิ้น · กิจกรรม %v รายการ\n",
		counts["users"], counts["rewards"], counts["events"])

	if fmt.Sprint(counts["users"]) == "0" {
		fmt.Println("  ยังไม่มีข้อมูล — สั่ง go run ./cmd/seed")
	}
}

func report(err error) {
	fmt.Println("\nต่อฐานข้อมูลไม่สำเร็จ")
	fmt.Printf("  ข้อความจากระบบ: %v\n", err)
	if hint := config.Hint(err); hint != "" {
		fmt.Printf("\n%s\n", hint)
	}
	os.Exit(1)
}

func firstSegment(text string) string {
	for i, c := range text {
		if c == ',' {
			return text[:i]
		}
	}
	return text
}

// pgArray แปลง slice เป็นรูปแบบ array ของ PostgreSQL
func pgArray(values []string) string {
	out := "{"
	for i, value := range values {
		if i > 0 {
			out += ","
		}
		out += value
	}
	return out + "}"
}
