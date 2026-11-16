// Package translate แปลข้อความไทยเป็นอังกฤษและญี่ปุ่นให้อัตโนมัติ
//
// แนวคิด
//
//	ผู้ดูแลระบบกรอกข้อมูลเป็นภาษาไทยอย่างเดียว ระบบแปลให้เอง
//	ทุกข้อความที่แปลแล้วถูกจำไว้ในตาราง translation_cache ข้อความเดิมจึงไม่ถูกส่งไปแปลซ้ำ
//
// ลำดับการแปล
//
//  1. ที่พักคำแปล (translation_cache) — เร็วที่สุด ไม่ใช้เน็ต
//  2. บริการแปลออนไลน์ตามที่ตั้งไว้ใน TRANSLATE_PROVIDER
//  3. คลังคำในตัวโปรแกรม (glossary.go) — ใช้เมื่อเน็ตล่มหรือไม่ได้ต่อเน็ต
//
// ข้อ 3 สำคัญมากสำหรับเครื่องที่วางในวงแลนโรงงานซึ่งมักออกเน็ตไม่ได้
// ระบบจะไม่ค้างและไม่มีช่องว่างให้ผู้ใช้เห็น แค่คำแปลอาจหยาบกว่า
package translate

import (
	"crypto/sha1"
	"encoding/hex"
	"log"
	"strings"
	"sync"
	"time"

	"rewards/config"
	"rewards/store"
)

// Languages คือภาษาปลายทางที่ระบบแปลให้ ต้นทางเป็นภาษาไทยเสมอ
var Languages = []string{"en", "ja"}

// IsSupported บอกว่าเป็นภาษาที่ระบบรู้จักหรือไม่
func IsSupported(lang string) bool {
	return lang == "th" || lang == "en" || lang == "ja"
}

// Hash คือลายนิ้วมือของข้อความต้นฉบับ ใช้ทั้งเป็นกุญแจของที่พักคำแปล
// และใช้ดูว่าผู้ดูแลแก้ข้อความไทยไปหรือยัง (แก้แล้วต้องแปลใหม่)
func Hash(text string) string {
	sum := sha1.Sum([]byte(strings.TrimSpace(text)))
	return hex.EncodeToString(sum[:])
}

/* ---------- ตัวตัดวงจรของบริการออนไลน์ ---------- */

// เครื่องที่ออกเน็ตไม่ได้จะยิงพลาดทุกครั้งและเสียเวลารอ timeout ทุกข้อความ
// พลาดติดกันครบจำนวนหนึ่งแล้วจึงพักการเรียกไว้ชั่วคราว แล้วค่อยลองใหม่
const (
	failuresBeforePause = 3
	pauseDuration       = 10 * time.Minute
)

var (
	breaker   sync.Mutex
	failures  int
	pausedTil time.Time
	lastError string
)

func onlineAllowed() bool {
	breaker.Lock()
	defer breaker.Unlock()
	return time.Now().After(pausedTil)
}

func noteSuccess() {
	breaker.Lock()
	failures = 0
	lastError = ""
	breaker.Unlock()
}

func noteFailure(err error) {
	breaker.Lock()
	failures++
	lastError = err.Error()
	if failures >= failuresBeforePause {
		pausedTil = time.Now().Add(pauseDuration)
		failures = 0
		log.Printf("แปลออนไลน์ไม่สำเร็จหลายครั้ง พักไว้ %v แล้วใช้คลังคำในตัวโปรแกรมแทน (%v)",
			pauseDuration, err)
	}
	breaker.Unlock()
}

/* ---------- ข้อมูลสถานะ ---------- */

// Status บอกว่าตอนนี้ระบบแปลใช้อะไรอยู่ ใช้แสดงในหน้าผู้ดูแลระบบ
type Status struct {
	Provider  string `json:"provider"`  // ชื่อบริการที่ตั้งไว้
	Online    bool   `json:"online"`    // ตอนนี้เรียกบริการออนไลน์อยู่หรือพักไว้
	Fallback  string `json:"fallback"`  // ตัวสำรองที่ใช้เมื่อออนไลน์ไม่ได้
	LastError string `json:"lastError"` // ข้อความผิดพลาดล่าสุด (ถ้ามี)
}

func CurrentStatus() Status {
	breaker.Lock()
	paused := time.Now().Before(pausedTil)
	message := lastError
	breaker.Unlock()

	name := providerName()
	return Status{
		Provider:  name,
		Online:    name != "offline" && !paused,
		Fallback:  "คลังคำในตัวโปรแกรม",
		LastError: message,
	}
}

func providerName() string {
	return strings.ToLower(config.Getenv("TRANSLATE_PROVIDER", "auto"))
}

// Enabled บอกว่าเปิดการแปลอัตโนมัติไว้หรือไม่ ปิดได้จากหน้าตั้งค่าระบบ
func Enabled() bool {
	row, err := store.QueryOne(`SELECT value FROM settings WHERE key = 'translate.auto'`)
	if err != nil || row == nil {
		return true
	}
	value, _ := row["value"].(string)
	return value != "false" && value != "0"
}

/* ---------- ตัวแปลหลัก ---------- */

// Text แปลข้อความไทยหนึ่งก้อนเป็นภาษาที่ระบุ
//
// คืนข้อความเดิมถ้าแปลไม่ได้จริง ๆ ผู้ใช้จึงไม่เคยเห็นช่องว่าง
func Text(text, lang string) string {
	text = strings.TrimSpace(text)
	if text == "" || lang == "th" || !IsSupported(lang) {
		return text
	}

	// ข้อความที่ไม่มีตัวอักษรไทยเลย (เช่น ชื่อรุ่นสินค้า หรือ URL) ไม่ต้องแปล
	if !hasThai(text) {
		return text
	}

	hash := Hash(text)
	if cached, ok := fromCache(hash, lang); ok {
		return cached
	}

	result, provider := doTranslate(text, lang)
	if result == "" {
		return text
	}

	saveCache(hash, lang, text, result, provider)
	return result
}

// Many แปลหลายข้อความพร้อมกัน คืนแผนที่ ข้อความต้นฉบับ -> คำแปล
func Many(texts []string, lang string) map[string]string {
	out := make(map[string]string, len(texts))
	for _, text := range texts {
		trimmed := strings.TrimSpace(text)
		if trimmed == "" {
			continue
		}
		if _, done := out[trimmed]; done {
			continue
		}
		out[trimmed] = Text(trimmed, lang)
	}
	return out
}

func doTranslate(text, lang string) (string, string) {
	name := providerName()

	if name != "offline" && name != "none" && onlineAllowed() {
		result, err := callProvider(name, text, lang)
		if err == nil && strings.TrimSpace(result) != "" {
			noteSuccess()
			return result, name
		}
		if err != nil {
			noteFailure(err)
		}
	}

	// ตัวสำรอง: คลังคำในตัวโปรแกรม ไม่ต้องใช้เน็ต
	if result := Glossary(text, lang); result != "" {
		return result, "glossary"
	}
	return "", ""
}

func hasThai(text string) bool {
	for _, r := range text {
		if r >= 0x0E00 && r <= 0x0E7F {
			return true
		}
	}
	return false
}

/* ---------- ที่พักคำแปล ---------- */

func fromCache(hash, lang string) (string, bool) {
	row, err := store.QueryOne(
		`SELECT target_text FROM translation_cache WHERE source_hash = $1 AND target_lang = $2`,
		hash, lang)
	if err != nil || row == nil {
		return "", false
	}
	value, ok := row["target_text"].(string)
	return value, ok && value != ""
}

func saveCache(hash, lang, source, target, provider string) {
	_, err := store.Exec(`
		INSERT INTO translation_cache (source_hash, target_lang, source_text, target_text, provider)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (source_hash, target_lang)
		DO UPDATE SET target_text = EXCLUDED.target_text, provider = EXCLUDED.provider`,
		hash, lang, source, target, provider)
	if err != nil {
		log.Printf("เก็บคำแปลลงที่พักไม่สำเร็จ: %v", err)
	}
}

// ClearCache ล้างที่พักคำแปลทั้งหมด ใช้ตอนเปลี่ยนบริการแปลแล้วอยากได้ของใหม่หมด
func ClearCache() error {
	_, err := store.Exec(`DELETE FROM translation_cache`)
	return err
}
