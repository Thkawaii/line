package routes

import (
	"net/http"
	"os"

	"rewards/controllers"
	"rewards/middleware"
	"rewards/web"
)

// Setup ลงทะเบียนเส้นทางทั้งหมด
// ใช้ ServeMux ของ Go 1.22 ที่รองรับการระบุ method และ path parameter ได้ในตัว
func Setup() *http.ServeMux {
	mux := http.NewServeMux()

	// ไฟล์รูปที่อัปโหลด เสิร์ฟตรงจากโฟลเดอร์ ไม่ต้องผ่าน API
	uploadDir := controllers.UploadDir()
	_ = os.MkdirAll(uploadDir, 0o755)
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(uploadDir))))

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		web.JSON(w, http.StatusOK, web.Map{"ok": true})
	})

	/* เข้าสู่ระบบ */
	mux.HandleFunc("POST /api/auth/login", controllers.Login)
	mux.HandleFunc("GET /api/auth/me", middleware.RequireAuth(controllers.Me))
	mux.HandleFunc("POST /api/auth/accept-terms", middleware.RequireAuth(controllers.AcceptTerms))

	/* ฝั่งพนักงาน */
	user := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, middleware.RequireAuth(handler))
	}

	user("GET /api/app/home", controllers.Home)
	user("GET /api/app/points", controllers.Points)
	user("GET /api/app/points/history", controllers.PointsHistory)
	user("GET /api/app/events", controllers.Events)
	user("POST /api/app/events/{id}/register", controllers.RegisterEvent)
	user("GET /api/app/rewards", controllers.Rewards)
	user("POST /api/app/rewards/{id}/redeem", controllers.RedeemReward)
	user("GET /api/app/my-rewards", controllers.MyRewards)
	user("GET /api/app/favorites", controllers.Favorites)
	user("POST /api/app/favorites/toggle", controllers.ToggleFavorite)
	user("GET /api/app/notifications", controllers.Notifications)
	user("POST /api/app/notifications/read-all", controllers.ReadAllNotifications)
	user("GET /api/app/faqs", controllers.Faqs)
	user("GET /api/app/policies/{key}", controllers.Policy)
	user("GET /api/app/tiers", controllers.Tiers)
	user("GET /api/app/feedback/pending", controllers.PendingFeedback)
	user("POST /api/app/events/{id}/feedback", controllers.SubmitFeedback)
	user("GET /api/app/announcements", controllers.Announcements)
	user("POST /api/app/announcements/{id}/acknowledge", controllers.AcknowledgeAnnouncement)
	user("GET /api/app/surveys", controllers.Surveys)
	user("POST /api/app/surveys/{id}/submit", controllers.SubmitSurvey)

	/*
		ฝั่งผู้ดูแลระบบ แบ่งสิทธิ์เป็นสองชั้น

		office  ผู้ดูแลระบบ ฝ่ายธุรการ และพนักงานในแผนกหลังบ้าน (GA, ER, HR, HRM, HRD)
		        ใช้กับงานประจำวันเกือบทั้งหมด
		admin   ผู้ดูแลระบบตัวจริงเท่านั้น
		        ใช้กับกลุ่ม "ตั้งค่าระบบ" ซึ่งแก้แล้วกระทบทั้งระบบ
		        ได้แก่ บัญชีผู้ดูแลระบบ, Audit Logs, System Settings
		        รวมถึงการลบพนักงานและการล้างคะแนนประจำปี ซึ่งย้อนกลับไม่ได้
	*/
	admin := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, middleware.RequireAdmin(handler))
	}
	office := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, middleware.RequireOffice(handler))
	}

	office("GET /api/admin/overview", controllers.AdminOverview)
	office("GET /api/admin/analytics", controllers.AdminAnalytics)
	office("GET /api/admin/analytics/frequency", controllers.AdminFrequencyPeople)

	office("GET /api/admin/employees", controllers.AdminEmployees)
	office("POST /api/admin/employees", controllers.AdminCreateEmployee)
	office("GET /api/admin/employees/{id}", controllers.AdminEmployee)
	office("PATCH /api/admin/employees/{id}", controllers.AdminUpdateEmployee)
	admin("DELETE /api/admin/employees/{id}", controllers.AdminDeleteEmployee)

	office("GET /api/admin/points", controllers.AdminPoints)

	office("GET /api/admin/points/reset-status", controllers.AdminResetStatus)
	// ตัดยอดประจำปีกันสิทธิ์ด้วย CanAdjustPoints ภายในตัวควบคุม เหมือนการปรับคะแนน
	office("POST /api/admin/points/annual-reset", controllers.AdminAnnualReset)

	office("GET /api/admin/rewards", controllers.AdminRewards)
	office("POST /api/admin/rewards", controllers.AdminCreateReward)
	office("PATCH /api/admin/rewards/{id}", controllers.AdminUpdateReward)

	office("GET /api/admin/redemptions", controllers.AdminRedemptions)
	office("POST /api/admin/redemptions/{id}/receive", controllers.AdminReceiveRedemption)

	// ดูรายการกิจกรรมได้ แต่สร้าง/แก้ไข/เช็คอิน ยังเป็นของผู้ดูแลระบบเท่านั้น
	office("POST /api/admin/events", controllers.AdminCreateEvent)
	office("PATCH /api/admin/events/{id}", controllers.AdminUpdateEvent)
	office("POST /api/admin/events/{id}/check-in", controllers.AdminCheckIn)

	office("GET /api/admin/notifications", controllers.AdminNotifications)
	office("POST /api/admin/notifications", controllers.AdminCreateNotification)
	admin("GET /api/admin/notification-events", controllers.AdminNotificationEvents)
	admin("PATCH /api/admin/notification-events/{key}", controllers.AdminUpdateNotificationEvent)

	office("POST /api/admin/uploads", controllers.Upload)
	office("POST /api/admin/uploads/document", controllers.UploadDocument)

	office("GET /api/admin/banners", controllers.AdminBanners)
	office("POST /api/admin/banners", controllers.AdminCreateBanner)
	office("PATCH /api/admin/banners/{id}", controllers.AdminUpdateBanner)
	office("DELETE /api/admin/banners/{id}", controllers.AdminDeleteBanner)

	office("GET /api/admin/faqs", controllers.AdminFaqs)
	office("POST /api/admin/faqs", controllers.AdminCreateFaq)
	office("PATCH /api/admin/faqs/{id}", controllers.AdminUpdateFaq)
	office("DELETE /api/admin/faqs/{id}", controllers.AdminDeleteFaq)

	office("GET /api/admin/policies", controllers.AdminPolicies)
	office("PUT /api/admin/policies/{key}", controllers.AdminSavePolicy)

	office("GET /api/admin/tiers", controllers.AdminTiers)
	office("POST /api/admin/tiers", controllers.AdminCreateTier)
	office("PATCH /api/admin/tiers/{key}", controllers.AdminUpdateTier)
	office("DELETE /api/admin/tiers/{key}", controllers.AdminDeleteTier)
	office("POST /api/admin/tiers/recalculate", controllers.AdminRecalculateTiers)

	admin("GET /api/admin/admins", controllers.AdminAdmins)
	admin("POST /api/admin/admins", controllers.AdminCreateAdmin)
	admin("PATCH /api/admin/admins/{id}", controllers.AdminUpdateAdmin)

	admin("GET /api/admin/settings", controllers.AdminSettings)
	admin("PUT /api/admin/settings", controllers.AdminSaveSettings)

	admin("GET /api/admin/audit-logs", controllers.AdminAuditLogs)

	/* ประกาศข่าวสารที่ต้องกดรับทราบ */
	office("POST /api/admin/announcements", controllers.AdminCreateAnnouncement)
	office("PATCH /api/admin/announcements/{id}", controllers.AdminUpdateAnnouncement)
	office("DELETE /api/admin/announcements/{id}", controllers.AdminDeleteAnnouncement)

	/* รายการตำแหน่งงานและแผนก ใช้ทำช่องเลือกในหน้าจัดการพนักงาน */
	office("GET /api/admin/org-options", controllers.AdminOrgOptions)

	/* คำแปลอัตโนมัติ */
	admin("GET /api/admin/translations", controllers.AdminTranslationStatus)
	admin("GET /api/admin/translations/items", controllers.AdminTranslationItems)
	admin("POST /api/admin/translations/run", controllers.AdminRunTranslations)
	admin("POST /api/admin/translations/rebuild", controllers.AdminRebuildTranslations)
	admin("PUT /api/admin/translations/{table}", controllers.AdminSaveTranslation)

	/* หัวข้อลงทะเบียน / แบบสำรวจ */
	office("POST /api/admin/surveys", controllers.AdminCreateSurvey)
	office("PATCH /api/admin/surveys/{id}", controllers.AdminUpdateSurvey)
	office("DELETE /api/admin/surveys/{id}", controllers.AdminDeleteSurvey)

	// ส่งแจ้งเตือนเป็นการกระทำ ไม่ใช่การดู จึงยังเป็นของผู้ดูแลระบบเท่านั้น
	office("POST /api/admin/surveys/{id}/remind", controllers.AdminRemindSurvey)

	/*
		เส้นทางสำหรับ "ดูรายงาน" เปิดให้ทั้งผู้ดูแลระบบและฝ่ายธุรการ (role ga)

		ฝ่ายธุรการเห็นข้อมูลเท่ากับผู้ดูแลระบบ รวมถึงรายชื่อพนักงาน
		เพราะต้องใช้ติดตามว่าใครยังไม่ได้ลงทะเบียนในแต่ละกิจกรรม
		สิ่งที่ยังทำไม่ได้คือการแก้ไขข้อมูล ซึ่งยังอยู่ในกลุ่ม admin ทั้งหมด

		ข้อยกเว้นเดียวคือหัวข้อที่ตั้งเป็น "ไม่ระบุตัวตน" ไว้
		คำตอบของหัวข้อนั้นจะไม่มีชื่อผู้ตอบติดมา ไม่ว่าใครเป็นคนเรียกดู
		เพราะเป็นสิ่งที่เราแจ้งพนักงานไว้บนหน้าจอก่อนกดส่ง
	*/
	office("GET /api/admin/surveys", controllers.AdminSurveys)
	office("GET /api/admin/surveys/{id}/summary", controllers.AdminSurveySummary)
	office("GET /api/admin/surveys/{id}/pending", controllers.AdminSurveyPending)
	office("GET /api/admin/surveys/{id}/responses", controllers.AdminSurveyResponses)
	/*
		ปรับคะแนนด้วยมือ

		ผ่าน RequireReport ก่อน (admin หรือ ga) แล้วตัวควบคุมจะเช็กตำแหน่งงานอีกชั้น
		ด้วย CanAdjustPoints — ต้องเป็น admin หรือมีตำแหน่งตั้งแต่ Chief Engineer ขึ้นไป

		ถ้าใช้ RequireAdmin ตรงนี้ กติกาเรื่องตำแหน่งจะไม่มีผลกับใครเลย
		เพราะ admin ผ่านอยู่แล้วและคนอื่นถูกปฏิเสธตั้งแต่ชั้นแรก
	*/
	office("POST /api/admin/points/adjust", controllers.AdminAdjustPoints)

	office("GET /api/admin/announcements", controllers.AdminAnnouncements)
	office("GET /api/admin/announcements/{id}/readers", controllers.AdminAnnouncementReaders)
	office("GET /api/admin/events", controllers.AdminEvents)
	office("GET /api/admin/events/{id}/registrations", controllers.AdminEventRegistrations)
	office("GET /api/admin/events/{id}/feedback", controllers.AdminEventFeedback)
	office("GET /api/admin/feedback", controllers.AdminFeedbackOverview)

	// เส้นทางที่ไม่ตรงกับอะไรเลย ตอบ JSON เพื่อให้หน้าเว็บอ่าน error ได้
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		web.Error(w, http.StatusNotFound, "ไม่มีเส้นทาง "+r.Method+" "+r.URL.Path)
	})

	return mux
}
