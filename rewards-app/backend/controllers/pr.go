package controllers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"rewards/config"
	"rewards/middleware"
	"rewards/store"
	"rewards/web"
)

/*
ประชาสัมพันธ์ — อ่านข่าวหรือดูวิดีโอจนครบเงื่อนไขแล้วได้คะแนน

ใช้ตาราง announcements ร่วมกับประกาศบังคับอ่านของเดิม แยกด้วยคอลัมน์ channel
ข่าวฝั่งนี้พนักงานเปิดอ่านเองจากเมนู ไม่เด้งทับหน้าจอ

คะแนนที่ได้เป็นคะแนน K-POINT ก้อนเดียวกับกิจกรรม ไม่ใช่กระเป๋าแยก
จึงต้องจ่ายผ่าน awardPoints ตัวเดียวกับทุกที่ เพื่อให้ตัวคูณของระดับสมาชิก
และการเลื่อนระดับทำงานเหมือนกันหมด

การกันรับคะแนนซ้ำมีสองชั้น
  1. UNIQUE (announcement_id, user_id) ในฐานข้อมูล กันคำขอที่เข้ามาพร้อมกัน
  2. เช็ก awarded_at ก่อนจ่าย กันกรณีทั่วไป

และกันการยิงข้ามการอ่านด้วยการนับเวลาจากนาฬิกาของเซิร์ฟเวอร์
ไม่ใช่เชื่อตัวเลขความคืบหน้าที่หน้าเว็บส่งมา
*/

// visiblePr คือเงื่อนไขว่าข่าวประชาสัมพันธ์ชิ้นไหนกำลังเผยแพร่อยู่
// ใช้เหมือนกันทุกคิวรีฝั่งพนักงาน ถ้าไม่ตรงกันจะเกิดอาการเห็นในรายการแต่กดเข้าไปไม่ได้
const visiblePr = `
	a.channel = 'pr'
	AND a.status = 'published'
	AND (a.starts_at IS NULL OR a.starts_at <= CURRENT_DATE)
	AND (a.ends_at   IS NULL OR a.ends_at   >= CURRENT_DATE)`

// prFields คือคอลัมน์ที่ฝั่งพนักงานต้องใช้ ดึงชุดเดียวกันทั้งหน้ารายการและหน้ารายละเอียด
const prFields = `
	a.id, a.title, a.summary, a.body, a.image_url, a.kind, a.category,
	a.video_url, a.video_kind, a.video_seconds,
	a.points, a.read_seconds, a.watch_percent,
	a.link_url, a.link_label, a.file_url, a.file_name,
	a.starts_at, a.created_at, a.translations`

/*
requiredSeconds บอกว่าต้องใช้เวลาอย่างน้อยกี่วินาทีจึงจะนับว่าดูครบ

ข้อความกับรูปภาพใช้เวลาอ่านที่ผู้ดูแลตั้งไว้ตรง ๆ
วิดีโอคิดจากความยาวคลิปคูณเปอร์เซ็นต์ที่ต้องดู เช่น คลิป 120 วินาที ต้องดู 90% = 108 วินาที

ถ้ายังไม่รู้ความยาวคลิป (ยังไม่มีใครเปิดดูเลย) จะคืน 0 แปลว่ายังตรวจด้วยเวลาไม่ได้
กรณีนั้นใช้เปอร์เซ็นต์ที่หน้าเว็บรายงานมาอย่างเดียว ซึ่งหลวมกว่าแต่ไม่บล็อกคนดูจริง
*/
func requiredSeconds(kind string, readSeconds, watchPercent, videoSeconds int) int {
	if kind != "video" {
		return readSeconds
	}
	if videoSeconds <= 0 {
		return 0
	}
	return videoSeconds * watchPercent / 100
}

/* ---------- ฝั่งพนักงาน ---------- */

/*
PrFeed ส่งรายการข่าวประชาสัมพันธ์ทั้งหมดที่เผยแพร่อยู่

ส่งสถานะการรับคะแนนของคนที่เรียกมาด้วย หน้าเว็บจะได้บอกได้ทันทีว่า
ชิ้นไหนรับคะแนนไปแล้ว ไม่ต้องกดเข้าไปดูทีละชิ้น
*/
func PrFeed(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	rows, err := store.Query(`
		SELECT `+prFields+`,
		       (v.awarded_at IS NOT NULL)      AS awarded,
		       COALESCE(v.points, 0)           AS earned_points,
		       COALESCE(v.progress, 0)         AS progress,
		       COALESCE(v.watched_seconds, 0)  AS watched_seconds
		FROM announcements a
		LEFT JOIN announcement_views v
		       ON v.announcement_id = a.id AND v.user_id = $1
		WHERE `+visiblePr+`
		ORDER BY COALESCE(a.starts_at, a.created_at::date) DESC, a.id DESC`,
		claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"items": localize(rows, requestLanguage(r))})
}

// PrItem ส่งข่าวชิ้นเดียวพร้อมสถานะของคนที่เรียกมา
func PrItem(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "รหัสข่าวไม่ถูกต้อง")
		return
	}

	row, err := store.QueryOne(`
		SELECT `+prFields+`,
		       (v.awarded_at IS NOT NULL)      AS awarded,
		       COALESCE(v.points, 0)           AS earned_points,
		       COALESCE(v.progress, 0)         AS progress,
		       COALESCE(v.watched_seconds, 0)  AS watched_seconds
		FROM announcements a
		LEFT JOIN announcement_views v
		       ON v.announcement_id = a.id AND v.user_id = $2
		WHERE a.id = $1 AND`+visiblePr,
		id, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	/*
		store.QueryOne คืน (nil, nil) เมื่อไม่เจอแถว ไม่ใช่ sql.ErrNoRows
		จึงต้องเช็กที่ตัวแถว ถ้าไปเช็ก ErrNoRows เงื่อนไขจะไม่เป็นจริงเลย
		แล้วข่าวฉบับร่างหรือข่าวที่หมดอายุจะตอบ 200 พร้อมข้อมูลว่าง
		แทนที่จะตอบว่าไม่พบ
	*/
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบข่าวนี้ หรือยังไม่ได้เผยแพร่")
		return
	}

	/*
		จดเวลาที่เปิดอ่านครั้งแรก แล้วส่งสภาพการอ่านล่าสุดกลับไปด้วย

		เวลาที่จดมาจากนาฬิกาของเซิร์ฟเวอร์ ใช้เป็นหลักฐานว่าเปิดค้างไว้จริงกี่วินาที
		ถ้าไปจดตอนกดรับคะแนน จะไม่มีอะไรบอกได้เลยว่าเปิดมานานแค่ไหน

		สภาพการอ่านต้องส่งกลับตั้งแต่ตอนเปิดหน้า ไม่ใช่รอให้หน้าเว็บรายงานเข้ามาก่อน
		ไม่งั้นคนที่อ่านครบแล้วแต่ลืมกดรับคะแนน พอกลับเข้ามาใหม่จะเห็นความคืบหน้าเป็นศูนย์
		และไม่เห็นปุ่มรับคะแนน ทั้งที่ของที่อ่านไปแล้วยังอยู่ครบในฐานข้อมูล
		ของที่เก็บไว้มีอยู่แล้ว แค่ไม่เคยส่งกลับไปให้หน้าเว็บเท่านั้น
	*/
	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	view, err := loadView(tx, id, claims.ID)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	ready, reason := view.eligible()
	web.JSON(w, http.StatusOK, web.Map{
		"item":     localizeOne(row, requestLanguage(r)),
		"progress": view.progress,
		"watched":  view.watched,
		"eligible": ready && !view.awarded,
		"reason":   reason,
		"need":     requiredSeconds(view.kind, view.readSeconds, view.watchPercent, view.videoSeconds),
	})
}

/*
viewState คือสภาพการดูของคนหนึ่งคนต่อข่าวหนึ่งชิ้น ณ เวลาที่เรียกดู
*/
type viewState struct {
	kind         string
	title        string
	points       int
	readSeconds  int
	watchPercent int
	videoSeconds int

	progress  int // วินาทีที่อ่าน หรือ % ที่เลื่อนไปถึง
	watched   int // วินาทีที่ดูจริง ใช้กับวิดีโอ
	elapsed   int // เวลาจริงที่ผ่านไปตั้งแต่เปิดอ่าน
	awarded   bool
	awardedPt int
}

/*
eligible บอกว่าครบเงื่อนไขรับคะแนนหรือยัง พร้อมเหตุผลถ้ายังไม่ครบ

กติกานี้อยู่ที่เซิร์ฟเวอร์ที่เดียว ทั้งตอนบอกหน้าเว็บว่าให้ขึ้นปุ่มได้หรือยัง
และตอนกดรับคะแนนจริง ถ้าแยกกันคิดสองที่ สองที่นั้นจะไม่ตรงกันสักวัน

ข้อความและรูปภาพ

	ต้องเปิดค้างครบเวลาที่ตั้งไว้ หักให้สามวินาทีเผื่อเครือข่ายช้า

วิดีโอ

	ต้องดูจริงครบตามสัดส่วนที่ตั้งไว้ โดยนับจากวินาทีที่คลิปเล่นไปจริง
	ไม่ใช่ตำแหน่งที่เลื่อนไปถึง การลากแถบข้ามจึงไม่ช่วยให้ผ่าน

	และเวลาจริงต้องผ่านไปอย่างน้อยครึ่งหนึ่งของเวลาที่ต้องดู
	ครึ่งหนึ่งเพราะเปิดเร่งความเร็วสองเท่าได้ ซึ่งก็คือดูจริง
	แต่จะข้ามไปรับคะแนนทันทีที่เปิดคลิปไม่ได้

	คลิปที่ยังไม่รู้ความยาว (ยังไม่มีใครเปิดดูเลย) ถือว่ายังไม่ครบ
	ดีกว่าปล่อยผ่านโดยไม่มีอะไรวัด
*/
func (v viewState) eligible() (bool, string) {
	if v.points <= 0 {
		return false, "ข่าวนี้ไม่มีคะแนน"
	}

	if v.kind != "video" {
		/*
			ผ่อนให้สามวินาทีเผื่อเครือข่ายช้า แต่ไม่เกินหนึ่งในสามของเวลาที่ตั้งไว้

			ถ้าผ่อนสามวินาทีตายตัว ข่าวที่ตั้งเวลาอ่านไว้ 3 วินาที
			จะเหลือเงื่อนไขเวลาเป็นศูนย์ ด่านนี้จึงไม่กันอะไรเลย
			และยิงคำขอครั้งเดียวก็รับคะแนนได้ทันที
		*/
		slack := v.readSeconds / 3
		if slack > 3 {
			slack = 3
		}
		if v.progress < v.readSeconds || v.elapsed < v.readSeconds-slack {
			return false, fmt.Sprintf("ยังอ่านไม่ครบ %d วินาที", v.readSeconds)
		}
		return true, ""
	}

	need := requiredSeconds(v.kind, v.readSeconds, v.watchPercent, v.videoSeconds)
	if need <= 0 {
		return false, "ยังไม่ทราบความยาวคลิป กรุณากดเล่นคลิปก่อน"
	}
	if v.watched < need {
		return false, fmt.Sprintf("ดูไปแล้ว %d วินาที จากที่ต้องดู %d วินาที", v.watched, need)
	}
	if v.elapsed < need/2 {
		return false, "เวลาที่ผ่านไปน้อยกว่าความยาวคลิปที่ต้องดู"
	}
	return true, ""
}

/*
loadView อ่านสภาพการดูปัจจุบันออกมา พร้อมล็อกแถวไว้ถ้าอยู่ในธุรกรรม

สร้างแถวให้ถ้ายังไม่มี เพราะคนที่เพิ่งเปิดอ่านยังไม่มีแถวของตัวเอง
*/
func loadView(tx *sql.Tx, id, userID int64) (viewState, error) {
	var v viewState

	err := tx.QueryRow(`
		SELECT a.kind, a.title, a.points, a.read_seconds, a.watch_percent, a.video_seconds
		FROM announcements a
		WHERE a.id = $1 AND`+visiblePr, id).
		Scan(&v.kind, &v.title, &v.points, &v.readSeconds, &v.watchPercent, &v.videoSeconds)
	if err != nil {
		return v, err
	}

	if _, err := tx.Exec(`
		INSERT INTO announcement_views (announcement_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT (announcement_id, user_id) DO NOTHING`, id, userID); err != nil {
		return v, err
	}

	var (
		openedAt  time.Time
		awardedAt sql.NullTime
	)
	err = tx.QueryRow(`
		SELECT progress, watched_seconds, opened_at, awarded_at, points
		FROM announcement_views
		WHERE announcement_id = $1 AND user_id = $2
		FOR UPDATE`, id, userID).
		Scan(&v.progress, &v.watched, &openedAt, &awardedAt, &v.awardedPt)
	if err != nil {
		return v, err
	}

	v.elapsed = int(time.Since(openedAt).Seconds())
	v.awarded = awardedAt.Valid
	return v, nil
}

/*
PrProgress บันทึกความคืบหน้าอย่างเดียว ไม่จ่ายคะแนน

การจ่ายคะแนนแยกไปอยู่ที่ PrClaim ซึ่งผู้ใช้ต้องกดปุ่มเอง
ของเดิมจ่ายให้อัตโนมัติทันทีที่ถึงเกณฑ์ แล้วเด้งหน้ารับคะแนนขึ้นมาทับ
คนที่ดูคลิปอยู่จึงถูกขัดจังหวะกลางคันตั้งแต่ยังดูไม่จบ

คืนค่า eligible ไปด้วย หน้าเว็บจะได้รู้ว่าถึงเวลาขึ้นปุ่มรับคะแนนหรือยัง
โดยไม่ต้องคิดกติกาเองซ้ำอีกชุด
*/
func PrProgress(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "รหัสข่าวไม่ถูกต้อง")
		return
	}

	var body struct {
		Progress       *int `json:"progress"`       // วินาทีที่อ่าน หรือ % ที่เลื่อนไปถึง
		WatchedSeconds *int `json:"watchedSeconds"` // วินาทีที่คลิปเล่นไปจริง
		VideoSeconds   *int `json:"videoSeconds"`   // ความยาวคลิป ส่งมาครั้งแรกที่เปิดดู
	}
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลไม่ถูกต้อง")
		return
	}

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	view, err := loadView(tx, id, claims.ID)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบข่าวนี้ หรือยังไม่ได้เผยแพร่")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	/*
		ความยาวคลิปจดครั้งเดียวตอนมีคนเปิดดูคนแรก

		จดครั้งเดียวเพราะถ้าให้ทับได้เรื่อย ๆ คนที่อยากได้คะแนนเร็ว ๆ
		ก็แค่ส่งมาว่าคลิปยาว 1 วินาที แล้วเงื่อนไข "ดู 70%" จะผ่านทันที
	*/
	if view.kind == "video" && view.videoSeconds <= 0 &&
		body.VideoSeconds != nil && *body.VideoSeconds > 0 {
		view.videoSeconds = *body.VideoSeconds
		if _, err := tx.Exec(
			`UPDATE announcements SET video_seconds = $2 WHERE id = $1 AND video_seconds <= 0`,
			id, view.videoSeconds); err != nil {
			web.Fail(w, err)
			return
		}
	}

	// ความคืบหน้าเดินหน้าอย่างเดียว เลื่อนกลับไปดูซ้ำไม่ควรลบของที่ดูแล้ว
	if body.Progress != nil && *body.Progress > view.progress {
		view.progress = *body.Progress
	}
	if view.progress < 0 {
		view.progress = 0
	}

	/*
		เพดานของเวลาที่ดูจริง

		ตัวเลขนี้มาจากหน้าเว็บ ซึ่งแก้ได้ไม่ยาก จึงเชื่อทั้งหมดไม่ได้
		คนหนึ่งคนดูเนื้อหาได้มากที่สุดราวสองเท่าของเวลาจริงที่ผ่านไป
		(เปิดเร่งความเร็วสองเท่า) บวกเผื่ออีกห้าวินาทีสำหรับความคลาดเคลื่อน

		ถ้าส่งมาเกินนั้นแปลว่าตัวเลขไม่ได้มาจากการดูจริง ตัดลงมาที่เพดาน
	*/
	if body.WatchedSeconds != nil && *body.WatchedSeconds > view.watched {
		watched := *body.WatchedSeconds
		if ceiling := view.elapsed*2 + 5; watched > ceiling {
			watched = ceiling
		}
		if watched > view.watched {
			view.watched = watched
		}
	}

	if _, err := tx.Exec(`
		UPDATE announcement_views SET progress = $3, watched_seconds = $4
		WHERE announcement_id = $1 AND user_id = $2`,
		id, claims.ID, view.progress, view.watched); err != nil {
		web.Fail(w, err)
		return
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	ready, reason := view.eligible()
	web.JSON(w, http.StatusOK, web.Map{
		"awarded":  view.awarded,
		"points":   view.awardedPt,
		"progress": view.progress,
		"watched":  view.watched,
		"eligible": ready && !view.awarded,
		"reason":   reason,
		"need":     requiredSeconds(view.kind, view.readSeconds, view.watchPercent, view.videoSeconds),
	})
}

/*
PrClaim จ่ายคะแนนเมื่อผู้ใช้กดปุ่มรับคะแนน

ตรวจเงื่อนไขซ้ำที่นี่อีกครั้งด้วยกติกาตัวเดียวกับที่ใช้ตัดสินว่าจะขึ้นปุ่มไหม
เพราะปุ่มอยู่ที่หน้าเว็บ ซึ่งใครก็เรียกเส้นทางนี้ตรง ๆ ได้โดยไม่ต้องมีปุ่ม
*/
func PrClaim(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "รหัสข่าวไม่ถูกต้อง")
		return
	}

	tx, err := config.DB.Begin()
	if err != nil {
		web.Fail(w, err)
		return
	}
	defer tx.Rollback()

	view, err := loadView(tx, id, claims.ID)
	if errors.Is(err, sql.ErrNoRows) {
		web.Error(w, http.StatusNotFound, "ไม่พบข่าวนี้ หรือยังไม่ได้เผยแพร่")
		return
	}
	if err != nil {
		web.Fail(w, err)
		return
	}

	// รับไปแล้วก็จบ ไม่จ่ายซ้ำ กดสองแท็บพร้อมกันจะมาติดที่ FOR UPDATE ใน loadView
	if view.awarded {
		if err := tx.Commit(); err != nil {
			web.Fail(w, err)
			return
		}
		web.JSON(w, http.StatusOK, web.Map{
			"awarded": true, "points": view.awardedPt, "alreadyAwarded": true,
		})
		return
	}

	if ready, reason := view.eligible(); !ready {
		web.Error(w, http.StatusBadRequest, reason)
		return
	}

	// จ่ายผ่านทางเดียวกับที่อื่น เพื่อให้ตัวคูณระดับและการเลื่อนระดับเหมือนกัน
	awarded, tierUp, err := awardPoints(tx, claims.ID, view.points)
	if err != nil {
		web.Fail(w, err)
		return
	}
	if _, err := tx.Exec(`
		INSERT INTO point_transactions (user_id, kind, source, title, points, announcement_id)
		VALUES ($1,'earn','pr',$2,$3,$4)`,
		claims.ID, view.title, awarded, id); err != nil {
		web.Fail(w, err)
		return
	}
	if err := notifyTierUp(tx, claims.ID, tierUp); err != nil {
		web.Fail(w, err)
		return
	}

	if _, err := tx.Exec(`
		UPDATE announcement_views
		SET awarded_at = now(), points = $3
		WHERE announcement_id = $1 AND user_id = $2 AND awarded_at IS NULL`,
		id, claims.ID, awarded); err != nil {
		web.Fail(w, err)
		return
	}

	if err := tx.Commit(); err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"awarded": true, "points": awarded})
}

/* ---------- ฝั่งผู้ดูแลระบบ ---------- */

// AdminPrList ส่งข่าวประชาสัมพันธ์ทั้งหมดพร้อมยอดคนที่รับคะแนนไปแล้ว
func AdminPrList(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Query(`
		SELECT a.id, a.title, a.summary, a.body, a.image_url, a.status,
		       a.kind, a.category, a.video_url, a.video_kind, a.video_seconds,
		       a.points, a.read_seconds, a.watch_percent,
		       a.starts_at, a.ends_at, a.created_at,
		       (SELECT count(*)::int FROM announcement_views v
		          WHERE v.announcement_id = a.id AND v.awarded_at IS NOT NULL) AS awarded_count,
		       (SELECT COALESCE(sum(v.points), 0)::int FROM announcement_views v
		          WHERE v.announcement_id = a.id) AS points_given,
		       (SELECT count(*)::int FROM users u
		          WHERE u.role = 'user' AND u.status = 'Active') AS audience
		FROM announcements a
		WHERE a.channel = 'pr'
		ORDER BY a.created_at DESC`)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{"items": rows})
}

type prBody struct {
	Title        *string `json:"title"`
	Summary      *string `json:"summary"`
	Body         *string `json:"body"`
	ImageURL     *string `json:"imageUrl"`
	Kind         *string `json:"kind"`
	Category     *string `json:"category"`
	VideoURL     *string `json:"videoUrl"`
	VideoKind    *string `json:"videoKind"`
	VideoSeconds *int    `json:"videoSeconds"`
	Points       *int    `json:"points"`
	ReadSeconds  *int    `json:"readSeconds"`
	WatchPercent *int    `json:"watchPercent"`
	Status       *string `json:"status"`
	StartsAt     *string `json:"startsAt"`
	EndsAt       *string `json:"endsAt"`
}

/*
checkPr ตรวจค่าที่ส่งมาก่อนบันทึก

เงื่อนไขที่ตั้งไม่ได้จะทำให้ข่าวชิ้นนั้นไม่มีวันจ่ายคะแนนให้ใครเลย
และจะไม่มีอะไรฟ้อง ผู้ดูแลจะรู้ก็ต่อเมื่อมีคนมาถามว่าทำไมอ่านแล้วไม่ได้คะแนน
*/
func checkPr(b prBody) string {
	if b.Kind != nil {
		switch *b.Kind {
		case "text", "image", "video":
		default:
			return "ชนิดเนื้อหาไม่ถูกต้อง"
		}
		if *b.Kind == "video" && b.VideoURL != nil && strings.TrimSpace(*b.VideoURL) == "" {
			return "เลือกไฟล์วิดีโอหรือใส่ลิงก์ YouTube ก่อน"
		}
		/*
			คลิป YouTube ต้องมีความยาวติดมาด้วย

			ความยาวคือตัวหารของเงื่อนไข "ดูครบ N%" ถ้าไม่รู้ว่าคลิปยาวเท่าไหร่
			ก็คิดไม่ได้ว่า N% คือกี่วินาที และจะไม่มีใครรับคะแนนจากข่าวนั้นได้เลย
			โดยไม่มีอะไรฟ้องว่าเพราะอะไร

			คลิปที่อัปโหลดเองไม่ต้องบังคับ เพราะหน้าเว็บอ่านความยาวจากไฟล์ให้อยู่แล้ว
			และถ้าพลาดจริง ๆ ตัวเล่นฝั่งพนักงานก็รายงานความยาวกลับมาได้
		*/
		if *b.Kind == "video" && b.VideoKind != nil && *b.VideoKind == "youtube" &&
			(b.VideoSeconds == nil || *b.VideoSeconds <= 0) {
			return "กรอกความยาวคลิป YouTube ก่อน ระบบใช้คำนวณว่าต้องดูกี่วินาทีจึงจะครบเงื่อนไข"
		}
	}
	if b.Category != nil && *b.Category != "news" && *b.Category != "announce" {
		return "หมวดไม่ถูกต้อง"
	}
	if b.Points != nil && (*b.Points < 0 || *b.Points > 100000) {
		return "คะแนนต้องอยู่ระหว่าง 0 ถึง 100,000"
	}
	if b.ReadSeconds != nil && (*b.ReadSeconds < 0 || *b.ReadSeconds > 3600) {
		return "เวลาอ่านต้องอยู่ระหว่าง 0 ถึง 3,600 วินาที"
	}
	// ต่ำกว่า 10% แทบจะเท่ากับกดเล่นแล้วปิด ส่วนเกิน 100% ไม่มีทางถึง
	if b.WatchPercent != nil && (*b.WatchPercent < 10 || *b.WatchPercent > 100) {
		return "เปอร์เซ็นต์การรับชมต้องอยู่ระหว่าง 10 ถึง 100"
	}
	if b.StartsAt != nil && b.EndsAt != nil &&
		strings.TrimSpace(*b.StartsAt) != "" && strings.TrimSpace(*b.EndsAt) != "" &&
		*b.EndsAt < *b.StartsAt {
		return "วันสิ้นสุดต้องไม่มาก่อนวันที่เผยแพร่"
	}
	return ""
}

func AdminCreatePr(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	var body prBody
	if err := web.Decode(r, &body); err != nil || body.Title == nil ||
		strings.TrimSpace(*body.Title) == "" {
		web.Error(w, http.StatusBadRequest, "กรอกหัวข้อประชาสัมพันธ์ก่อน")
		return
	}
	if msg := checkPr(body); msg != "" {
		web.Error(w, http.StatusBadRequest, msg)
		return
	}

	row, err := store.QueryOne(`
		INSERT INTO announcements
		  (channel, title, summary, body, image_url, kind, category,
		   video_url, video_kind, video_seconds,
		   points, read_seconds, watch_percent,
		   status, starts_at, ends_at, require_ack)
		VALUES ('pr', $1, COALESCE($2,''), COALESCE($3,''), $4,
		        COALESCE($5::varchar,'text'), COALESCE($6::varchar,'news'),
		        $7, COALESCE($8::varchar,'upload'), COALESCE($9::int,0),
		        COALESCE($10::int,0), COALESCE($11::int,30), COALESCE($12::int,90),
		        COALESCE($13::varchar,'published'), $14::date, $15::date, false)
		RETURNING *`,
		strings.TrimSpace(*body.Title), body.Summary, body.Body, emptyToNull(body.ImageURL),
		body.Kind, body.Category,
		emptyToNull(body.VideoURL), body.VideoKind, body.VideoSeconds,
		body.Points, body.ReadSeconds, body.WatchPercent,
		body.Status, nullDate(body.StartsAt), nullDate(body.EndsAt))
	if err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "pr.create", strings.TrimSpace(*body.Title), "")
	web.JSON(w, http.StatusCreated, web.Map{"item": row})
}

func AdminUpdatePr(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "รหัสข่าวไม่ถูกต้อง")
		return
	}

	var body prBody
	if err := web.Decode(r, &body); err != nil {
		web.Error(w, http.StatusBadRequest, "ข้อมูลไม่ถูกต้อง")
		return
	}
	if msg := checkPr(body); msg != "" {
		web.Error(w, http.StatusBadRequest, msg)
		return
	}

	/*
		เปลี่ยนวิดีโอแล้วต้องล้างความยาวเดิมทิ้ง

		ไม่งั้นคลิปใหม่จะถูกตรวจด้วยความยาวของคลิปเก่า
		คลิปสั้นลงก็จะไม่มีวันผ่าน คลิปยาวขึ้นก็ผ่านตั้งแต่ยังดูไม่ถึงครึ่ง
	*/
	row, err := store.QueryOne(`
		UPDATE announcements SET
		  title         = COALESCE($2, title),
		  summary       = COALESCE($3, summary),
		  body          = COALESCE($4, body),
		  image_url     = CASE WHEN $5::text IS NULL THEN image_url
		                       WHEN $5 = '' THEN NULL ELSE $5 END,
		  kind          = COALESCE($6, kind),
		  category      = COALESCE($7, category),
		  video_url     = CASE WHEN $8::text IS NULL THEN video_url
		                       WHEN $8 = '' THEN NULL ELSE $8 END,
		  video_kind    = COALESCE($9, video_kind),
		  video_seconds = CASE WHEN $8::text IS NOT NULL AND $8 IS DISTINCT FROM video_url
		                       THEN COALESCE($10::int, 0)
		                       ELSE COALESCE($10::int, video_seconds) END,
		  points        = COALESCE($11::int, points),
		  read_seconds  = COALESCE($12::int, read_seconds),
		  watch_percent = COALESCE($13::int, watch_percent),
		  status        = COALESCE($14, status),
		  starts_at     = COALESCE($15::date, starts_at),
		  ends_at       = COALESCE($16::date, ends_at)
		WHERE id = $1 AND channel = 'pr'
		RETURNING *`,
		id, body.Title, body.Summary, body.Body, body.ImageURL,
		body.Kind, body.Category, body.VideoURL, body.VideoKind, body.VideoSeconds,
		body.Points, body.ReadSeconds, body.WatchPercent,
		body.Status, nullDate(body.StartsAt), nullDate(body.EndsAt))
	if err != nil {
		web.Fail(w, err)
		return
	}
	// ไม่เจอแถว = ไม่มีข่าวนี้ หรือเป็นประกาศคนละช่องทาง (store.QueryOne คืน nil ไม่ใช่ ErrNoRows)
	if row == nil {
		web.Error(w, http.StatusNotFound, "ไม่พบข่าวนี้")
		return
	}

	logAudit(claims.ID, "pr.update", strconv.FormatInt(id, 10), "")
	web.JSON(w, http.StatusOK, web.Map{"item": row})
}

/*
AdminDeletePr ลบข่าวประชาสัมพันธ์

ประวัติการรับคะแนนของข่าวที่ถูกลบจะหายไปด้วย (ON DELETE CASCADE)
แต่รายการคะแนนใน point_transactions ยังอยู่ครบ เพราะผูกไว้แบบ SET NULL
คะแนนที่พนักงานได้ไปแล้วจึงไม่หายไปจากประวัติคะแนนของเขา
*/
func AdminDeletePr(w http.ResponseWriter, r *http.Request) {
	claims := middleware.CurrentUser(r)

	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		web.Error(w, http.StatusBadRequest, "รหัสข่าวไม่ถูกต้อง")
		return
	}

	if _, err := store.Exec(`DELETE FROM announcements WHERE id = $1 AND channel = 'pr'`, id); err != nil {
		web.Fail(w, err)
		return
	}

	logAudit(claims.ID, "pr.delete", strconv.FormatInt(id, 10), "")
	web.JSON(w, http.StatusOK, web.Map{"ok": true})
}

/*
AdminPrHistory คือประวัติการรับคะแนนจากประชาสัมพันธ์

ค้นได้ด้วยชื่อหรือรหัสพนักงาน หรือหัวข้อข่าว กรองด้วยชนิดเนื้อหาและช่วงวันที่
แบ่งหน้าเพราะรายการนี้โตขึ้นเรื่อย ๆ ตามจำนวนคนคูณจำนวนข่าว
*/
func AdminPrHistory(w http.ResponseWriter, r *http.Request) {
	page, limit := pageArgs(r)

	args := []any{}
	where := " WHERE v.awarded_at IS NOT NULL"

	if q := strings.TrimSpace(web.Param(r, "q", "")); q != "" {
		args = append(args, "%"+q+"%")
		where += ` AND (u.display_name ILIKE $1 OR u.employee_code ILIKE $1 OR a.title ILIKE $1)`
	}
	if kind := web.Param(r, "kind", ""); kind != "" && kind != "all" {
		args = append(args, kind)
		where += " AND a.kind = $" + strconv.Itoa(len(args))
	}
	if since := web.Param(r, "since", ""); since != "" {
		args = append(args, since)
		where += " AND v.awarded_at >= $" + strconv.Itoa(len(args)) + "::date"
	}
	if until := web.Param(r, "until", ""); until != "" {
		// บวกหนึ่งวันเพื่อให้รวมทั้งวันสุดท้าย ไม่ใช่ตัดที่เที่ยงคืนของวันนั้น
		args = append(args, until)
		where += " AND v.awarded_at < ($" + strconv.Itoa(len(args)) + "::date + 1)"
	}

	total, err := store.QueryOne(`
		SELECT count(*)::int AS total, COALESCE(sum(v.points),0)::int AS points
		FROM announcement_views v
		JOIN users u ON u.id = v.user_id
		JOIN announcements a ON a.id = v.announcement_id`+where, args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	args = append(args, limit, (page-1)*limit)
	rows, err := store.Query(`
		SELECT v.id, u.employee_code, u.display_name, u.department,
		       a.title, a.kind, a.category, a.read_seconds, a.watch_percent,
		       v.points, v.awarded_at
		FROM announcement_views v
		JOIN users u ON u.id = v.user_id
		JOIN announcements a ON a.id = v.announcement_id`+where+`
		ORDER BY v.awarded_at DESC
		LIMIT $`+strconv.Itoa(len(args)-1)+` OFFSET $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		web.Fail(w, err)
		return
	}

	web.JSON(w, http.StatusOK, web.Map{
		"rows":   rows,
		"total":  toInt(total["total"]),
		"points": toInt(total["points"]),
		"page":   page,
		"limit":  limit,
	})
}
