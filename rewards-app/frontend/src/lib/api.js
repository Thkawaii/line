const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'rewards.token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* บางเบราว์เซอร์ปิด storage ในโหมดส่วนตัว */
  }
};

// ภาษาที่ผู้ใช้เลือก เก็บไว้ที่เดียวกับ i18n อ่านตรงนี้เพื่อให้ api.js ไม่ต้องพึ่ง React
const LANG_KEY = 'rewards.lang';
const currentLang = () => {
  try {
    return localStorage.getItem(LANG_KEY) || 'th';
  } catch {
    return 'th';
  }
};

// ข้อความเดียวที่ api.js พูดเอง นอกนั้นเป็นข้อความจากเซิร์ฟเวอร์
// เก็บไว้ที่นี่แทนที่จะดึงจาก i18n เพราะไฟล์นี้ตั้งใจไม่ให้พึ่ง React
const OFFLINE_MESSAGE = {
  th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ',
  en: 'Could not reach the server',
  ja: 'サーバーに接続できませんでした',
};
const offlineMessage = () => OFFLINE_MESSAGE[currentLang()] || OFFLINE_MESSAGE.th;

const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

/*
  params ต่อท้าย URL ให้เอง จะได้ไม่ต้องประกอบ query string เองทุกที่

  เคยมีบั๊กจากการเรียก request(path, { params }) ตอนที่ตัวนี้ยังไม่รองรับ
  ตัวเลือกที่ไม่รู้จักถูกทิ้งเงียบ ๆ ตัวกรองจึงไม่เคยถูกส่งไปถึงเซิร์ฟเวอร์
  หน้าจอเลยแสดงผลของตัวกรองเริ่มต้นตลอด โดยไม่มีอะไรฟ้องว่าผิด

  ตัวเลือกที่ไม่รู้จักตัวอื่นก็ยังถูกทิ้งเงียบเหมือนเดิม จึงโยนทิ้งไม่ได้
  ต้องบอกให้รู้ตั้งแต่ตอนพัฒนา ไม่ใช่ปล่อยให้ไปเจอเอาตอนใช้งานจริง
*/
async function request(path, { method = 'GET', body, params, ...rest } = {}) {
  const unknown = Object.keys(rest);
  if (unknown.length) {
    throw new Error(`request() ไม่รู้จักตัวเลือก: ${unknown.join(', ')}`);
  }

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api${path}${qs(params)}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || offlineMessage());
    error.status = res.status;
    // แนบเนื้อหาที่เซิร์ฟเวอร์ส่งมาทั้งก้อนไว้ด้วย บางกรณีมีรายละเอียดเกินข้อความเดียว
    // เช่นตอนลงทะเบียนไม่ผ่านเพราะอยู่นอกพื้นที่ จะมีระยะห่างติดมาให้บอกผู้ใช้ได้
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  /* เข้าสู่ระบบ */
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  // เปลี่ยนรหัสผ่านของตัวเอง ต้องกรอกรหัสเดิมมาด้วย
  changePassword: (body) => request('/auth/change-password', { method: 'POST', body }),
  acceptTerms: () => request('/auth/accept-terms', { method: 'POST' }),

  /* ฝั่งพนักงาน */
  home: () => request(`/app/home${qs({ lang: currentLang() })}`),
  points: () => request(`/app/points${qs({ lang: currentLang() })}`),
  pointsHistory: (filter) => request(`/app/points/history${qs({ ...{ filter }, lang: currentLang() })}`),
  events: (params) => request(`/app/events${qs({ ...params, lang: currentLang() })}`),
  // position คือ { lat, lng } ส่งมาเฉพาะกิจกรรมที่ตั้งพื้นที่จัดงานไว้
  registerEvent: (id, optionId, position) =>
    request(`/app/events/${id}/register`, {
      method: 'POST',
      body: { optionId: optionId || 0, ...(position || {}) },
    }),
  rewards: (params) => request(`/app/rewards${qs({ ...params, lang: currentLang() })}`),
  redeem: (id) => request(`/app/rewards/${id}/redeem`, { method: 'POST' }),
  myRewards: (status) => request(`/app/my-rewards${qs({ ...{ status }, lang: currentLang() })}`),
  favorites: (type) => request(`/app/favorites${qs({ ...{ type }, lang: currentLang() })}`),
  toggleFavorite: (type, id) => request('/app/favorites/toggle', { method: 'POST', body: { type, id } }),
  notifications: (category) => request(`/app/notifications${qs({ ...{ category }, lang: currentLang() })}`),
  readAllNotifications: () => request('/app/notifications/read-all', { method: 'POST' }),
  faqs: () => request(`/app/faqs${qs({ lang: currentLang() })}`),
  policy: (key) => request(`/app/policies/${key}${qs({ lang: currentLang() })}`),
  qrToken: () => request(`/app/qr-token${qs({ lang: currentLang() })}`),
  tiers: () => request(`/app/tiers${qs({ lang: currentLang() })}`),
  announcements: () => request(`/app/announcements${qs({ lang: currentLang() })}`),
  pendingFeedback: () => request('/app/feedback/pending'),
  submitFeedback: (id, body) => request(`/app/events/${id}/feedback`, { method: 'POST', body }),
  acknowledgeAnnouncement: (id) =>
    request(`/app/announcements/${id}/acknowledge`, { method: 'POST' }),
  surveys: () => request(`/app/surveys${qs({ lang: currentLang() })}`),
  submitSurvey: (id, body) => request(`/app/surveys/${id}/submit`, { method: 'POST', body }),

  /* ฝั่งแอดมิน */
  adminOverview: () => request('/admin/overview'),
  adminAnalytics: (params) => request(`/admin/analytics${qs(params)}`),
  adminFrequencyPeople: (params) => request(`/admin/analytics/frequency${qs(params)}`),
  adminEmployees: (params) => request(`/admin/employees${qs(params)}`),
  adminEmployee: (id) => request(`/admin/employees/${id}`),
  adminCreateEmployee: (body) => request('/admin/employees', { method: 'POST', body }),
  adminUpdateEmployee: (id, body) => request(`/admin/employees/${id}`, { method: 'PATCH', body }),
  adminDeleteEmployee: (id) => request(`/admin/employees/${id}`, { method: 'DELETE' }),
  adminPoints: (params) => request(`/admin/points${qs(params)}`),
  adminAdjustPoints: (body) => request('/admin/points/adjust', { method: 'POST', body }),

  // คำขอปรับคะแนนที่รออนุมัติ — คะแนนยังไม่ขยับจนกว่าจะครบทั้งฝั่ง GA และ HR
  adminPointRequests: (params) => request('/admin/points/requests', { params }),
  adminDecidePointRequest: (id, body) =>
    request(`/admin/points/requests/${id}/decide`, { method: 'POST', body }),
  adminCancelPointRequest: (id) =>
    request(`/admin/points/requests/${id}/cancel`, { method: 'POST' }),
  adminResetStatus: () => request('/admin/points/reset-status'),
  adminAnnualReset: () => request('/admin/points/annual-reset', { method: 'POST' }),
  adminRewards: () => request('/admin/rewards'),
  adminCreateReward: (body) => request('/admin/rewards', { method: 'POST', body }),
  adminUpdateReward: (id, body) => request(`/admin/rewards/${id}`, { method: 'PATCH', body }),
  // รับทั้งแบบเดิม (ส่งสถานะมาเป็นข้อความ) และแบบใหม่ที่ส่งตัวกรองมาทั้งก้อน
  adminRedemptions: (params) =>
    request(`/admin/redemptions${qs(typeof params === 'string' ? { status: params } : params)}`),
  adminReceiveRedemption: (id) => request(`/admin/redemptions/${id}/receive`, { method: 'POST' }),
  adminRevertRedemption: (id) => request(`/admin/redemptions/${id}/revert`, { method: 'POST' }),
  adminScan: (body) => request('/admin/scan', { method: 'POST', body }),

  // ป็อปอัปแจ้งว่าคะแนนถูกปรับ เด้งครั้งเดียวต่อหนึ่งรายการ
  pointAlerts: () => request('/app/point-alerts'),
  ackPointAlerts: (ids) => request('/app/point-alerts/ack', { method: 'POST', body: { ids } }),

  // QR ของรางวัลที่แลกไว้ มีอายุสั้น หมดแล้วกดขอใหม่ได้
  myRewardQr: (id) => request(`/app/my-rewards/${id}/qr`),
  adminEvents: () => request('/admin/events'),
  adminCreateEvent: (body) => request('/admin/events', { method: 'POST', body }),
  adminUpdateEvent: (id, body) => request(`/admin/events/${id}`, { method: 'PATCH', body }),
  adminEventRegistrations: (id) => request(`/admin/events/${id}/registrations`),
  adminEventFeedback: (id) => request(`/admin/events/${id}/feedback`),
  adminFeedback: ({ year, eventId }) =>
    request(`/admin/feedback${qs({ range: 'custom', year, fromMonth: 1, toMonth: 12, eventId })}`),
  adminCheckIn: (id, employeeCode, allowWalkIn = false) =>
    request(`/admin/events/${id}/check-in`, { method: 'POST', body: { employeeCode, allowWalkIn } }),
  adminNotifications: () => request('/admin/notifications'),
  adminNotificationEvents: () => request('/admin/notification-events'),
  adminUpdateNotificationEvent: (key, body) =>
    request(`/admin/notification-events/${key}`, { method: 'PATCH', body }),

  uploadImage: (data) => request('/admin/uploads', { method: 'POST', body: { data } }),

  adminBanners: () => request('/admin/banners'),
  adminCreateBanner: (body) => request('/admin/banners', { method: 'POST', body }),
  adminUpdateBanner: (id, body) => request(`/admin/banners/${id}`, { method: 'PATCH', body }),
  adminDeleteBanner: (id) => request(`/admin/banners/${id}`, { method: 'DELETE' }),

  adminFaqs: () => request('/admin/faqs'),
  adminCreateFaq: (body) => request('/admin/faqs', { method: 'POST', body }),
  adminUpdateFaq: (id, body) => request(`/admin/faqs/${id}`, { method: 'PATCH', body }),
  adminDeleteFaq: (id) => request(`/admin/faqs/${id}`, { method: 'DELETE' }),

  adminPolicies: () => request('/admin/policies'),
  adminSavePolicy: (key, body) => request(`/admin/policies/${key}`, { method: 'PUT', body }),

  adminTiers: (params) => request(`/admin/tiers${qs(params)}`),
  adminCreateTier: (body) => request('/admin/tiers', { method: 'POST', body }),
  adminDeleteTier: (key) => request(`/admin/tiers/${key}`, { method: 'DELETE' }),
  adminUpdateTier: (key, body) => request(`/admin/tiers/${key}`, { method: 'PATCH', body }),
  adminRecalculateTiers: () => request('/admin/tiers/recalculate', { method: 'POST' }),

  adminAdmins: () => request('/admin/admins'),
  adminCreateAdmin: (body) => request('/admin/admins', { method: 'POST', body }),
  adminUpdateAdmin: (id, body) => request(`/admin/admins/${id}`, { method: 'PATCH', body }),

  adminSettings: () => request('/admin/settings'),
  adminSaveSettings: (values) => request('/admin/settings', { method: 'PUT', body: { values } }),

  adminAuditLogs: (params) => request(`/admin/audit-logs${qs(params)}`),

  /* คำแปลอัตโนมัติ */
  adminOrgOptions: () => request('/admin/org-options'),
  adminUploadDocument: (data, name) =>
    request('/admin/uploads/document', { method: 'POST', body: { data, name } }),

  adminAnnouncements: () => request('/admin/announcements'),
  adminCreateAnnouncement: (body) => request('/admin/announcements', { method: 'POST', body }),
  adminUpdateAnnouncement: (id, body) =>
    request(`/admin/announcements/${id}`, { method: 'PATCH', body }),
  adminDeleteAnnouncement: (id) => request(`/admin/announcements/${id}`, { method: 'DELETE' }),
  adminAnnouncementReaders: (id) => request(`/admin/announcements/${id}/readers`),

  adminTranslations: () => request('/admin/translations'),
  adminTranslationItems: (table) => request(`/admin/translations/items${qs({ table })}`),
  adminRunTranslations: () => request('/admin/translations/run', { method: 'POST' }),
  adminRebuildTranslations: (clearCache) =>
    request('/admin/translations/rebuild', { method: 'POST', body: { clearCache } }),
  adminSaveTranslation: (table, body) =>
    request(`/admin/translations/${table}`, { method: 'PUT', body }),

  /* หัวข้อลงทะเบียน / แบบสำรวจ */
  adminSurveys: () => request('/admin/surveys'),
  adminCreateSurvey: (body) => request('/admin/surveys', { method: 'POST', body }),
  adminUpdateSurvey: (id, body) => request(`/admin/surveys/${id}`, { method: 'PATCH', body }),
  adminDeleteSurvey: (id) => request(`/admin/surveys/${id}`, { method: 'DELETE' }),
  adminSurveySummary: (id) => request(`/admin/surveys/${id}/summary`),
  adminSurveyPending: (id, section) => request(`/admin/surveys/${id}/pending${qs({ section })}`),
  adminSurveyResponses: (id) => request(`/admin/surveys/${id}/responses`),
  adminRemindSurvey: (id, message) =>
    request(`/admin/surveys/${id}/remind`, { method: 'POST', body: { message } }),
  adminCreateNotification: (body) => request('/admin/notifications', { method: 'POST', body }),

  /* ประชาสัมพันธ์ — อ่านข่าว/ดูวิดีโอแล้วได้คะแนน */
  pr: () => request(`/app/pr${qs({ lang: currentLang() })}`),
  prItem: (id) => request(`/app/pr/${id}${qs({ lang: currentLang() })}`),
  prProgress: (id, body) => request(`/app/pr/${id}/progress`, { method: 'POST', body }),
  prClaim: (id) => request(`/app/pr/${id}/claim`, { method: 'POST' }),

  adminPr: () => request('/admin/pr'),
  adminCreatePr: (body) => request('/admin/pr', { method: 'POST', body }),
  adminUpdatePr: (id, body) => request(`/admin/pr/${id}`, { method: 'PATCH', body }),
  adminDeletePr: (id) => request(`/admin/pr/${id}`, { method: 'DELETE' }),
  adminPrHistory: (params) => request('/admin/pr/history', { params }),

  /*
    อัปโหลดวิดีโอส่งเป็น multipart ไม่ใช่ JSON แบบที่อื่น

    รูปกับ PDF ส่งเป็น data URL ได้เพราะไฟล์เล็ก แต่ base64 ทำให้ข้อมูลใหญ่ขึ้น
    ราวหนึ่งในสาม และต้องแปลงทั้งไฟล์เป็นสตริงก่อนส่ง คลิปหลายสิบเมกะไบต์
    จะกินหน่วยความจำของเบราว์เซอร์จนแท็บค้างก่อนจะได้ส่งด้วยซ้ำ

    onProgress ใช้ XMLHttpRequest เพราะ fetch ยังบอกความคืบหน้าตอนอัปโหลดไม่ได้
    และการอัปคลิปใหญ่โดยไม่มีอะไรขยับเลยคือสิ่งที่ทำให้คนกดซ้ำหรือปิดหน้าไปเลย
  */
  adminUploadVideo: (file, onProgress) =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/api/admin/uploads/video`);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          /* เซิร์ฟเวอร์ตอบไม่ใช่ JSON ใช้ข้อความตามสถานะแทน */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `อัปโหลดไม่สำเร็จ (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'));
      xhr.send(form);
    }),
};
