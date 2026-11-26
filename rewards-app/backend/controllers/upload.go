package controllers

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
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

// ขนาดสูงสุดของเอกสารแนบ ใหญ่กว่ารูปเพราะ PDF หลายหน้ามักเกินห้าเมกะไบต์
const maxDocumentBytes = 15 << 20 // 15 MB

/*
UploadDocument รับไฟล์เอกสารแนบของประกาศข่าวสาร

รองรับเฉพาะ PDF และตรวจจากไบต์จริง (%PDF-) ไม่ใช่จากนามสกุลหรือสิ่งที่หน้าเว็บบอกมา
เพราะนามสกุลปลอมได้ง่าย และไฟล์ที่ผู้ใช้เปิดในเบราว์เซอร์เป็นช่องทางโจมตีที่ดีถ้าปล่อยผ่าน

เก็บชื่อไฟล์เดิมไว้ให้หน้าเว็บแสดง แต่ตั้งชื่อไฟล์บนดิสก์เป็นตัวอักษรสุ่ม
ชื่อเดิมที่ผู้ใช้ตั้งมาจึงไม่ถูกนำไปใช้เป็นชื่อไฟล์จริง กันการหลุดออกนอกโฟลเดอร์
*/
func UploadDocument(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Data string `json:"data"`
		Name string `json:"name"`
	}
	if err := web.Decode(r, &body); err != nil || body.Data == "" {
		web.Error(w, http.StatusBadRequest, "ไม่พบข้อมูลไฟล์")
		return
	}

	_, encoded, found := strings.Cut(body.Data, ",")
	if !found {
		web.Error(w, http.StatusBadRequest, "รูปแบบข้อมูลไฟล์ไม่ถูกต้อง")
		return
	}

	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "ถอดรหัสไฟล์ไม่สำเร็จ")
		return
	}
	if len(raw) > maxDocumentBytes {
		web.Error(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("ไฟล์ใหญ่เกิน %d MB", maxDocumentBytes>>20))
		return
	}
	if len(raw) < 5 || string(raw[:5]) != "%PDF-" {
		web.Error(w, http.StatusBadRequest, "รองรับเฉพาะไฟล์ PDF")
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
	name := hex.EncodeToString(token) + ".pdf"

	if err := os.WriteFile(filepath.Join(dir, name), raw, 0o644); err != nil {
		web.Fail(w, err)
		return
	}

	// ชื่อที่แสดงให้ผู้ใช้เห็น ตัดอักขระที่ใช้หลอกตาได้ออก และจำกัดความยาว
	display := strings.TrimSpace(body.Name)
	display = strings.Map(func(r rune) rune {
		if r < 32 || r == '/' || r == '\\' {
			return -1
		}
		return r
	}, display)
	if display == "" {
		display = "เอกสารแนบ.pdf"
	}
	if len([]rune(display)) > 120 {
		display = string([]rune(display)[:120])
	}

	logAudit(claims.ID, "upload.document", display, fmt.Sprintf("%d KB", len(raw)/1024))
	web.JSON(w, http.StatusCreated, web.Map{"url": "/uploads/" + name, "name": display})
}

/*
วิดีโอประชาสัมพันธ์

ขนาดสูงสุด 1 GB คลิปอบรมเต็มความยาวหรือคลิปความละเอียดสูงอยู่ในช่วงนี้ได้
ถ้าใหญ่กว่านี้ควรฝากไว้ที่ YouTube แล้วใส่ลิงก์แทน ซึ่งหน้าจัดการรองรับอยู่แล้ว

ตัวเลขนี้ต้องสอดคล้องกับ client_max_body_size ใน nginx และ request_body
ใน Caddyfile ถ้าสองตัวนั้นเล็กกว่า คำขอจะถูกตัดทิ้งตั้งแต่ยังไม่ถึงโปรแกรม
แล้วผู้ใช้จะเห็นหน้า error ของพร็อกซีแทนข้อความบอกเหตุผลของระบบ
*/
const maxVideoBytes = 1 << 30 // 1 GB

/*
UploadVideo รับไฟล์วิดีโอแล้วเขียนลงดิสก์เป็นสตรีม

อ่านด้วย MultipartReader ไม่ใช่ r.FormFile

r.FormFile จะอ่านทั้งคำขอให้จบก่อน ส่วนที่เกิน 32 MB ถูกพักเป็นไฟล์ชั่วคราว
แล้วเราค่อยคัดลอกไปที่เก็บจริงอีกรอบ แปลว่าคลิป 1 GB ต้องเขียนดิสก์สองเที่ยว
และต้องมีที่ว่างราวสองเท่าของไฟล์ระหว่างอัปโหลด

MultipartReader อ่านไหลผ่านไปเขียนที่ปลายทางตรง ๆ
หน่วยความจำที่ใช้คงที่ และดิสก์ถูกเขียนเที่ยวเดียว
*/
func UploadVideo(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	// กันไว้อีกชั้นที่ตัวเชื่อมต่อ เผื่อหน้าเว็บส่งใหญ่กว่าที่ประกาศไว้
	r.Body = http.MaxBytesReader(w, r.Body, maxVideoBytes+(8<<20))

	reader, err := r.MultipartReader()
	if err != nil {
		web.Error(w, http.StatusBadRequest, "รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง")
		return
	}

	// ข้ามฟิลด์อื่นไปจนเจอช่องไฟล์ เผื่อหน้าเว็บส่งฟิลด์อื่นมาก่อน
	var part *multipart.Part
	for {
		next, err := reader.NextPart()
		if err != nil {
			web.Error(w, http.StatusBadRequest, "ไม่พบไฟล์วิดีโอ")
			return
		}
		if next.FormName() == "file" {
			part = next
			break
		}
		next.Close()
	}
	defer part.Close()

	/*
		ตรวจชนิดไฟล์จากไบต์จริง ไม่ใช่จากนามสกุลหรือ Content-Type ที่หน้าเว็บบอกมา
		เพราะทั้งสองอย่างนั้นปลอมได้ และไฟล์ที่ผู้ใช้เปิดในเบราว์เซอร์คือช่องทางโจมตีที่ดี

		mp4 ดูที่ไบต์ 4-7 ต้องเป็น ftyp ส่วน webm ขึ้นต้นด้วย EBML
		ไบต์ชุดนี้อ่านไปแล้วต้องเขียนลงไฟล์ด้วย จึงเก็บไว้ต่อหัวให้ก่อน
	*/
	head := make([]byte, 12)
	n, err := io.ReadFull(part, head)
	if err != nil && err != io.ErrUnexpectedEOF {
		web.Error(w, http.StatusBadRequest, "อ่านไฟล์วิดีโอไม่สำเร็จ")
		return
	}
	head = head[:n]

	extension := ""
	switch {
	case n >= 8 && string(head[4:8]) == "ftyp":
		extension = ".mp4"
	case n >= 4 && head[0] == 0x1A && head[1] == 0x45 && head[2] == 0xDF && head[3] == 0xA3:
		extension = ".webm"
	}
	if extension == "" {
		web.Error(w, http.StatusBadRequest, "รองรับเฉพาะไฟล์วิดีโอ MP4 และ WEBM")
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
	path := filepath.Join(dir, name)

	out, err := os.Create(path)
	if err != nil {
		web.Fail(w, err)
		return
	}

	written, err := io.Copy(out, io.LimitReader(io.MultiReader(bytes.NewReader(head), part), maxVideoBytes+1))
	closeErr := out.Close()

	switch {
	case err != nil || closeErr != nil:
		// เขียนไม่จบแล้วทิ้งไฟล์ครึ่ง ๆ ไว้ จะกลายเป็นคลิปเสียที่เล่นไม่ได้และไม่มีใครรู้
		os.Remove(path)
		web.Fail(w, err)
		return
	case written > maxVideoBytes:
		os.Remove(path)
		web.Error(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("ไฟล์ใหญ่เกิน %d MB", maxVideoBytes>>20))
		return
	}

	display := strings.TrimSpace(part.FileName())
	display = strings.Map(func(r rune) rune {
		if r < 32 || r == '/' || r == '\\' {
			return -1
		}
		return r
	}, display)
	if display == "" {
		display = "วิดีโอ" + extension
	}
	if len([]rune(display)) > 120 {
		display = string([]rune(display)[:120])
	}

	logAudit(claims.ID, "upload.video", display, fmt.Sprintf("%d MB", written>>20))
	web.JSON(w, http.StatusCreated, web.Map{
		"url": "/uploads/" + name, "name": display, "size": written,
	})
}
