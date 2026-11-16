package controllers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"rewards/config"
	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/* ---------- หน้าแรก ---------- */

// tierProgress หาเกณฑ์ของระดับถัดไปจากตาราง tiers
// อ่านจากฐานข้อมูลเพื่อให้แอดมินแก้เกณฑ์ได้โดยไม่ต้องแก้โค้ด
func tierProgress(tier string) (any, any, error) {
	rows, err := store.Query(`SELECT key, name, min_points FROM tiers ORDER BY min_points`)
	if err != nil {
		return nil, nil, err
	}

	for i, row := range rows {
		if key, _ := row["key"].(string); key == tier {
			if i+1 < len(rows) {
				return rows[i+1]["min_points"], rows[i+1]["name"], nil
			}
			break
		}
	}
	return nil, nil, nil
}

func setting(key, fallback string) string {
	row, err := store.QueryOne(`SELECT value FROM settings WHERE key = $1`, key)
	if err != nil || row == nil {
		return fallback
	}
	value, _ := row["value"].(string)
	if value == "" {
		return fallback
	}
	return value
}

func Home(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	// ตรวจระดับให้ตรงกับคะแนนก่อนแสดงผล เผื่อคะแนนถูกแก้จากทางอื่น
	SyncTier(claims.ID)

	// ตัดยอดคะแนนพิเศษที่หมดอายุก่อนแสดงผล ยอดที่เห็นจะได้ตรงกับความจริงทันที
	// ไม่ต้องรอรอบของตัวตั้งเวลา
	if _, err := ExpireSpecialPoints(claims.ID); err != nil {
		log.Printf("ตัดยอดคะแนนพิเศษที่หมดอายุไม่สำเร็จ: %v", err)
	}

	user, err := store.QueryOne(`
		SELECT u.display_name, u.tier, u.points, u.special_points, u.points_expire_at,
		       u.special_points_expire_at, t.color AS tier_color
		FROM users u LEFT JOIN tiers t ON t.key = u.tier WHERE u.id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if user == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบบัญชีนี้")
		return
	}
	withExpiry(user)

	lang := requestLanguage(r)

	banners, err := store.Query(
		`SELECT id, title, image_url, link_url, translations FROM banners WHERE active ORDER BY sort_order`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	rewards, err := store.Query(`
		SELECT r.id, r.name, r.image_url, r.points, r.old_points, r.stock, r.translations,
		       r.min_tier, r.point_kind,
		       (COALESCE(rt.min_points,0) > COALESCE(ut.min_points,0)) AS locked,
		       CASE WHEN r.ends_at IS NOT NULL THEN (r.ends_at - current_date)::int END AS days_left
		FROM rewards r
		LEFT JOIN users u ON u.id = $1
		LEFT JOIN tiers ut ON ut.key = u.tier
		LEFT JOIN tiers rt ON rt.key = r.min_tier
		WHERE r.status = 'active'
		  AND (r.starts_at IS NULL OR r.starts_at <= current_date)
		  AND (r.ends_at IS NULL OR r.ends_at >= current_date)
		ORDER BY r.created_at DESC LIMIT 6`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	events, err := store.Query(`
		SELECT id, title, image_url, event_date, end_date, start_time, end_time, location,
		       points, special_points, special_points_expire_at, kind, translations
		FROM events WHERE status = 'open' ORDER BY event_date LIMIT 3`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	tier, _ := user["tier"].(string)
	target, next, err := tierProgress(tier)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"user":       user,
		"tierTarget": target,
		"nextTier":   next,
		"banners":    localize(banners, lang),
		"rewards":    localize(rewards, lang),
		"events":     localize(events, lang),
	})
}

/* ---------- คะแนน ---------- */

func Points(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	if _, err := ExpireSpecialPoints(claims.ID); err != nil {
		log.Printf("ตัดยอดคะแนนพิเศษที่หมดอายุไม่สำเร็จ: %v", err)
	}

	user, err := store.QueryOne(`
		SELECT u.display_name, u.employee_code, u.tier, u.points, u.special_points,
		       u.points_expire_at, u.special_points_expire_at, t.color AS tier_color
		FROM users u LEFT JOIN tiers t ON t.key = u.tier WHERE u.id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	withExpiry(user)

	recent, err := store.Query(`
		SELECT id, kind, source, title, points, point_kind, created_at FROM point_transactions
		WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	joined, err := store.Count(
		`SELECT count(*)::int FROM event_registrations WHERE user_id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	expiring, err := store.Count(`
		SELECT COALESCE(sum(points),0)::int FROM point_transactions
		WHERE user_id = $1 AND kind = 'earn' AND point_kind = 'point'
		  AND created_at < now() - interval '11 months'`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"user":           user,
		"recent":         recent,
		"joinedCount":    joined,
		"expiringPoints": expiring,
	})
}

func PointsHistory(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	filter := ""
	switch web.Param(r, "filter", "all") {
	case "redeem":
		filter = `AND t.source = 'reward'`
	case "earn":
		filter = `AND t.points > 0`
	case "spend":
		filter = `AND t.points < 0`
	}

	rows, err := store.Query(`
		SELECT t.id, t.kind, t.source, t.title, t.points, t.point_kind, t.created_at,
		       r.status AS redemption_status
		FROM point_transactions t
		LEFT JOIN redemptions r ON r.ref_code = t.ref_code
		WHERE t.user_id = $1 `+filter+`
		ORDER BY t.created_at DESC LIMIT 100`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"transactions": rows})
}

/* ---------- กิจกรรม ---------- */

func Events(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	where := []string{`e.status = 'open'`}
	args := []any{claims.ID}

	if q := web.Param(r, "q", ""); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf(`e.title ILIKE $%d`, len(args)))
	}

	switch web.Param(r, "filter", "all") {
	case "soon":
		where = append(where, `e.event_date >= current_date`)
	case "joined":
		where = append(where, `r.id IS NOT NULL`)
	case "not-joined":
		where = append(where, `r.id IS NULL`)
	}

	rows, err := store.Query(`
		SELECT e.id, e.title, e.description, e.agenda, e.image_url, e.location, e.event_date,
		       e.end_date, e.start_time, e.end_time, e.points, e.special_points,
		       e.special_points_expire_at, e.kind, e.capacity,
		       (e.venue_lat IS NOT NULL AND e.venue_lng IS NOT NULL) AS needs_location,
		       (r.id IS NOT NULL) AS joined,
		       r.option_id AS chosen_option_id,
		       (f.user_id IS NOT NULL) AS favorite,
		       (SELECT count(*)::int FROM event_registrations x WHERE x.event_id = e.id) AS joined_count,
		       e.translations
		FROM events e
		LEFT JOIN event_registrations r ON r.event_id = e.id AND r.user_id = $1
		LEFT JOIN favorites f ON f.target_type = 'event' AND f.target_id = e.id AND f.user_id = $1
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY e.event_date`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	lang := requestLanguage(r)
	localize(rows, lang)
	if err := attachOptions(rows, lang); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"events": rows})
}

func RegisterEvent(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	eventID, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสกิจกรรมไม่ถูกต้อง")
		return
	}

	var body struct {
		OptionID int64    `json:"optionId"`
		Lat      *float64 `json:"lat"`
		Lng      *float64 `json:"lng"`
	}
	_ = web.Decode(r, &body) // กิจกรรมแบบลงทะเบียนไม่ต้องส่งอะไรมา

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	// ล็อกแถวกิจกรรมไว้ กันคนกดพร้อมกันจนเกินจำนวนที่รับ
	var title, kind string
	var points, capacity, specialPoints, venueRadius int
	var specialExpire sql.NullTime
	var venueLat, venueLng sql.NullFloat64
	err = tx.QueryRow(
		`SELECT title, kind, points, capacity, special_points, special_points_expire_at,
		        venue_lat, venue_lng, venue_radius
		 FROM events WHERE id = $1 AND status = 'open' FOR UPDATE`,
		eventID).Scan(&title, &kind, &points, &capacity, &specialPoints, &specialExpire,
		&venueLat, &venueLng, &venueRadius)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบกิจกรรมนี้")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	/*
		ตรวจว่าอยู่ในพื้นที่จัดงานหรือยัง

		กิจกรรมที่ไม่ได้ตั้งพิกัดไว้จะข้ามการตรวจทั้งหมด ลงทะเบียนจากที่ไหนก็ได้
		กิจกรรมเก่าที่มีอยู่แล้วจึงทำงานเหมือนเดิมโดยไม่ต้องแก้อะไร

		ส่งระยะห่างกลับไปด้วยเมื่อไม่ผ่าน หน้าเว็บจะได้บอกผู้ใช้ได้ว่าห่างแค่ไหน
		ซึ่งช่วยให้เขารู้ว่าควรเดินเข้าไปใกล้อีกหน่อย หรือมาผิดที่ไปเลย
	*/
	if venueLat.Valid && venueLng.Valid {
		if body.Lat == nil || body.Lng == nil {
			web.Error(w, http.StatusBadRequest,
				"กิจกรรมนี้ต้องลงทะเบียนที่หน้างาน กรุณาอนุญาตให้ใช้ตำแหน่งของคุณ")
			return
		}

		distance := DistanceMeters(venueLat.Float64, venueLng.Float64, *body.Lat, *body.Lng)
		if distance > float64(venueRadius)+gpsTolerance {
			web.JSON(w, http.StatusForbidden, web.Map{
				"error":    "คุณไม่ได้อยู่ในพื้นที่จัดงาน",
				"code":     "outside_venue",
				"distance": int(distance),
				"radius":   venueRadius,
			})
			return
		}
	}

	var exists int
	err = tx.QueryRow(`SELECT 1 FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
		eventID, claims.ID).Scan(&exists)
	if err == nil {
		web.Error(w, http.StatusConflict, "คุณลงทะเบียนกิจกรรมนี้ไว้แล้ว")
		return
	}
	if !errors.Is(err, sql.ErrNoRows) {
		web.Fail(w, err)
		return
	}

	if capacity > 0 {
		var count int
		if err := tx.QueryRow(
			`SELECT count(*)::int FROM event_registrations WHERE event_id = $1`, eventID).Scan(&count); err != nil {
			web.Fail(w, err)
			return
		}
		if count >= capacity {
			web.Error(w, http.StatusConflict, "กิจกรรมนี้เต็มแล้ว")
			return
		}
	}

	// กิจกรรมโหวตต้องเลือกตัวเลือกก่อน และตัวเลือกต้องเป็นของกิจกรรมนี้จริง
	var optionID any
	if kind == "vote" {
		msg, err := checkVoteOption(tx, eventID, body.OptionID)
		if err != nil {
			web.Fail(w, err)
			return
		}
		if msg != "" {
			web.Error(w, http.StatusBadRequest, msg)
			return
		}
		if body.OptionID > 0 {
			optionID = body.OptionID
		}
	}

	/*
		กิจกรรมที่ตั้งพื้นที่จัดงานไว้ ให้ถือว่าลงทะเบียนคือการมาถึงงานแล้ว

		เพราะระบบเพิ่งยืนยันไปว่าเครื่องของเขาอยู่ในรัศมีงานจริง
		จึงบันทึกเป็น attended และให้คะแนนทันที ไม่ต้องให้แอดมินมาสแกนซ้ำอีกรอบ
		นี่คือจุดประสงค์ของการตรวจตำแหน่ง: ลงทะเบียนหน้างานแล้วได้คะแนนเลย
	*/
	// ลงทะเบียนผ่านแอปคือการมาถึงงานแล้วเสมอ จึงบันทึกเป็น attended ทันที
	// ถ้ากิจกรรมตั้งพื้นที่จัดงานไว้ โค้ดด้านบนยืนยันตำแหน่งไปเรียบร้อยแล้ว
	atVenue := venueLat.Valid && venueLng.Valid
	status := "attended"

	if _, err := tx.Exec(`
		INSERT INTO event_registrations (event_id, user_id, option_id, status, checked_in_at, lat, lng)
		VALUES ($1, $2, $3, $4::varchar,
		        CASE WHEN $4::varchar = 'attended' THEN now() END, $5, $6)`,
		eventID, claims.ID, optionID, status, body.Lat, body.Lng); err != nil {
		web.Fail(w, err)
		return
	}

	/*
		ลงทะเบียนผ่านแอปแล้วได้คะแนนทันทีเสมอ

		เดิมกิจกรรมทั่วไปต้องรอให้แอดมินสแกนเช็คอินหน้างานก่อนจึงได้คะแนน
		ซึ่งทำให้พนักงานลงทะเบียนแล้วเห็นสถานะ "รอเช็คอิน" ค้างอยู่
		และต้องต่อแถวให้สแกนอีกรอบทั้งที่มาถึงงานแล้ว

		ตอนนี้การลงทะเบียนคือการยืนยันว่ามาถึงงานแล้ว จึงจ่ายคะแนนเลย
		กิจกรรมที่ตั้งพื้นที่จัดงานไว้ ระบบตรวจตำแหน่งให้ก่อนแล้วด้านบน
		ส่วนการสแกนเช็คอินหน้างานเหลือไว้ใช้เฉพาะกรณีฉุกเฉิน
		เช่นมือถือพนักงานแบตหมด หรือหาสัญญาณ GPS ไม่ได้
	*/
	awarded := 0
	if points > 0 {
		var tierUp string
		awarded, tierUp, err = awardPoints(tx, claims.ID, points)
		if err != nil {
			web.Fail(w, err)
			return
		}
		source := "vote"
		if kind != "vote" {
			source = "event"
		}
		if _, err := tx.Exec(`
			INSERT INTO point_transactions (user_id, kind, source, title, points)
			VALUES ($1,'earn',$4,$2,$3)`, claims.ID, title, awarded, source); err != nil {
			web.Fail(w, err)
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO notifications (user_id, category, title, body) VALUES ($1,'point',$2,$3)`,
			claims.ID,
			fmt.Sprintf("คุณได้รับ %d คะแนน", awarded),
			fmt.Sprintf("จากการร่วมกิจกรรม %s", title)); err != nil {
			web.Fail(w, err)
			return
		}
		if err := notifyTierUp(tx, claims.ID, tierUp); err != nil {
			web.Fail(w, err)
			return
		}
	}

	// คะแนนพิเศษจ่ายพร้อมกับคะแนนปกติเสมอ
	if err := awardSpecialPoints(tx, claims.ID, specialPoints, title, specialExpire); err != nil {
		web.Fail(w, err)
		return
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"ok": true, "kind": kind, "points": awarded,
		// ส่งคะแนนพิเศษกลับไปด้วย หน้าเว็บจะได้แสดงทั้งสองกระเป๋าในหน้าต่างยืนยัน
		"specialPoints": specialPoints,
		"atVenue":       atVenue,
	})
}

/* ---------- ของรางวัล ---------- */

func Rewards(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	where := []string{`r.status = 'active'`}
	args := []any{claims.ID}

	if q := web.Param(r, "q", ""); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf(`r.name ILIKE $%d`, len(args)))
	}
	// ค่าว่างคือไม่กรองหมวด หน้าเว็บส่งค่าว่างมาเมื่อผู้ใช้เลือก "ทั้งหมด"
	// ไม่เทียบกับคำว่า "ทั้งหมด" เพราะหน้าเว็บมีสามภาษา คำนั้นจึงไม่คงที่
	if category := web.Param(r, "category", ""); category != "" {
		args = append(args, category)
		where = append(where, fmt.Sprintf(`r.category = $%d`, len(args)))
	}

	// ของรางวัลที่หมดช่วงเวลาหรือยังไม่เริ่ม จะไม่ถูกส่งมาเลย ผู้ดูแลไม่ต้องปิดเอง
	where = append(where,
		`(r.starts_at IS NULL OR r.starts_at <= current_date)`,
		`(r.ends_at IS NULL OR r.ends_at >= current_date)`)

	rewards, err := store.Query(`
		SELECT r.id, r.name, r.description, r.how_to, r.conditions, r.image_url, r.category,
		       r.points, r.old_points, r.stock, r.translations, r.min_tier, r.point_kind,
		       r.starts_at, r.ends_at,
		       (f.user_id IS NOT NULL) AS favorite,
		       -- ระดับต่ำกว่าเกณฑ์ยังเห็นของรางวัลได้ แต่กดแลกไม่ได้
		       (COALESCE(rt.min_points,0) > COALESCE(ut.min_points,0)) AS locked,
		       CASE WHEN r.ends_at IS NOT NULL THEN (r.ends_at - current_date)::int END AS days_left
		FROM rewards r
		LEFT JOIN favorites f ON f.target_type = 'reward' AND f.target_id = r.id AND f.user_id = $1
		LEFT JOIN users u ON u.id = $1
		LEFT JOIN tiers ut ON ut.key = u.tier
		LEFT JOIN tiers rt ON rt.key = r.min_tier
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY rt.min_points NULLS FIRST, r.points`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	// หมวดหมู่ดึงจากของรางวัลที่แปลแล้ว เพื่อให้ชิปกรองกับชื่อหมวดบนการ์ดตรงกัน
	lang := requestLanguage(r)
	localize(rewards, lang)

	seen := map[string]bool{}
	categories := make([]any, 0)
	for _, row := range rewards {
		name, _ := row["category"].(string)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		categories = append(categories, name)
	}

	if _, err := ExpireSpecialPoints(claims.ID); err != nil {
		log.Printf("ตัดยอดคะแนนพิเศษที่หมดอายุไม่สำเร็จ: %v", err)
	}

	// ส่งยอดทั้งสองกระเป๋ามา หน้าเว็บจะได้บอกได้ว่าของรางวัลชิ้นไหนแลกไหว
	wallet, err := store.QueryOne(
		`SELECT points, special_points FROM users WHERE id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"rewards": rewards, "categories": categories,
		"points":        wallet["points"],
		"specialPoints": wallet["special_points"],
	})
}

func RedeemReward(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	rewardID, ok := web.PathID(r, "id")
	if !ok {
		web.Error(w, http.StatusBadRequest, "รหัสของรางวัลไม่ถูกต้อง")
		return
	}

	// ตัดยอดที่หมดอายุก่อนเริ่มทรานแซกชัน กันแลกด้วยคะแนนที่หมดอายุไปแล้ว
	if _, err := ExpireSpecialPoints(claims.ID); err != nil {
		log.Printf("ตัดยอดคะแนนพิเศษที่หมดอายุไม่สำเร็จ: %v", err)
	}

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	// ล็อกทั้งของรางวัลและผู้ใช้ กันแลกเกินสต็อกและกันคะแนนติดลบเมื่อกดพร้อมกัน
	var name, minTier, pointKind string
	var cost, stock int
	var withinWindow bool
	err = tx.QueryRow(`
		SELECT name, points, stock, min_tier, point_kind,
		       (starts_at IS NULL OR starts_at <= current_date)
		       AND (ends_at IS NULL OR ends_at >= current_date)
		FROM rewards WHERE id = $1 AND status = 'active' FOR UPDATE`,
		rewardID).Scan(&name, &cost, &stock, &minTier, &pointKind, &withinWindow)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบของรางวัลนี้")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	if !withinWindow {
		web.Error(w, http.StatusConflict, "ของรางวัลนี้หมดช่วงเวลาแลกแล้ว")
		return
	}

	// กันการยิงตรงมาที่ API เพื่อแลกของรางวัลที่ระดับยังไม่ถึง
	var locked bool
	err = tx.QueryRow(`
		SELECT COALESCE(rt.min_points,0) > COALESCE(ut.min_points,0)
		FROM users u
		LEFT JOIN tiers ut ON ut.key = u.tier
		LEFT JOIN tiers rt ON rt.key = $2
		WHERE u.id = $1`, claims.ID, minTier).Scan(&locked)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if locked {
		web.Error(w, http.StatusForbidden,
			"ของรางวัลนี้สำหรับสมาชิกระดับ "+minTier+" ขึ้นไป")
		return
	}

	if stock <= 0 {
		web.Error(w, http.StatusConflict, "ของรางวัลหมดแล้ว")
		return
	}

	// ของรางวัลแต่ละชิ้นแลกด้วยกระเป๋าเดียว ไม่ผสมสองกระเป๋า
	// เพราะถ้าผสมแล้วผู้ใช้จะเดาไม่ออกว่าตัวเองจ่ายอะไรไปเท่าไหร่
	special := pointKind == "special"

	balanceColumn := "points"
	shortMessage := "คะแนนของคุณไม่พอแลกของรางวัลนี้"
	if special {
		balanceColumn = "special_points"
		shortMessage = "คะแนนพิเศษของคุณไม่พอแลกของรางวัลนี้"
	}

	var balance int
	if err := tx.QueryRow(
		`SELECT `+balanceColumn+` FROM users WHERE id = $1 FOR UPDATE`,
		claims.ID).Scan(&balance); err != nil {
		web.Fail(w, err)
		return
	}
	if balance < cost {
		web.Error(w, http.StatusBadRequest, shortMessage)
		return
	}

	suffix := make([]byte, 3)
	if _, err := rand.Read(suffix); err != nil {
		web.Fail(w, err)
		return
	}
	refCode := fmt.Sprintf("RW-%s-%s",
		time.Now().Format("060102"), strings.ToUpper(hex.EncodeToString(suffix)))

	if _, err := tx.Exec(`UPDATE rewards SET stock = stock - 1 WHERE id = $1`, rewardID); err != nil {
		web.Fail(w, err)
		return
	}
	if _, err := tx.Exec(
		`UPDATE users SET `+balanceColumn+` = `+balanceColumn+` - $2 WHERE id = $1`,
		claims.ID, cost); err != nil {
		web.Fail(w, err)
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO redemptions (user_id, reward_id, ref_code, points_used, point_kind)
		VALUES ($1,$2,$3,$4,$5)`,
		claims.ID, rewardID, refCode, cost, pointKind); err != nil {
		web.Fail(w, err)
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO point_transactions (user_id, kind, source, title, points, ref_code, point_kind)
		VALUES ($1,'redeem','reward',$2,$3,$4,$5)`,
		claims.ID, "แลก"+name, -cost, refCode, pointKind); err != nil {
		web.Fail(w, err)
		return
	}

	unit := "คะแนน"
	if special {
		unit = "คะแนนพิเศษ"
	}
	if _, err := tx.Exec(`
		INSERT INTO notifications (user_id, category, title, body)
		VALUES ($1,'reward','แลกคะแนนสำเร็จ',$2)`,
		claims.ID, fmt.Sprintf("คุณได้ใช้ %d %s สำหรับการแลก %s", cost, unit, name)); err != nil {
		web.Fail(w, err)
		return
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusCreated, web.Map{"ok": true, "refCode": refCode})
}

func MyRewards(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	status := "pending"
	if web.Param(r, "status", "") == "received" {
		status = "received"
	}

	rows, err := store.Query(`
		SELECT d.id, d.ref_code, d.points_used, d.status, d.redeemed_at, d.received_at,
		       r.name, r.image_url, r.translations
		FROM redemptions d JOIN rewards r ON r.id = d.reward_id
		WHERE d.user_id = $1 AND d.status = $2
		ORDER BY d.redeemed_at DESC`, claims.ID, status)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"redemptions": localize(rows, requestLanguage(r))})
}

/* ---------- รายการโปรด ---------- */

func Favorites(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	targetType := "reward"
	if web.Param(r, "type", "") == "event" {
		targetType = "event"
	}

	query := `
		SELECT r.id, r.name, r.image_url, r.points, r.old_points, r.stock, r.translations
		FROM favorites f JOIN rewards r ON r.id = f.target_id
		WHERE f.user_id = $1 AND f.target_type = 'reward' ORDER BY f.created_at DESC`
	if targetType == "event" {
		query = `
			SELECT e.id, e.title, e.image_url, e.event_date, e.end_date, e.start_time, e.end_time,
			       e.location, e.points, e.kind, e.translations
			FROM favorites f JOIN events e ON e.id = f.target_id
			WHERE f.user_id = $1 AND f.target_type = 'event' ORDER BY f.created_at DESC`
	}

	rows, err := store.Query(query, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"type": targetType, "items": localize(rows, requestLanguage(r))})
}

func ToggleFavorite(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body struct {
		Type string `json:"type"`
		ID   int64  `json:"id"`
	}
	if err := web.Decode(r, &body); err != nil ||
		(body.Type != "reward" && body.Type != "event") || body.ID == 0 {
		web.Error(w, http.StatusBadRequest, "ข้อมูลรายการโปรดไม่ถูกต้อง")
		return
	}

	result, err := store.Exec(
		`DELETE FROM favorites WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
		claims.ID, body.Type, body.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if removed, _ := result.RowsAffected(); removed > 0 {
		web.JSON(w, http.StatusOK, web.Map{"favorite": false})
		return
	}

	if _, err := store.Exec(
		`INSERT INTO favorites (user_id, target_type, target_id) VALUES ($1,$2,$3)`,
		claims.ID, body.Type, body.ID); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"favorite": true})
}

/* ---------- แจ้งเตือนและเนื้อหา ---------- */

func Notifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	args := []any{claims.ID}
	filter := ""
	if category := web.Param(r, "category", "all"); category != "all" && category != "" {
		args = append(args, category)
		filter = fmt.Sprintf(`AND category = $%d`, len(args))
	}

	rows, err := store.Query(`
		SELECT id, category, title, body, read_at, created_at, translations FROM notifications
		WHERE (user_id = $1 OR user_id IS NULL) `+filter+`
		ORDER BY created_at DESC LIMIT 100`, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	localize(rows, requestLanguage(r))

	unread := 0
	for _, row := range rows {
		if row["read_at"] == nil {
			unread++
		}
	}

	web.JSON(w, http.StatusOK, web.Map{"notifications": rows, "unread": unread})
}

func ReadAllNotifications(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	if _, err := store.Exec(`
		UPDATE notifications SET read_at = now()
		WHERE read_at IS NULL AND (user_id = $1 OR user_id IS NULL)`, claims.ID); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

func Faqs(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`SELECT id, question, answer, translations FROM faqs ORDER BY sort_order`)
	if err != nil {
		web.Fail(w, err)
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"faqs": localize(rows, requestLanguage(r))})
}

func Policy(w http.ResponseWriter, r *http.Request) {
	policy, err := store.QueryOne(
		`SELECT key, title, content, updated_at, translations FROM policies WHERE key = $1`, r.PathValue("key"))
	if err != nil {
		web.Fail(w, err)
		return
	}
	if policy == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบเอกสารนี้")
		return
	}
	web.JSON(w, http.StatusOK, web.Map{"policy": localizeOne(policy, requestLanguage(r))})
}

/* ---------- ระดับสมาชิก ---------- */

func Tiers(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	tiers, err := store.Query(
		`SELECT key, name, min_points, benefits, color, translations FROM tiers ORDER BY min_points`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	current, err := store.QueryOne(`
		SELECT u.tier, u.points, t.color AS tier_color
		FROM users u LEFT JOIN tiers t ON t.key = u.tier WHERE u.id = $1`, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	tier, _ := current["tier"].(string)
	target, next, err := tierProgress(tier)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"tiers": localize(tiers, requestLanguage(r)), "current": current,
		"tierTarget": target, "nextTier": next,
	})
}

/* ---------- QR ประจำตัว ---------- */
