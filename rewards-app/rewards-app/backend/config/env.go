package config

import (
	"bufio"
	"os"
	"strings"
)

// LoadEnv อ่านไฟล์ .env ใส่เข้า environment
// เขียนเองเพราะต้องการแค่รูปแบบ KEY=VALUE ธรรมดา ไม่ต้องพึ่งไลบรารีเพิ่ม
// ค่าที่ตั้งมาจาก environment อยู่แล้วจะไม่ถูกทับ
func LoadEnv(paths ...string) {
	if len(paths) == 0 {
		paths = []string{".env", "../.env"}
	}

	for _, path := range paths {
		file, err := os.Open(path)
		if err != nil {
			continue
		}

		scanner := bufio.NewScanner(file)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}

			key, value, found := strings.Cut(line, "=")
			if !found {
				continue
			}

			key = strings.TrimSpace(key)
			value = strings.TrimSpace(value)

			// รองรับค่าที่ครอบด้วยเครื่องหมายคำพูด
			if len(value) >= 2 {
				if (value[0] == '"' && value[len(value)-1] == '"') ||
					(value[0] == '\'' && value[len(value)-1] == '\'') {
					value = value[1 : len(value)-1]
				}
			}

			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, value)
			}
		}
		file.Close()
		return
	}
}

func Getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
