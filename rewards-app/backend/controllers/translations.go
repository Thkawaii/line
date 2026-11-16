package controllers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"rewards/middleware"
	"rewards/store"
	"rewards/translate"
	"rewards/web"
)

/*
แปลเนื้อหาที่ผู้ดูแลระบบกรอกให้อัตโนมัติ

ผู้ดูแลกรอกภาษาไทยอย่างเดียว ตัวนี้ทำงานอยู่เบื้องหลังคอยแปลเป็นอังกฤษกับญี่ปุ่น
แล้วเก็บลงคอลัมน์ translations ของแถวนั้น ๆ รูปแบบที่เก็บคือ

	{
	  "en":   {"title": "...", "description": "..."},
	  "ja":   {"title": "...", "description": "..."},
	  "_src": {"title": "<ลายนิ้วมือของข้อความไทย>", ...}
	}

_src คือหัวใจของการ "อัปเดตคำแปลเมื่อมีการแก้ไข" — ถ้าผู้ดูแลแก้ข้อความไทย
ลายนิ้วมือจะไม่ตรงกับของเดิม ตัวนี้จึงรู้เองว่าต้องแปลช่องนั้นใหม่
ช่องที่ไทยไม่เปลี่ยนจะไม่ถูกแตะ คำแปลที่ผู้ดูแลแก้เองด้วยมือจึงอยู่คงเดิม

ทำงานเบื้องหลังแทนการแปลตอนกดบันทึก เพราะ
  - ผู้ดูแลไม่ต้องรอบริการแปลตอบ กดบันทึกแล้วจบทันที
  - ข้อมูลเก่าที่มีอยู่ก่อนติดตั้งระบบแปลก็ถูกไล่แปลให้ด้วยโดยไม่ต้องสั่งอะไร
  - บริการแปลล่มไม่กระทบการใช้งาน รอบถัดไปค่อยลองใหม่
*/

// target บอกว่าตารางไหนมีช่องอะไรที่ต้องแปล
type target struct {
	Table  string   // ชื่อตาราง
	Key    string   // คอลัมน์กุญแจ ปกติคือ id
	Label  string   // ชื่อที่แสดงในหน้าผู้ดูแลระบบ
	Fields []string // ช่องที่ต้องแปล
	Scope  string   // เงื่อนไขเพิ่มเติม เช่น จำกัดเฉพาะรายการใหม่
}

// ลำดับในอาเรย์นี้คือลำดับที่แสดงในหน้าจัดการคำแปล
var translationTargets = []target{
	{Table: "rewards", Key: "id", Label: "ของรางวัล",
		Fields: []string{"name", "description", "how_to", "conditions", "category"}},
	{Table: "events", Key: "id", Label: "กิจกรรม",
		Fields: []string{"title", "description", "agenda", "location"}},
	{Table: "event_options", Key: "id", Label: "ตัวเลือกการโหวต",
		Fields: []string{"label", "detail"}},
	{Table: "banners", Key: "id", Label: "แบนเนอร์",
		Fields: []string{"title"}},
	{Table: "announcements", Key: "id", Label: "ประกาศข่าวสาร",
		Fields: []string{"title", "summary", "body"}},
	{Table: "notifications", Key: "id", Label: "ประกาศและแจ้งเตือน",
		Fields: []string{"title", "body"},
		// ประกาศเก่ามากไม่มีใครเปิดอ่านแล้ว ไม่ต้องเสียเวลาแปล
		Scope: "created_at > now() - interval '365 days'"},
	{Table: "faqs", Key: "id", Label: "คำถามที่พบบ่อย",
		Fields: []string{"question", "answer"}},
	{Table: "policies", Key: "key", Label: "ข้อกำหนดและนโยบาย",
		Fields: []string{"title", "content"}},
	{Table: "tiers", Key: "key", Label: "ระดับสมาชิก",
		Fields: []string{"name", "subtitle", "description", "benefits"}},
	{Table: "survey_topics", Key: "id", Label: "หัวข้อลงทะเบียน/แบบสำรวจ",
		Fields: []string{"title", "heading", "description"}},
}

func targetByTable(name string) (target, bool) {
	for _, item := range translationTargets {
		if item.Table == name {
			return item, true
		}
	}
	return target{}, false
}

/* ---------- ตัวแปลเบื้องหลัง ---------- */

// จำกัดจำนวนแถวต่อรอบ เพื่อไม่ให้รอบเดียวยิงบริการแปลรัวจนโดนปิดกั้น
const rowsPerCycle = 25

var syncing sync.Mutex

// SyncResult สรุปว่ารอบที่ผ่านมาแปลอะไรไปบ้าง
type SyncResult struct {
	Updated int            `json:"updated"` // จำนวนแถวที่เขียนคำแปลใหม่
	Pending int            `json:"pending"` // ยังเหลือรอแปลอีกกี่แถว
	ByTable map[string]int `json:"byTable"`
}

// SyncTranslations ไล่แปลแถวที่ยังขาดคำแปลหรือข้อความไทยเปลี่ยนไป
//
// force = true ข้ามตัวหน่วงเวลา ใช้ตอนผู้ดูแลกดปุ่มแปลเองหลังเพิ่งต่อเน็ตได้
func SyncTranslations(force bool) SyncResult {
	result := SyncResult{ByTable: map[string]int{}}

	// กันไม่ให้สองรอบทำงานทับกัน (ตัวตั้งเวลากับปุ่มกดจากหน้าเว็บ)
	if !syncing.TryLock() {
		return result
	}
	defer syncing.Unlock()

	if !translate.Enabled() {
		return result
	}

	budget := rowsPerCycle
	for _, item := range translationTargets {
		rows, err := loadRows(item)
		if err != nil {
			log.Printf("อ่านตาราง %s เพื่อแปลไม่สำเร็จ: %v", item.Table, err)
			continue
		}

		for _, row := range rows {
			updates, changed := planRow(item, row, force)
			if !changed {
				continue
			}
			if budget <= 0 {
				result.Pending++
				continue
			}

			if err := writeTranslations(item, row[item.Key], updates); err != nil {
				log.Printf("บันทึกคำแปลของ %s ไม่สำเร็จ: %v", item.Table, err)
				continue
			}
			budget--
			result.Updated++
			result.ByTable[item.Table]++
		}
	}

	return result
}

func loadRows(item target) ([]store.Row, error) {
	columns := append([]string{item.Key}, item.Fields...)
	where := ""
	if item.Scope != "" {
		where = " WHERE " + item.Scope
	}

	return store.Query(fmt.Sprintf(
		`SELECT %s, translations FROM %s%s ORDER BY %s DESC LIMIT 500`,
		strings.Join(columns, ", "), item.Table, where, item.Key))
}

// bundle คือคอลัมน์ translations ที่แกะออกมาเป็นโครงสร้าง Go แล้ว
type bundle struct {
	Langs map[string]map[string]string // en/ja -> ช่อง -> คำแปล
	Src   map[string]string            // ช่อง -> ลายนิ้วมือของข้อความไทยตอนที่แปล
	Meta  map[string]string            // ข้อมูลภายใน เช่น เวลาที่ลองแปลแล้วไม่สำเร็จ
}

func readBundle(raw any) bundle {
	out := bundle{
		Langs: map[string]map[string]string{},
		Src:   map[string]string{},
		Meta:  map[string]string{},
	}

	text, _ := raw.(string)
	if text == "" {
		return out
	}

	var parsed map[string]map[string]string
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		return out
	}

	for key, value := range parsed {
		switch key {
		case "_src":
			out.Src = value
		case "_meta":
			out.Meta = value
		default:
			out.Langs[key] = value
		}
	}
	return out
}

func (b bundle) toJSON() ([]byte, error) {
	all := map[string]map[string]string{}
	for lang, fields := range b.Langs {
		all[lang] = fields
	}
	all["_src"] = b.Src
	if len(b.Meta) > 0 {
		all["_meta"] = b.Meta
	}
	return json.Marshal(all)
}

// retryAfter คือเวลารออย่างน้อยก่อนลองแปลแถวที่เพิ่งแปลไม่สำเร็จอีกครั้ง
//
// ถ้าไม่มีตัวหน่วงนี้ เครื่องที่ออกเน็ตไม่ไม่ได้จะวนลองแปลข้อความเดิมทุกรอบไม่จบ
// เปลืองทั้งแรงเครื่องและ log ผู้ดูแลที่อยากให้ลองใหม่ทันทีกดปุ่มที่หน้าเว็บได้
const retryAfter = 6 * time.Hour

func retryDue(current bundle, force bool) bool {
	if force {
		return true
	}
	stamp := current.Meta["triedAt"]
	if stamp == "" {
		return true
	}
	last, err := time.Parse(time.RFC3339, stamp)
	if err != nil {
		return true
	}
	return time.Since(last) >= retryAfter
}

// planRow ดูว่าแถวนี้ต้องแปลช่องไหนบ้าง แล้วแปลให้ คืน true ถ้ามีอะไรต้องเขียนกลับ
func planRow(item target, row store.Row, force bool) (bundle, bool) {
	current := readBundle(row["translations"])

	// ยังมีช่องไหนค้างอยู่ไหม เช็กก่อนเพื่อไม่ต้องเสียเวลากับแถวที่แปลครบแล้ว
	todo := make([]string, 0, len(item.Fields))
	for _, field := range item.Fields {
		source, _ := row[field].(string)
		if strings.TrimSpace(source) == "" {
			continue
		}
		if current.Src[field] != translate.Hash(source) || !hasAllLangs(current, field) {
			todo = append(todo, field)
		}
	}
	if len(todo) == 0 || !retryDue(current, force) {
		return current, false
	}

	changed, failed := false, false

	for _, field := range todo {
		source := strings.TrimSpace(row[field].(string))
		fingerprint := translate.Hash(source)
		fieldDone := true

		for _, lang := range translate.Languages {
			translated := translate.Text(source, lang)
			if translated == "" || translated == source {
				// แปลไม่ได้ เช่น เน็ตล่มและคลังคำก็ไม่ครอบคลุมข้อความนี้
				// ปล่อยไว้แบบนี้ ผู้ใช้จะเห็นภาษาไทยต้นฉบับแทนที่จะเห็นข้อความพัง
				fieldDone = false
				continue
			}
			if current.Langs[lang] == nil {
				current.Langs[lang] = map[string]string{}
			}
			current.Langs[lang][field] = translated
			changed = true
		}

		if fieldDone {
			current.Src[field] = fingerprint
		} else {
			failed = true
		}
	}

	if failed {
		current.Meta["triedAt"] = time.Now().Format(time.RFC3339)
		return current, true // เขียนกลับเพื่อจดเวลาไว้ จะได้ไม่วนลองทุกรอบ
	}

	delete(current.Meta, "triedAt")
	return current, changed
}

func hasAllLangs(b bundle, field string) bool {
	for _, lang := range translate.Languages {
		if b.Langs[lang] == nil || b.Langs[lang][field] == "" {
			return false
		}
	}
	return true
}

func writeTranslations(item target, key any, data bundle) error {
	payload, err := data.toJSON()
	if err != nil {
		return err
	}
	_, err = store.Exec(fmt.Sprintf(
		`UPDATE %s SET translations = $2::jsonb WHERE %s = $1`, item.Table, item.Key),
		key, string(payload))
	return err
}

// StartTranslationWorker เริ่มตัวแปลเบื้องหลัง เรียกครั้งเดียวตอนเปิดเซิร์ฟเวอร์
//
// รอบแรกหน่วงไว้ครู่หนึ่งเพื่อให้เซิร์ฟเวอร์พร้อมรับงานก่อน
// จากนั้นทำทุก ๆ ช่วงเวลาที่ตั้งไว้ รอบไหนไม่มีอะไรต้องแปลก็จบเร็วมาก
func StartTranslationWorker(interval time.Duration) {
	go func() {
		time.Sleep(15 * time.Second)
		for {
			if result := SyncTranslations(false); result.Updated > 0 {
				log.Printf("แปลเนื้อหาอัตโนมัติ: อัปเดต %d รายการ", result.Updated)
			}
			time.Sleep(interval)
		}
	}()
}

/* ---------- API ฝั่งผู้ดูแลระบบ ---------- */

// AdminTranslationStatus สรุปว่าแต่ละตารางแปลครบแล้วกี่รายการ
func AdminTranslationStatus(w http.ResponseWriter, r *http.Request) {
	tables := make([]web.Map, 0, len(translationTargets))

	for _, item := range translationTargets {
		rows, err := loadRows(item)
		if err != nil {
			continue
		}

		total, done := 0, 0
		for _, row := range rows {
			if !hasAnySource(item, row) {
				continue
			}
			total++
			if _, changed := planRowDryRun(item, row); !changed {
				done++
			}
		}

		tables = append(tables, web.Map{
			"table": item.Table, "label": item.Label,
			"fields": item.Fields, "total": total, "translated": done,
			"pending": total - done,
		})
	}

	web.JSON(w, http.StatusOK, web.Map{
		"tables":    tables,
		"engine":    translate.CurrentStatus(),
		"enabled":   translate.Enabled(),
		"languages": translate.Languages,
	})
}

func hasAnySource(item target, row store.Row) bool {
	for _, field := range item.Fields {
		if value, _ := row[field].(string); strings.TrimSpace(value) != "" {
			return true
		}
	}
	return false
}

// planRowDryRun ตอบว่าแถวนี้ยังค้างแปลอยู่ไหม โดยไม่เรียกบริการแปลจริง
func planRowDryRun(item target, row store.Row) (bundle, bool) {
	current := readBundle(row["translations"])

	for _, field := range item.Fields {
		source, _ := row[field].(string)
		source = strings.TrimSpace(source)
		if source == "" {
			continue
		}
		if current.Src[field] != translate.Hash(source) || !hasAllLangs(current, field) {
			return current, true
		}
	}
	return current, false
}

// AdminTranslationItems ส่งรายการของตารางหนึ่งพร้อมคำแปลทั้งสามภาษา
// ใช้ให้ผู้ดูแลตรวจทานและแก้คำแปลที่ระบบแปลมาไม่ถูกใจ
func AdminTranslationItems(w http.ResponseWriter, r *http.Request) {
	item, ok := targetByTable(web.Param(r, "table", ""))
	if !ok {
		web.Error(w, http.StatusBadRequest, "ไม่รู้จักหมวดเนื้อหานี้")
		return
	}

	rows, err := loadRows(item)
	if err != nil {
		web.Fail(w, err)
		return
	}

	items := make([]web.Map, 0, len(rows))
	for _, row := range rows {
		if !hasAnySource(item, row) {
			continue
		}
		current := readBundle(row["translations"])

		fields := make([]web.Map, 0, len(item.Fields))
		for _, field := range item.Fields {
			source, _ := row[field].(string)
			if strings.TrimSpace(source) == "" {
				continue
			}
			fields = append(fields, web.Map{
				"name": field, "th": source,
				"en": current.Langs["en"][field],
				"ja": current.Langs["ja"][field],
			})
		}

		_, pending := planRowDryRun(item, row)
		items = append(items, web.Map{
			"id": row[item.Key], "fields": fields, "pending": pending,
		})
	}

	web.JSON(w, http.StatusOK, web.Map{
		"table": item.Table, "label": item.Label, "items": items,
	})
}

// AdminRunTranslations สั่งแปลรอบหนึ่งทันที ไม่ต้องรอตัวตั้งเวลา
func AdminRunTranslations(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)
	result := SyncTranslations(true)
	logAudit(claims.ID, "translation.run", "", fmt.Sprintf("อัปเดต %d รายการ", result.Updated))
	web.JSON(w, http.StatusOK, web.Map{"result": result})
}

// AdminRebuildTranslations ล้างคำแปลเดิมแล้วแปลใหม่ทั้งหมด
//
// ใช้ตอนเปลี่ยนบริการแปล หรือตอนที่คำแปลชุดเดิมคุณภาพไม่ดีเพราะยังไม่ได้ต่อเน็ต
// คำแปลที่ผู้ดูแลแก้ด้วยมือจะหายไปด้วย จึงต้องกดยืนยันที่หน้าเว็บก่อน
func AdminRebuildTranslations(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		ClearCache bool `json:"clearCache"`
	}
	_ = web.Decode(r, &body)

	for _, item := range translationTargets {
		if _, err := store.Exec(fmt.Sprintf(
			`UPDATE %s SET translations = '{}'::jsonb`, item.Table)); err != nil {
			web.Fail(w, err)
			return
		}
	}

	if body.ClearCache {
		if err := translate.ClearCache(); err != nil {
			web.Fail(w, err)
			return
		}
	}

	logAudit(claims.ID, "translation.rebuild", "", "ล้างคำแปลเดิมทั้งหมดแล้วแปลใหม่")
	result := SyncTranslations(true)
	web.JSON(w, http.StatusOK, web.Map{"result": result})
}

// AdminSaveTranslation ให้ผู้ดูแลแก้คำแปลเองรายช่อง
//
// เมื่อแก้แล้วระบบจะปักลายนิ้วมือของข้อความไทยปัจจุบันไว้ ตัวแปลเบื้องหลังจึงไม่เขียนทับ
// แต่ถ้าภายหลังมีการแก้ข้อความไทย ลายนิ้วมือจะไม่ตรงและระบบจะแปลใหม่ให้เองตามเดิม
func AdminSaveTranslation(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	item, ok := targetByTable(r.PathValue("table"))
	if !ok {
		web.Error(w, http.StatusBadRequest, "ไม่รู้จักหมวดเนื้อหานี้")
		return
	}

	var body struct {
		ID     string            `json:"id"`
		Lang   string            `json:"lang"`
		Values map[string]string `json:"values"`
	}
	if err := web.Decode(r, &body); err != nil || body.ID == "" ||
		(body.Lang != "en" && body.Lang != "ja") {
		web.Error(w, http.StatusBadRequest, "ข้อมูลคำแปลไม่ถูกต้อง")
		return
	}

	columns := append([]string{item.Key}, item.Fields...)
	row, err := store.QueryOne(fmt.Sprintf(
		`SELECT %s, translations FROM %s WHERE %s::text = $1`,
		strings.Join(columns, ", "), item.Table, item.Key), body.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบรายการนี้")
		return
	}

	current := readBundle(row["translations"])
	if current.Langs[body.Lang] == nil {
		current.Langs[body.Lang] = map[string]string{}
	}

	for field, value := range body.Values {
		if !contains(item.Fields, field) {
			continue
		}
		current.Langs[body.Lang][field] = strings.TrimSpace(value)

		// ปักหมุดว่าคำแปลชุดนี้ตรงกับข้อความไทยปัจจุบันแล้ว
		if source, _ := row[field].(string); strings.TrimSpace(source) != "" {
			current.Src[field] = translate.Hash(source)
		}
	}

	if err := writeTranslations(item, row[item.Key], current); err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "translation.edit", item.Label, "แก้คำแปลภาษา "+body.Lang)
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}
