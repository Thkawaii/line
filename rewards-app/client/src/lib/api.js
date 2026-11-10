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

const qs = (params = {}) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

async function request(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  /* เข้าสู่ระบบ */
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  acceptTerms: () => request('/auth/accept-terms', { method: 'POST' }),

  /* ฝั่งพนักงาน */
  home: () => request('/app/home'),
  points: () => request('/app/points'),
  pointsHistory: (filter) => request(`/app/points/history${qs({ filter })}`),
  events: (params) => request(`/app/events${qs(params)}`),
  registerEvent: (id) => request(`/app/events/${id}/register`, { method: 'POST' }),
  rewards: (params) => request(`/app/rewards${qs(params)}`),
  redeem: (id) => request(`/app/rewards/${id}/redeem`, { method: 'POST' }),
  myRewards: (status) => request(`/app/my-rewards${qs({ status })}`),
  favorites: (type) => request(`/app/favorites${qs({ type })}`),
  toggleFavorite: (type, id) => request('/app/favorites/toggle', { method: 'POST', body: { type, id } }),
  notifications: (category) => request(`/app/notifications${qs({ category })}`),
  readAllNotifications: () => request('/app/notifications/read-all', { method: 'POST' }),
  faqs: () => request('/app/faqs'),
  policy: (key) => request(`/app/policies/${key}`),
  qrToken: () => request('/app/qr-token'),
  tiers: () => request('/app/tiers'),

  /* ฝั่งแอดมิน */
  adminOverview: () => request('/admin/overview'),
  adminAnalytics: () => request('/admin/analytics'),
  adminEmployees: (params) => request(`/admin/employees${qs(params)}`),
  adminEmployee: (id) => request(`/admin/employees/${id}`),
  adminCreateEmployee: (body) => request('/admin/employees', { method: 'POST', body }),
  adminUpdateEmployee: (id, body) => request(`/admin/employees/${id}`, { method: 'PATCH', body }),
  adminPoints: (params) => request(`/admin/points${qs(params)}`),
  adminAdjustPoints: (body) => request('/admin/points/adjust', { method: 'POST', body }),
  adminRewards: () => request('/admin/rewards'),
  adminCreateReward: (body) => request('/admin/rewards', { method: 'POST', body }),
  adminUpdateReward: (id, body) => request(`/admin/rewards/${id}`, { method: 'PATCH', body }),
  adminRedemptions: (status) => request(`/admin/redemptions${qs({ status })}`),
  adminReceiveRedemption: (id) => request(`/admin/redemptions/${id}/receive`, { method: 'POST' }),
  adminEvents: () => request('/admin/events'),
  adminCreateEvent: (body) => request('/admin/events', { method: 'POST', body }),
  adminUpdateEvent: (id, body) => request(`/admin/events/${id}`, { method: 'PATCH', body }),
  adminCheckIn: (id, employeeCode) =>
    request(`/admin/events/${id}/check-in`, { method: 'POST', body: { employeeCode } }),
  adminNotifications: () => request('/admin/notifications'),
  adminNotificationEvents: () => request('/admin/notification-events'),
  adminUpdateNotificationEvent: (key, body) =>
    request(`/admin/notification-events/${key}`, { method: 'PATCH', body }),

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

  adminTiers: () => request('/admin/tiers'),
  adminUpdateTier: (key, body) => request(`/admin/tiers/${key}`, { method: 'PATCH', body }),
  adminRecalculateTiers: () => request('/admin/tiers/recalculate', { method: 'POST' }),

  adminAdmins: () => request('/admin/admins'),
  adminCreateAdmin: (body) => request('/admin/admins', { method: 'POST', body }),
  adminUpdateAdmin: (id, body) => request(`/admin/admins/${id}`, { method: 'PATCH', body }),

  adminSettings: () => request('/admin/settings'),
  adminSaveSettings: (values) => request('/admin/settings', { method: 'PUT', body: { values } }),

  adminAuditLogs: (params) => request(`/admin/audit-logs${qs(params)}`),
  adminCreateNotification: (body) => request('/admin/notifications', { method: 'POST', body }),
};
