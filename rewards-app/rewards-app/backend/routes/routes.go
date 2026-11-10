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
	user("GET /api/app/qr-token", controllers.QrToken)

	/* ฝั่งผู้ดูแลระบบ */
	admin := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, middleware.RequireAdmin(handler))
	}

	admin("GET /api/admin/overview", controllers.AdminOverview)
	admin("GET /api/admin/analytics", controllers.AdminAnalytics)

	admin("GET /api/admin/employees", controllers.AdminEmployees)
	admin("POST /api/admin/employees", controllers.AdminCreateEmployee)
	admin("GET /api/admin/employees/{id}", controllers.AdminEmployee)
	admin("PATCH /api/admin/employees/{id}", controllers.AdminUpdateEmployee)

	admin("GET /api/admin/points", controllers.AdminPoints)
	admin("POST /api/admin/points/adjust", controllers.AdminAdjustPoints)
	admin("GET /api/admin/points/reset-status", controllers.AdminResetStatus)
	admin("POST /api/admin/points/annual-reset", controllers.AdminAnnualReset)

	admin("GET /api/admin/rewards", controllers.AdminRewards)
	admin("POST /api/admin/rewards", controllers.AdminCreateReward)
	admin("PATCH /api/admin/rewards/{id}", controllers.AdminUpdateReward)

	admin("GET /api/admin/redemptions", controllers.AdminRedemptions)
	admin("POST /api/admin/redemptions/{id}/receive", controllers.AdminReceiveRedemption)

	admin("GET /api/admin/events", controllers.AdminEvents)
	admin("POST /api/admin/events", controllers.AdminCreateEvent)
	admin("PATCH /api/admin/events/{id}", controllers.AdminUpdateEvent)
	admin("POST /api/admin/events/{id}/check-in", controllers.AdminCheckIn)

	admin("GET /api/admin/notifications", controllers.AdminNotifications)
	admin("POST /api/admin/notifications", controllers.AdminCreateNotification)
	admin("GET /api/admin/notification-events", controllers.AdminNotificationEvents)
	admin("PATCH /api/admin/notification-events/{key}", controllers.AdminUpdateNotificationEvent)

	admin("POST /api/admin/uploads", controllers.Upload)

	admin("GET /api/admin/banners", controllers.AdminBanners)
	admin("POST /api/admin/banners", controllers.AdminCreateBanner)
	admin("PATCH /api/admin/banners/{id}", controllers.AdminUpdateBanner)
	admin("DELETE /api/admin/banners/{id}", controllers.AdminDeleteBanner)

	admin("GET /api/admin/faqs", controllers.AdminFaqs)
	admin("POST /api/admin/faqs", controllers.AdminCreateFaq)
	admin("PATCH /api/admin/faqs/{id}", controllers.AdminUpdateFaq)
	admin("DELETE /api/admin/faqs/{id}", controllers.AdminDeleteFaq)

	admin("GET /api/admin/policies", controllers.AdminPolicies)
	admin("PUT /api/admin/policies/{key}", controllers.AdminSavePolicy)

	admin("GET /api/admin/tiers", controllers.AdminTiers)
	admin("POST /api/admin/tiers", controllers.AdminCreateTier)
	admin("PATCH /api/admin/tiers/{key}", controllers.AdminUpdateTier)
	admin("DELETE /api/admin/tiers/{key}", controllers.AdminDeleteTier)
	admin("POST /api/admin/tiers/recalculate", controllers.AdminRecalculateTiers)

	admin("GET /api/admin/admins", controllers.AdminAdmins)
	admin("POST /api/admin/admins", controllers.AdminCreateAdmin)
	admin("PATCH /api/admin/admins/{id}", controllers.AdminUpdateAdmin)

	admin("GET /api/admin/settings", controllers.AdminSettings)
	admin("PUT /api/admin/settings", controllers.AdminSaveSettings)

	admin("GET /api/admin/audit-logs", controllers.AdminAuditLogs)

	// เส้นทางที่ไม่ตรงกับอะไรเลย ตอบ JSON เพื่อให้หน้าเว็บอ่าน error ได้
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		web.Error(w, http.StatusNotFound, "ไม่มีเส้นทาง "+r.Method+" "+r.URL.Path)
	})

	return mux
}
