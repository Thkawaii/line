package controllers

import (
	"encoding/json"
	"net/http"

	"rewards/store"
	"rewards/web"
)

/*
การแปลข้อความที่ผู้ดูแลระบบกรอกเอง

ข้อความต้นฉบับยังอยู่ในคอลัมน์เดิม (title, description, ...) เป็นภาษาไทย
ส่วนคำแปลเก็บรวมไว้ในคอลัมน์ translations เป็น JSON รูปแบบ
	{"en": {"title": "...", "description": "..."}, "ja": {...}}

เวลาส่งให้หน้าเว็บ ถ้าผู้ใช้เลือกภาษาอื่นจะเอาคำแปลมาทับคอลัมน์เดิม
ช่องไหนไม่ได้แปลก็ยังเป็นภาษาไทย ผู้ใช้จึงไม่เจอช่องว่าง
*/

// requestLanguage อ่านภาษาที่หน้าเว็บส่งมา รองรับเฉพาะภาษาที่ระบบมี
func requestLanguage(r *http.Request) string {
	switch web.Param(r, "lang", "th") {
	case "en":
		return "en"
	case "ja":
		return "ja"
	default:
		return "th"
	}
}

// localize เอาคำแปลมาทับข้อความต้นฉบับ แล้วเอาคอลัมน์ translations ออกจากผลลัพธ์
// เพราะหน้าเว็บฝั่งพนักงานไม่ต้องใช้ และทำให้ข้อมูลที่ส่งเล็กลง
func localize(rows []store.Row, lang string) []store.Row {
	for _, row := range rows {
		raw, ok := row["translations"]
		delete(row, "translations")
		if !ok || lang == "th" {
			continue
		}

		text, ok := raw.(string)
		if !ok || text == "" || text == "{}" {
			continue
		}

		var all map[string]map[string]string
		if err := json.Unmarshal([]byte(text), &all); err != nil {
			continue
		}

		for field, value := range all[lang] {
			// แปลทับเฉพาะช่องที่มีอยู่จริงและมีคำแปลไม่ว่าง
			if value == "" {
				continue
			}
			if _, exists := row[field]; exists {
				row[field] = value
			}
		}
	}
	return rows
}

// localizeOne ใช้กับผลลัพธ์แถวเดียว
func localizeOne(row store.Row, lang string) store.Row {
	if row == nil {
		return nil
	}
	localize([]store.Row{row}, lang)
	return row
}
