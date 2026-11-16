package translate

import (
	"sort"
	"strings"
	"sync"
)

/*
คลังคำในตัวโปรแกรม — ตัวสำรองเวลาออกเน็ตไม่ได้

ภาษาไทยเขียนติดกันไม่มีช่องว่าง จึงใช้วิธี "จับคู่คำที่ยาวที่สุดก่อน"
ไล่จากซ้ายไปขวา ตำแหน่งไหนเจอคำในคลังก็แทนที่ด้วยคำแปล ไม่เจอก็ปล่อยผ่าน

ผลที่ได้หยาบกว่าบริการแปลจริงมาก เหมาะกับข้อความสั้นอย่างชื่อของรางวัล
ชื่อกิจกรรม หรือชื่อหมวดหมู่ ซึ่งเป็นข้อความส่วนใหญ่ที่ผู้ดูแลกรอก
ประโยคยาว ๆ จะอ่านได้แบบพอเดาความ

ถ้าต้องการคุณภาพจริงจัง ให้ตั้ง LibreTranslate ไว้ในวงแลนแล้วชี้ TRANSLATE_URL มาที่นั่น
*/

// Glossary แปลด้วยคลังคำ คืนข้อความว่างถ้าแปลไม่ได้เลยสักคำ
func Glossary(text, lang string) string {
	switch lang {
	case "en":
		return thaiToEnglish(text)
	case "ja":
		// ไทย -> อังกฤษ -> ญี่ปุ่น
		// แปลผ่านภาษาอังกฤษเพราะคลังคำอังกฤษ-ญี่ปุ่นเขียนและตรวจง่ายกว่าไทย-ญี่ปุ่นตรง ๆ
		english := thaiToEnglish(text)
		if english == "" {
			return ""
		}
		return englishToJapanese(english)
	default:
		return ""
	}
}

// minCoverage คือสัดส่วนตัวอักษรไทยที่คลังคำต้องแปลได้ จึงจะยอมใช้ผลลัพธ์
//
// ต่ำกว่านี้แปลว่าในประโยคยังเหลือคำไทยปนอยู่มาก ผลลัพธ์จะออกมาเป็นลูกผสมแบบ
// "รับ points addขึ้น 1.5 เท่า" ซึ่งอ่านไม่รู้เรื่องทั้งสองภาษา
// กรณีแบบนั้นคืนค่าว่างดีกว่า แล้วให้ตัวเรียกแสดงภาษาไทยต้นฉบับไป
// ผู้ใช้ต่างชาติเห็นภาษาไทยยังพอคัดลอกไปแปลเองได้ แต่เห็นข้อความพังทำอะไรไม่ได้เลย
const minCoverage = 0.85

func thaiToEnglish(text string) string {
	runes := []rune(text)
	var out strings.Builder

	thaiTotal, thaiMatched := 0, 0
	for _, r := range runes {
		if isThai(r) {
			thaiTotal++
		}
	}

	for i := 0; i < len(runes); {
		word, length := longestMatch(thaiKeys(), thaiEnglish, runes, i)
		if length > 0 {
			if out.Len() > 0 && !strings.HasSuffix(out.String(), " ") {
				out.WriteByte(' ')
			}
			out.WriteString(word)
			for _, r := range runes[i : i+length] {
				if isThai(r) {
					thaiMatched++
				}
			}
			i += length
			continue
		}
		out.WriteRune(runes[i])
		i++
	}

	if thaiTotal == 0 || float64(thaiMatched)/float64(thaiTotal) < minCoverage {
		return ""
	}
	return tidy(out.String())
}

func isThai(r rune) bool {
	return r >= 0x0E00 && r <= 0x0E7F
}

func englishToJapanese(text string) string {
	words := strings.Fields(text)
	var out strings.Builder

	const punctuation = ".,:;()[]!?\"'"

	for _, word := range words {
		// แยกเครื่องหมายวรรคตอนหัวท้ายออกก่อนค้นคลังคำ แล้วใส่กลับตามเดิม
		// ไม่งั้นวงเล็บปิดของคำอย่าง "(special)" จะหายไปกับคำแปล
		trimmed := strings.Trim(word, punctuation)
		lead := word[:strings.Index(word, trimmed)]
		tail := word[len(lead)+len(trimmed):]

		if japanese, ok := englishJapanese[strings.ToLower(trimmed)]; ok && trimmed != "" {
			out.WriteString(lead)
			out.WriteString(japanese)
			out.WriteString(tail)
			continue
		}

		// คำที่ไม่มีในคลัง เก็บเป็นอักษรโรมันไว้ ยังอ่านรู้เรื่องกว่าปล่อยว่าง
		if out.Len() > 0 {
			out.WriteByte(' ')
		}
		out.WriteString(word)
	}

	return tidy(out.String())
}

func longestMatch(keys []string, table map[string]string, runes []rune, start int) (string, int) {
	remaining := len(runes) - start
	for _, key := range keys {
		candidate := []rune(key)
		if len(candidate) > remaining {
			continue
		}
		if string(runes[start:start+len(candidate)]) == key {
			return table[key], len(candidate)
		}
	}
	return "", 0
}

// tidy เก็บกวาดช่องว่างที่เกิดจากการแทนคำทีละคำ
// เช่น "(ระดับพิเศษ)" ถ้าไม่เก็บกวาดจะได้ "( level special )" ซึ่งอ่านแล้วสะดุด
func tidy(text string) string {
	text = strings.Join(strings.Fields(text), " ")

	for _, pair := range [][2]string{
		{" ,", ","}, {" .", "."}, {" :", ":"}, {" ;", ";"},
		{" !", "!"}, {" ?", "?"}, {" %", "%"},
		{"( ", "("}, {" )", ")"}, {"[ ", "["}, {" ]", "]"},
	} {
		text = strings.ReplaceAll(text, pair[0], pair[1])
	}

	return strings.TrimSpace(text)
}

// เรียงกุญแจจากยาวไปสั้นครั้งเดียวแล้วจำไว้ จะได้จับคู่คำยาวก่อนเสมอ
// เช่น "ของรางวัล" ต้องชนะ "ของ" ไม่งั้นได้คำแปลเพี้ยน
var (
	thaiKeysOnce   sync.Once
	thaiSortedKeys []string
)

func thaiKeys() []string {
	thaiKeysOnce.Do(func() {
		thaiSortedKeys = make([]string, 0, len(thaiEnglish))
		for key := range thaiEnglish {
			thaiSortedKeys = append(thaiSortedKeys, key)
		}
		sort.Slice(thaiSortedKeys, func(a, b int) bool {
			left, right := []rune(thaiSortedKeys[a]), []rune(thaiSortedKeys[b])
			if len(left) != len(right) {
				return len(left) > len(right)
			}
			return thaiSortedKeys[a] < thaiSortedKeys[b]
		})
	})
	return thaiSortedKeys
}

// คลังคำไทย -> อังกฤษ เน้นคำที่ใช้จริงในระบบสะสมคะแนนและงานบุคคล
var thaiEnglish = map[string]string{
	/* คะแนนและสมาชิก */
	"คะแนนสะสม": "reward points", "สะสมคะแนน": "collect points", "คะแนน": "points",
	"แต้ม": "points", "ระดับสมาชิก": "membership tier", "สมาชิก": "member",
	"ระดับ": "level", "สิทธิประโยชน์": "benefits", "สิทธิพิเศษ": "special privilege",
	"หมดอายุ": "expires", "วันหมดอายุ": "expiry date", "ยอดคงเหลือ": "balance",
	"ตัวคูณคะแนน": "points multiplier", "เงื่อนไข": "conditions",

	/* ของรางวัล */
	"ของรางวัล": "reward", "รางวัล": "reward", "แลกของรางวัล": "redeem reward",
	"แลกรับ": "redeem", "แลก": "redeem", "ของสมนาคุณ": "gift", "ของที่ระลึก": "souvenir",
	"บัตรกำนัล": "gift voucher", "คูปอง": "coupon", "ส่วนลด": "discount",
	"จำนวนคงเหลือ": "stock left", "คงเหลือ": "remaining", "หมดแล้ว": "out of stock",
	"วิธีใช้": "how to use", "วิธีการ": "how to", "รายละเอียด": "details",

	/* กิจกรรม */
	"กิจกรรม": "activity", "งานกิจกรรม": "event", "เข้าร่วมกิจกรรม": "join activity",
	"เข้าร่วม": "join", "ลงทะเบียน": "register", "ลงชื่อ": "sign in",
	"ผู้ลงทะเบียน": "registrant", "เช็คอิน": "check in", "กำหนดการ": "agenda",
	"สถานที่": "location", "วันที่": "date", "เวลา": "time", "เริ่ม": "start",
	"สิ้นสุด": "end", "โหวต": "vote", "ลงคะแนน": "cast a vote", "ตัวเลือก": "option",
	"จำนวนที่รับ": "capacity", "เต็มแล้ว": "full", "ปิดรับ": "closed",
	"เปิดรับ": "open", "เร็วๆ นี้": "coming soon", "เร็ว ๆ นี้": "coming soon",

	/* แบบสำรวจ */
	"แบบสำรวจ": "survey", "แบบสอบถาม": "questionnaire", "ความคิดเห็น": "feedback",
	"ข้อเสนอแนะ": "suggestion", "ตอบแบบสอบถาม": "answer the questionnaire",
	"คำถาม": "question", "คำตอบ": "answer", "ส่งคำตอบ": "submit answers",
	"ไม่ระบุตัวตน": "anonymous", "เรียบร้อย": "completed", "รอดำเนินการ": "pending",

	/* องค์กร */
	"พนักงาน": "employee", "รหัสพนักงาน": "employee code", "ชื่อ-นามสกุล": "full name",
	"ชื่อ - นามสกุล": "full name", "ชื่อ": "name", "นามสกุล": "surname",
	"แผนก": "section", "ฝ่าย": "division", "หน่วยงาน": "department",
	"ตำแหน่ง": "position", "สาขา": "location", "โรงงาน": "factory",
	"สำนักงาน": "office", "บริษัท": "company", "ผู้ดูแลระบบ": "administrator",
	"หัวหน้างาน": "supervisor", "ผู้จัดการ": "manager", "ทั้งหมด": "all",
	"จำนวน": "number", "จำนวนคน": "headcount", "คน": "people",

	/* ประกาศและระบบ */
	"ประกาศ": "announcement", "แจ้งเตือน": "notification", "ข่าวสาร": "news",
	"ข้อกำหนด": "terms", "นโยบายความเป็นส่วนตัว": "privacy policy", "นโยบาย": "policy",
	"ความเป็นส่วนตัว": "privacy", "คำถามที่พบบ่อย": "frequently asked questions",
	"ยินดีต้อนรับ": "welcome", "ขอบคุณ": "thank you", "กรุณา": "please",
	"หมายเหตุ": "remark", "สรุป": "summary", "รายงาน": "report", "รายการ": "item",
	"สถานะ": "status", "อัปเดต": "update", "ล่าสุด": "latest", "ประวัติ": "history",
	"ดาวน์โหลด": "download", "ค้นหา": "search", "บันทึก": "save", "ยกเลิก": "cancel",
	"ยืนยัน": "confirm", "ปิด": "close", "เปิด": "open", "แก้ไข": "edit",
	"ลบ": "delete", "เพิ่ม": "add", "ดูทั้งหมด": "see all",

	/* คำเชื่อมและคำทั่วไป */
	"ประจำปี": "annual", "ประจำเดือน": "monthly", "ปี": "year", "เดือน": "month",
	"วัน": "day", "ครั้ง": "times", "ที่": "at", "และ": "and", "หรือ": "or",
	"ของ": "of", "ใน": "in", "สำหรับ": "for", "ต่อ": "per", "ถึง": "to",
	"ไม่": "not", "มี": "have", "ได้รับ": "receive", "ใช้": "use",
	"ฟรี": "free", "ใหม่": "new", "พิเศษ": "special", "ด่วน": "urgent",
	"วันกีฬาสี": "sports day", "ปีใหม่": "new year", "สงกรานต์": "Songkran",
	"อบรม": "training", "ความปลอดภัย": "safety", "สุขภาพ": "health",
}

// คลังคำอังกฤษ -> ญี่ปุ่น ใช้ต่อจากผลแปลเป็นอังกฤษ
var englishJapanese = map[string]string{
	"points": "ポイント", "reward": "景品", "rewards": "景品", "redeem": "交換",
	"member": "会員", "membership": "会員", "tier": "ランク", "level": "レベル",
	"benefits": "特典", "balance": "残高", "expires": "有効期限", "conditions": "条件",
	"activity": "活動", "event": "イベント", "events": "イベント", "join": "参加",
	"register": "登録", "registrant": "登録者", "check": "チェック", "in": "イン",
	"agenda": "予定", "location": "場所", "date": "日付", "time": "時間",
	"start": "開始", "end": "終了", "vote": "投票", "option": "選択肢",
	"capacity": "定員", "full": "満員", "closed": "終了", "open": "受付中",
	"survey": "アンケート", "questionnaire": "アンケート", "feedback": "ご意見",
	"suggestion": "ご提案", "question": "質問", "answer": "回答", "submit": "送信",
	"anonymous": "匿名", "completed": "完了", "pending": "未完了",
	"employee": "従業員", "code": "コード", "name": "氏名", "surname": "姓",
	"section": "課", "division": "部", "department": "部署", "position": "役職",
	"factory": "工場", "office": "事務所", "company": "会社",
	"administrator": "管理者", "supervisor": "監督者", "manager": "課長",
	"all": "すべて", "number": "数", "headcount": "人数", "people": "名",
	"announcement": "お知らせ", "notification": "通知", "news": "ニュース",
	"terms": "利用規約", "privacy": "プライバシー", "policy": "ポリシー",
	"welcome": "ようこそ", "thank": "ありがとう", "you": "ございます",
	"please": "お願いします", "remark": "備考", "summary": "まとめ",
	"report": "レポート", "item": "項目", "status": "状態", "update": "更新",
	"latest": "最新", "history": "履歴", "download": "ダウンロード",
	"search": "検索", "save": "保存", "cancel": "取消", "confirm": "確認",
	"close": "閉じる", "edit": "編集", "delete": "削除", "add": "追加",
	"annual": "年次", "monthly": "月次", "year": "年", "month": "月", "day": "日",
	"and": "と", "or": "または", "of": "の", "for": "のため", "per": "あたり",
	"free": "無料", "new": "新しい", "special": "特別", "urgent": "至急",
	"sports": "スポーツ", "training": "研修", "safety": "安全", "health": "健康",
	"gift": "ギフト", "voucher": "引換券", "coupon": "クーポン", "discount": "割引",
	"stock": "在庫", "left": "残り", "remaining": "残り", "details": "詳細",
	"how": "方法", "to": "へ", "use": "使用",
}
