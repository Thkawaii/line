package translate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"rewards/config"
)

/*
บริการแปลออนไลน์

ตั้งค่าได้ที่ backend/.env

	TRANSLATE_PROVIDER=auto      auto | libre | google | mymemory | offline
	TRANSLATE_URL=...            ใช้กับ libre เท่านั้น เช่น http://192.168.1.60:5000
	TRANSLATE_KEY=...            กุญแจของบริการ (ถ้ามี)

auto     ลอง google ก่อน พลาดแล้วตกไปใช้คลังคำในตัวโปรแกรม
libre    LibreTranslate ที่ติดตั้งเองในวงแลน เหมาะกับโรงงานที่ออกเน็ตไม่ได้
	 และเป็นตัวเลือกที่แนะนำที่สุด เพราะข้อมูลไม่ออกนอกองค์กร
offline  ไม่เรียกเน็ตเลย ใช้คลังคำในตัวโปรแกรมอย่างเดียว
*/

var client = &http.Client{Timeout: 12 * time.Second}

func callProvider(name, text, lang string) (string, error) {
	switch name {
	case "libre":
		return libreTranslate(text, lang)
	case "google":
		return googleTranslate(text, lang)
	case "mymemory":
		return myMemoryTranslate(text, lang)
	case "auto":
		// ตั้ง TRANSLATE_URL ไว้ = มี LibreTranslate ของตัวเอง ใช้ตัวนั้นก่อน
		if config.Getenv("TRANSLATE_URL", "") != "" {
			if result, err := libreTranslate(text, lang); err == nil {
				return result, nil
			}
		}
		return googleTranslate(text, lang)
	default:
		return "", fmt.Errorf("ไม่รู้จักบริการแปลชื่อ %q", name)
	}
}

/* ---------- LibreTranslate ---------- */

func libreTranslate(text, lang string) (string, error) {
	base := strings.TrimRight(config.Getenv("TRANSLATE_URL", ""), "/")
	if base == "" {
		return "", errors.New("ยังไม่ได้ตั้ง TRANSLATE_URL")
	}

	payload := map[string]string{
		"q": text, "source": "th", "target": lang, "format": "text",
	}
	if key := config.Getenv("TRANSLATE_KEY", ""); key != "" {
		payload["api_key"] = key
	}

	body, _ := json.Marshal(payload)
	res, err := client.Post(base+"/translate", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LibreTranslate ตอบรหัส %d", res.StatusCode)
	}

	var parsed struct {
		TranslatedText string `json:"translatedText"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return "", err
	}
	return parsed.TranslatedText, nil
}

/* ---------- Google (จุดเชื่อมต่อสาธารณะ ไม่ต้องใช้กุญแจ) ---------- */

// รูปแบบผลลัพธ์เป็นอาเรย์ซ้อนกัน ส่วนที่ต้องการคือ data[0][i][0]
// ไม่ใช่ API ที่มีสัญญารองรับ จึงมีสิทธิ์เปลี่ยนรูปแบบหรือถูกจำกัดเมื่อไหร่ก็ได้
// เหมาะกับงานภายในปริมาณไม่มาก ถ้าต้องใช้จริงจังให้ตั้ง LibreTranslate ของตัวเอง
func googleTranslate(text, lang string) (string, error) {
	endpoint := "https://translate.googleapis.com/translate_a/single?client=gtx&sl=th&tl=" +
		url.QueryEscape(lang) + "&dt=t&q=" + url.QueryEscape(text)

	res, err := client.Get(endpoint)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("บริการแปลตอบรหัส %d", res.StatusCode)
	}

	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", err
	}

	var data []any
	if err := json.Unmarshal(raw, &data); err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "", errors.New("ผลลัพธ์จากบริการแปลว่างเปล่า")
	}

	chunks, ok := data[0].([]any)
	if !ok {
		return "", errors.New("รูปแบบผลลัพธ์จากบริการแปลไม่ตรงที่คาดไว้")
	}

	var out strings.Builder
	for _, chunk := range chunks {
		parts, ok := chunk.([]any)
		if !ok || len(parts) == 0 {
			continue
		}
		if piece, ok := parts[0].(string); ok {
			out.WriteString(piece)
		}
	}

	result := strings.TrimSpace(out.String())
	if result == "" {
		return "", errors.New("แปลแล้วได้ข้อความว่าง")
	}
	return result, nil
}

/* ---------- MyMemory ---------- */

func myMemoryTranslate(text, lang string) (string, error) {
	endpoint := "https://api.mymemory.translated.net/get?q=" + url.QueryEscape(text) +
		"&langpair=th|" + url.QueryEscape(lang)
	if email := config.Getenv("TRANSLATE_KEY", ""); email != "" {
		endpoint += "&de=" + url.QueryEscape(email)
	}

	res, err := client.Get(endpoint)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	var parsed struct {
		ResponseData struct {
			TranslatedText string `json:"translatedText"`
		} `json:"responseData"`
		ResponseStatus any `json:"responseStatus"`
	}
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return "", err
	}

	result := strings.TrimSpace(parsed.ResponseData.TranslatedText)
	if result == "" || strings.HasPrefix(result, "PLEASE SELECT") {
		return "", errors.New("MyMemory แปลข้อความนี้ไม่ได้")
	}
	return result, nil
}
