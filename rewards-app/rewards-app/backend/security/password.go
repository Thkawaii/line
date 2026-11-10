package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// แฮชรหัสผ่านด้วย PBKDF2-HMAC-SHA256
//
// เลือก PBKDF2 เพราะประกอบจาก crypto/hmac กับ crypto/sha256 ที่มากับ Go อยู่แล้ว
// ไม่ต้องพึ่ง golang.org/x/crypto ทำให้ build ได้แม้เครื่องที่ดึงโมดูลนั้นไม่ได้
// PBKDF2 เป็นอัลกอริทึมมาตรฐาน (RFC 8018) ที่ NIST ยังรับรองให้ใช้กับรหัสผ่าน
//
// รูปแบบที่เก็บลงฐานข้อมูล: pbkdf2_sha256$รอบ$เกลือ$แฮช  (เกลือและแฮชเป็น base64)

const (
	iterations = 210000 // ตามที่ OWASP แนะนำสำหรับ PBKDF2-HMAC-SHA256
	saltSize   = 16
	keySize    = 32
	prefix     = "pbkdf2_sha256"
)

func HashPassword(password string) (string, error) {
	salt := make([]byte, saltSize)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	key := pbkdf2SHA256([]byte(password), salt, iterations, keySize)

	return fmt.Sprintf("%s$%d$%s$%s",
		prefix,
		iterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// CheckPassword เทียบรหัสผ่านกับแฮชที่เก็บไว้ ใช้การเทียบแบบเวลาคงที่กันการวัดเวลาตอบกลับ
func CheckPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != prefix {
		return false
	}

	rounds, err := strconv.Atoi(parts[1])
	if err != nil || rounds <= 0 {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}

	expected, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}

	actual := pbkdf2SHA256([]byte(password), salt, rounds, len(expected))
	return subtle.ConstantTimeCompare(actual, expected) == 1
}

var errEmptySecret = errors.New("JWT_SECRET ยังไม่ได้ตั้งค่า")

// pbkdf2SHA256 คือ PBKDF2 ตาม RFC 8018 ที่ใช้ HMAC-SHA256 เป็นฟังก์ชันหลัก
func pbkdf2SHA256(password, salt []byte, rounds, length int) []byte {
	hashLen := sha256.Size
	blocks := (length + hashLen - 1) / hashLen
	out := make([]byte, 0, blocks*hashLen)

	mac := hmac.New(sha256.New, password)
	block := make([]byte, 4)
	buffer := make([]byte, hashLen)

	for index := 1; index <= blocks; index++ {
		mac.Reset()
		mac.Write(salt)
		block[0] = byte(index >> 24)
		block[1] = byte(index >> 16)
		block[2] = byte(index >> 8)
		block[3] = byte(index)
		mac.Write(block)
		current := mac.Sum(nil)
		copy(buffer, current)

		for round := 2; round <= rounds; round++ {
			mac.Reset()
			mac.Write(current)
			current = mac.Sum(current[:0])
			for i := range buffer {
				buffer[i] ^= current[i]
			}
		}

		out = append(out, buffer...)
	}

	return out[:length]
}
