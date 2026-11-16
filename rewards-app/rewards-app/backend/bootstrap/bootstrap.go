package bootstrap

import (
	"fmt"
	"log"

	"rewards/security"
	"rewards/store"
)

/*
สร้างข้อมูลตั้งต้นที่ระบบต้องมีจึงจะทำงานได้

ใช้ร่วมกันระหว่าง go run . (เรียกอัตโนมัติตอนเพิ่งสร้างตาราง)
และ go run ./cmd/seed (เรียกเอง) จะได้ไม่มีโค้ดซ้ำสองที่แล้วหลุดกัน

ทุกคำสั่งใช้ ON CONFLICT DO NOTHING จึงสั่งซ้ำได้ ข้อมูลเดิมไม่ถูกเขียนทับ
*/

// Run สร้างบัญชีตั้งต้น ระดับสมาชิก ค่าตั้งระบบ และเอกสารข้อกำหนด
func Run() error {
	for _, step := range []func() error{accounts, tiers, settings, policies} {
		if err := step(); err != nil {
			return err
		}
	}
	return nil
}

// RunOrLog ใช้ตอนเปิดเซิร์ฟเวอร์ ถ้าพลาดให้เตือนแต่ไม่ล้มทั้งเซิร์ฟเวอร์
func RunOrLog() {
	if err := Run(); err != nil {
		log.Printf("⚠  สร้างข้อมูลตั้งต้นไม่สำเร็จ: %v", err)
	}
}

func exec(query string, args ...any) error {
	if _, err := store.Exec(query, args...); err != nil {
		return fmt.Errorf("เตรียมข้อมูลไม่สำเร็จ: %w", err)
	}
	return nil
}

func accounts() error {
	staff, err := security.HashPassword("2962")
	if err != nil {
		return err
	}
	admin, err := security.HashPassword("line")
	if err != nil {
		return err
	}

	if err := exec(`
		INSERT INTO users (employee_code, username, email, password_hash, display_name,
		                   department, position, branch, role, tier, points)
		VALUES ('1875','1875','1875@example.com',$1,'พนักงานทดสอบ','','','','user','Member',0)
		ON CONFLICT (employee_code) DO NOTHING`, staff); err != nil {
		return err
	}

	return exec(`
		INSERT INTO users (employee_code, username, email, password_hash, display_name,
		                   department, position, branch, role, tier, points)
		VALUES ('ADMIN','admin','admin@example.com',$1,'ผู้ดูแลระบบ','','ผู้ดูแลระบบ','','admin','Member',0)
		ON CONFLICT (employee_code) DO NOTHING`, admin)
}

// ระดับสมาชิกเป็นค่าที่ระบบใช้คำนวณ ไม่ใช่ข้อมูลตัวอย่าง จึงต้องมีตั้งแต่แรก
func tiers() error {
	return exec(`
		INSERT INTO tiers (key, name, subtitle, description, min_points, multiplier, benefits, color, status, sort_order, translations) VALUES
		('Member','Member','(ระดับเริ่มต้น)',
		 'สำหรับพนักงานทุกคน เป็นจุดเริ่มต้นของการมีส่วนร่วมในกิจกรรมขององค์กร',
		 0, 1.0,
		 E'เข้าร่วมกิจกรรมทั่วไป\nแลกของรางวัลตามเงื่อนไข', 'slate','active',1,
		 '{"en":{"subtitle":"(starter tier)","description":"For every employee. The starting point of taking part in company activities.","benefits":"Join general activities\nRedeem rewards under the stated conditions"},
		   "ja":{"subtitle":"（スタートランク）","description":"全従業員が対象。社内イベントに参加する第一歩です。","benefits":"一般イベントに参加できます\n条件に沿って景品と交換できます"}}'),
		('Silver','Silver','(ระดับเงิน)',
		 'สำหรับพนักงานที่มีส่วนร่วมอย่างต่อเนื่อง รับสิทธิประโยชน์เพิ่มเติมและรางวัลพิเศษ',
		 1000, 1.5,
		 E'รับคะแนนเพิ่มขึ้น 1.5 เท่า\nมีของรางวัลให้แลกมากขึ้นเฉพาะระดับ Silver\nลงทะเบียนกิจกรรมก่อนใคร 24 ชั่วโมง', 'sky','active',2,
		 '{"en":{"subtitle":"(silver tier)","description":"For employees who take part regularly. Extra benefits and special rewards.","benefits":"Earn 1.5x points\nMore rewards available for Silver members\nRegister for activities 24 hours early"},
		   "ja":{"subtitle":"（シルバーランク）","description":"継続的に参加している従業員向け。追加の特典と特別な景品があります。","benefits":"ポイント1.5倍\nシルバー限定の景品が増えます\nイベントに24時間早く申し込めます"}}'),
		('Elite','Elite','(ระดับพิเศษ)',
		 'สำหรับพนักงานที่มีส่วนร่วมสูงสุด รับสิทธิประโยชน์และรางวัลระดับพรีเมียม',
		 2000, 2.0,
		 E'รับคะแนนเพิ่มขึ้น 2.0 เท่า\nมีของรางวัลให้แลกมากขึ้นเฉพาะระดับ Elite\nของขวัญประจำปีจากบริษัท', 'gold','active',3,
		 '{"en":{"subtitle":"(elite tier)","description":"For the most active employees. Premium benefits and rewards.","benefits":"Earn 2x points\nMore rewards available for Elite members\nAn annual gift from the company"},
		   "ja":{"subtitle":"（エリートランク）","description":"最も積極的に参加している従業員向け。プレミアムな特典と景品。","benefits":"ポイント2倍\nエリート限定の景品が増えます\n会社からの年次ギフト"}}')
		ON CONFLICT (key) DO NOTHING`)
}

func settings() error {
	if err := exec(`
		INSERT INTO settings (key, value, label, kind) VALUES
		('org_name','','ชื่อองค์กรที่แสดงในแอป','text'),
		('points_expire_month','12','เดือนที่คะแนนหมดอายุ (1-12)','number'),
		('points_expire_day','31','วันที่คะแนนหมดอายุ','number'),
		('expire_warn_days','30','แจ้งเตือนล่วงหน้าก่อนคะแนนหมดอายุ (วัน)','number'),
		('redeem_limit_per_month','1','จำกัดการแลกของรางวัลต่อคนต่อเดือน (0 = ไม่จำกัด)','number'),
		('allow_self_register','false','ให้พนักงานสมัครบัญชีเองได้','boolean')
		ON CONFLICT (key) DO NOTHING`); err != nil {
		return err
	}

	return exec(`
		INSERT INTO notification_events (key, name, description, in_app, email, active, sort_order) VALUES
		('point_earned','ได้รับคะแนน','แจ้งเตือนพนักงานเมื่อได้รับคะแนน',true,false,true,1),
		('reward_redeemed','แลกรางวัลสำเร็จ','แจ้งเตือนเมื่อแลกรางวัลสำเร็จ',true,false,false,2),
		('points_expiring','คะแนนใกล้หมดอายุ','แจ้งเตือนก่อนคะแนนหมดอายุ',true,true,true,3),
		('event_starting','กิจกรรมใกล้เริ่ม','แจ้งเตือนก่อนกิจกรรมเริ่ม',true,false,true,4),
		('reward_ready','รอรับรางวัล','แจ้งเตือนเมื่อของรางวัลพร้อมให้มารับ',false,true,true,5)
		ON CONFLICT (key) DO NOTHING`)
}

// เอกสารสองฉบับนี้ต้องมีตั้งแต่แรก เพราะพนักงานต้องกดยอมรับก่อนเข้าใช้งานครั้งแรก
func policies() error {
	return exec(`
		INSERT INTO policies (key, title, content, translations) VALUES
		('privacy','ข้อกำหนดและนโยบายความเป็นส่วนตัว',
		 E'ยินดีต้อนรับ เพื่อประสบการณ์ที่ดีและปลอดภัยในการใช้งาน กรุณาอ่านและทำความเข้าใจข้อกำหนดและนโยบายความเป็นส่วนตัวด้านล่างนี้ก่อนเริ่มต้นใช้งาน\n\n## ข้อกำหนดและเงื่อนไขการใช้งาน\n- แอปพลิเคชันนี้เป็นสวัสดิการเฉพาะพนักงานปัจจุบันของบริษัทเท่านั้น ไม่สามารถโอนสิทธิ์ให้บุคคลอื่นได้\n- บริษัทขอสงวนสิทธิ์ในการเปลี่ยนแปลงเงื่อนไขการสะสมคะแนน แคตตาล็อกของรางวัล หรือระงับบัญชีที่พบว่ามีพฤติกรรมทุจริต โดยไม่ต้องแจ้งให้ทราบล่วงหน้า\n\n## นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)\nบริษัทให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของคุณ ข้อมูลที่จัดเก็บและประมวลผลมีวัตถุประสงค์เพื่อการให้บริการภายในแอปพลิเคชันเท่านั้น\n1. ข้อมูลที่จัดเก็บ: ชื่อ-นามสกุล รหัสพนักงาน แผนก และประวัติการทำกิจกรรมหรือแลกของรางวัล\n2. วัตถุประสงค์: ใช้เพื่อคำนวณคะแนนและจัดส่งของรางวัล\n3. การรักษาความปลอดภัย: เข้ารหัสข้อมูลระหว่างรับส่งทุกครั้ง\n4. ระยะเวลาจัดเก็บ: ตลอดระยะเวลาการเป็นพนักงาน\nหากมีข้อสงสัยเกี่ยวกับนโยบายข้อมูลส่วนบุคคล ติดต่อได้ที่ฝ่ายบริหารงานทั่วไปและทรัพยากรบุคคล',
		 '{"en":{"title":"Terms and Privacy Policy","content":"Welcome. Please read the terms and privacy policy below before using the application.\n\n## TERMS OF USE\n- This application is a benefit for current employees only and cannot be transferred.\n- The company may change the point rules or the reward catalogue, or suspend accounts found to be misusing the system, without prior notice.\n\n## PERSONAL DATA PROTECTION (PDPA)\nWe process your data only to provide this service.\n1. Data collected: name, employee ID, department, activity and redemption history\n2. Purpose: calculating points and delivering rewards\n3. Security: data is encrypted in transit\n4. Retention: for the duration of your employment\nFor questions, contact the General Affairs and Human Resources Department."},
		   "ja":{"title":"利用規約とプライバシーポリシー","content":"ご利用の前に、以下の利用規約とプライバシーポリシーをお読みください。\n\n## 利用規約\n- 本アプリは現従業員のみの福利厚生であり、権利の譲渡はできません。\n- 当社は、ポイント規則や景品カタログの変更、不正利用が確認されたアカウントの停止を、事前通知なく行う場合があります。\n\n## 個人情報保護（PDPA）\n取得した情報は本サービスの提供のためにのみ利用します。\n1. 取得する情報：氏名、社員番号、部署、参加・交換履歴\n2. 利用目的：ポイント計算と景品の提供\n3. 安全管理：通信は暗号化されます\n4. 保存期間：在籍期間中\nご不明な点は総務人事部までお問い合わせください。"}}'),
		('terms','ข้อกำหนดและเงื่อนไขการใช้งาน',
		 E'## 1. ข้อตกลงทั่วไป\nแอปพลิเคชันนี้จัดทำขึ้นเพื่อเป็นสวัสดิการและส่งเสริมการมีส่วนร่วมของพนักงานภายในองค์กรเท่านั้น สิทธิการใช้งานจำกัดเฉพาะพนักงานที่ยังมีสถานะเป็นพนักงานปัจจุบัน หากพ้นสภาพการเป็นพนักงาน บัญชีผู้ใช้งานและคะแนนสะสมทั้งหมดจะถูกยกเลิกทันที\n\n## 2. เงื่อนไขเกี่ยวกับคะแนนสะสม\n- คะแนนสะสมที่ได้รับจากกิจกรรมต่าง ๆ ไม่สามารถแลกเปลี่ยน ทอน หรือโอนเป็นเงินสดได้ในทุกกรณี\n- บริษัทขอสงวนสิทธิ์ในการเรียกคืนคะแนนสะสม หากตรวจสอบพบว่าได้มาโดยทุจริตหรือเกิดจากความผิดพลาดของระบบ\n\n## 3. การรับประกันและการเคลมของรางวัล\n- พนักงานต้องตรวจสอบสภาพของรางวัลทันที ณ วันที่เซ็นรับของ หากพบว่าชำรุดเสียหายจากการผลิต สามารถแจ้งขอเปลี่ยนสินค้าใหม่ได้ภายใน 7 วันทำการ\n- รูปภาพของรางวัลในแคตตาล็อกใช้เพื่อการโฆษณาเท่านั้น สีและรูปแบบจริงอาจมีความแตกต่างกันเล็กน้อย',
		 '{"en":{"title":"Terms and Conditions","content":"## 1. General\nThis application exists to support employee engagement within the organisation. Access is limited to current employees. If employment ends, the account and all points are cancelled immediately.\n\n## 2. Points\n- Points earned from activities cannot be exchanged, refunded or converted to cash in any case.\n- The company may reclaim points obtained fraudulently or through a system error.\n\n## 3. Warranty and claims\n- Check the condition of your reward on the day you sign for it. Manufacturing defects can be reported within 7 working days.\n- Catalogue images are for illustration only. Actual colour and design may differ slightly."},
		   "ja":{"title":"利用規約","content":"## 1. 総則\n本アプリは社内の従業員エンゲージメント向上を目的としています。利用は現従業員に限られ、退職時にアカウントと全ポイントは即時無効となります。\n\n## 2. ポイントについて\n- イベントで獲得したポイントは、いかなる場合も交換・払い戻し・現金化できません。\n- 不正またはシステムの誤りにより付与されたポイントは回収する場合があります。\n\n## 3. 保証と申し出\n- 受け取り当日に景品の状態をご確認ください。製造上の不具合は7営業日以内にお申し出いただけます。\n- カタログの画像はイメージです。実際の色やデザインが多少異なる場合があります。"}}')
		ON CONFLICT (key) DO NOTHING`)
}
