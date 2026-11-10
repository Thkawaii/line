package controllers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"rewards/config"
	"rewards/middleware"
	"rewards/web"
)

// ขนาดสูงสุดของรูปหลังถอดรหัสแล้ว กันคนอัปไฟล์ใหญ่จนเต็มดิสก์
const maxUploadBytes = 5 << 20 // 5 MB

// ชนิดไฟล์ที่ยอมรับ ตรวจจากไบต์จริงไม่ใช่จากนามสกุลหรือสิ่งที่หน้าเว็บบอกมา
var imageTypes = []struct {
	mime      string
	extension string
	magic     []byte
}{
	{"image/jpeg", ".jpg", []byte{0xFF, 0xD8, 0xFF}},
	{"image/png", ".png", []byte{0x89, 0x50, 0x4E, 0x47}},
	{"image/webp", ".webp", []byte("RIFF")},
}

func UploadDir() string {
	return config.Getenv("UPLOAD_DIR", "uploads")
}

// Upload รับรูปเป็น data URL จากตัวครอปฝั่งหน้าเว็บ แล้วเก็บเป็นไฟล์
// ส่ง data URL มาแทน multipart เพราะรูปถูกครอปด้วย canvas อยู่แล้ว
func Upload(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Data string `json:"data"`
	}
	if err := web.Decode(r, &body); err != nil || body.Data == "" {
		web.Error(w, http.StatusBadRequest, "ไม่พบข้อมูลรูปภาพ")
		return
	}

	_, encoded, found := strings.Cut(body.Data, ",")
	if !found {
		web.Error(w, http.StatusBadRequest, "รูปแบบข้อมูลรูปภาพไม่ถูกต้อง")
		return
	}

	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "ถอดรหัสรูปภาพไม่สำเร็จ")
		return
	}
	if len(raw) > maxUploadBytes {
		web.Error(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("ไฟล์ใหญ่เกิน %d MB", maxUploadBytes>>20))
		return
	}

	extension := ""
	for _, t := range imageTypes {
		if len(raw) >= len(t.magic) && string(raw[:len(t.magic)]) == string(t.magic) {
			extension = t.extension
			break
		}
	}
	if extension == "" {
		web.Error(w, http.StatusBadRequest, "รองรับเฉพาะไฟล์ JPG, PNG และ WEBP")
		return
	}

	dir := UploadDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		web.Fail(w, err)
		return
	}

	token := make([]byte, 8)
	if _, err := rand.Read(token); err != nil {
		web.Fail(w, err)
		return
	}
	name := hex.EncodeToString(token) + extension

	if err := os.WriteFile(filepath.Join(dir, name), raw, 0o644); err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "upload.create", name, fmt.Sprintf("%d KB", len(raw)/1024))
	web.JSON(w, http.StatusCreated, web.Map{"url": "/uploads/" + name})
}
