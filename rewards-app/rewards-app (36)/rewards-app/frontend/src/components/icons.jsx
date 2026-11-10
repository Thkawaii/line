const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const Svg = ({ size = 22, children, ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...base} {...rest}>
    {children}
  </svg>
);

export const Icon = {
  Home: (p) => (
    <Svg {...p}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1Z" />
    </Svg>
  ),
  Calendar: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" />
    </Svg>
  ),
  Gift: (p) => (
    <Svg {...p}>
      <path d="M3.5 11h17v8.5a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5Z" />
      <path d="M2.8 7.5h18.4v3.5H2.8zM12 7.5V20" />
      <path d="M12 7.5S10.8 4 8.8 4a2 2 0 0 0 0 3.5Zm0 0S13.2 4 15.2 4a2 2 0 0 1 0 3.5Z" />
    </Svg>
  ),
  User: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.3-3.2 4-4.8 7-4.8s5.7 1.6 7 4.8" />
    </Svg>
  ),
  Qr: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" />
      <path d="M14 14h3v3h-3zM20.5 14v3M17.5 20.5h3M14 20.5h.01" />
    </Svg>
  ),
  Scan: (p) => (
    <Svg {...p}>
      <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5M4 12h16" />
    </Svg>
  ),
  Bell: (p) => (
    <Svg {...p}>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.2.8 4.7 1.5 5.5H5c.7-.8 1.5-2.3 1.5-5.5Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </Svg>
  ),
  Heart: ({ filled, ...p }) => (
    <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
      <path d="M12 20s-7.5-4.4-7.5-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.7C19.5 15.6 12 20 12 20Z" />
    </Svg>
  ),
  // ดาวมีประกาย ใช้กับระดับกลาง ตามไอคอนในไฟล์ออกแบบ
  // ตัวดาวกินพื้นที่เกือบเต็มกรอบเพื่อให้เห็นชัดในวงกลมเล็ก ประกายวางมุมบนซ้ายและล่างขวา
  StarSparkle: ({ filled = true, ...p }) => (
    <Svg {...p} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.3}>
      <path d="m12 5.6 2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 18.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85Z" />
      <path d="M4.5 2.3 5.1 4l1.7.6-1.7.6-.6 1.7-.6-1.7L2.2 4.6 3.9 4Z" />
      <path d="M20 15.6l.45 1.25 1.25.45-1.25.45L20 19l-.45-1.25-1.25-.45 1.25-.45Z" />
    </Svg>
  ),
  // มงกุฎสามยอดพร้อมเม็ดพลอย ใช้กับระดับสูงสุด
  Crown: ({ filled = true, ...p }) => (
    <Svg {...p} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.2}>
      <path d="M3.4 17 2 7.9l5 3.9L12 4.6l5 7.2 5-3.9-1.4 9.1Z" />
      <circle cx="2.1" cy="6.3" r="1.5" />
      <circle cx="12" cy="3.2" r="1.7" />
      <circle cx="21.9" cy="6.3" r="1.5" />
      <path d="M4.3 20.2h15.4" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  ),
  // เครื่องหมายถูกในวงกลม ใช้กับรายการสิทธิประโยชน์
  CheckCircle: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
    </Svg>
  ),
  Star: ({ filled = true, ...p }) => (
    <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 4 2.3 4.9 5.2.7-3.8 3.7.9 5.3L12 16.1l-4.6 2.5.9-5.3L4.5 9.6l5.2-.7Z" />
    </Svg>
  ),
  Back: (p) => (
    <Svg {...p}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  ),
  Next: (p) => (
    <Svg {...p}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  ),
  Close: (p) => (
    <Svg {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  ),
  Search: (p) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </Svg>
  ),
  Clock: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  ),
  Pin: (p) => (
    <Svg {...p}>
      <path d="M12 21s6-5.1 6-9.4A6 6 0 0 0 6 11.6C6 15.9 12 21 12 21Z" />
      <circle cx="12" cy="11.3" r="2.2" />
    </Svg>
  ),
  Refresh: (p) => (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4" />
    </Svg>
  ),
  Copy: (p) => (
    <Svg {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </Svg>
  ),
  Check: (p) => (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  Chevron: (p) => (
    <Svg {...p}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  ),
  ChevronUp: (p) => (
    <Svg {...p}>
      <path d="m6 14.5 6-6 6 6" />
    </Svg>
  ),
  Printer: (p) => (
    <Svg {...p}>
      <path d="M7 9V4h10v5" />
      <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M7 14h10v6H7z" />
    </Svg>
  ),
  Grid: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </Svg>
  ),
  Users: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 19c1-2.8 3.3-4.3 6-4.3s5 1.5 6 4.3" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M18 19c-.3-1.3-.8-2.4-1.5-3.3" />
    </Svg>
  ),
  History: (p) => (
    <Svg {...p}>
      <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4h4" />
      <path d="M12 8v4.3l2.8 1.7" />
    </Svg>
  ),
  Megaphone: (p) => (
    <Svg {...p}>
      <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l9 4.5V6L7 10.5H5.5A1.5 1.5 0 0 0 4 12Z" />
      <path d="M7 15v3.5a1.5 1.5 0 0 0 3 0V16" />
    </Svg>
  ),
  Settings: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" />
    </Svg>
  ),
  Wallet: (p) => (
    <Svg {...p}>
      <rect x="3.5" y="6" width="17" height="13" rx="2.5" />
      <path d="M3.5 10h17M16 14.5h1.5" />
    </Svg>
  ),
  Box: (p) => (
    <Svg {...p}>
      <path d="M4 8.5 12 5l8 3.5v7L12 19l-8-3.5Z" />
      <path d="M4 8.5 12 12l8-3.5M12 12v7" />
    </Svg>
  ),
  Warning: (p) => (
    <Svg {...p}>
      <path d="M12 4.5 21 19H3Z" />
      <path d="M12 10v3.5M12 16.2h.01" />
    </Svg>
  ),
  Alert: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5M12 15.6h.01" />
    </Svg>
  ),
  Export: (p) => (
    <Svg {...p}>
      <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" />
      <path d="M4.5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V14" />
    </Svg>
  ),
  Import: (p) => (
    <Svg {...p}>
      <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" />
      <path d="M4.5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V14" />
    </Svg>
  ),
  Plus: (p) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  Globe: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2 2.4 3 5 3 8s-1 5.6-3 8c-2-2.4-3-5-3-8s1-5.6 3-8Z" />
    </Svg>
  ),
  Logout: (p) => (
    <Svg {...p}>
      <path d="M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 15.5 13.5 12 10 8.5M13 12H4" />
    </Svg>
  ),
  Eye: ({ off, ...p }) =>
    off ? (
      <Svg {...p}>
        <path d="M4 4l16 16M9.9 5.4A8.6 8.6 0 0 1 12 5c5 0 8 5.2 8 5.2a14 14 0 0 1-2.6 3.3M6.6 7.3A13.7 13.7 0 0 0 4 10.2S7 15.4 12 15.4c.9 0 1.7-.2 2.5-.5" />
      </Svg>
    ) : (
      <Svg {...p}>
        <path d="M4 12s3-5.2 8-5.2S20 12 20 12s-3 5.2-8 5.2S4 12 4 12Z" />
        <circle cx="12" cy="12" r="2.4" />
      </Svg>
    ),
  Lock: (p) => (
    <Svg {...p}>
      <rect x="5" y="10.5" width="14" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 1 1 7 0v2.5" />
    </Svg>
  ),
  Ticket: (p) => (
    <Svg {...p}>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z" />
      <path d="M12 7v10" strokeDasharray="2 2.5" />
    </Svg>
  ),
  Vote: (p) => (
    <Svg {...p}>
      <path d="M5 14.5 12 11l7 3.5-7 3.5Z" />
      <path d="M8.5 12.8V8.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4.3" />
    </Svg>
  ),
  Bag: (p) => (
    <Svg {...p}>
      <path d="M5.5 8h13l-1 11.5h-11Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </Svg>
  ),
  Hourglass: (p) => (
    <Svg {...p}>
      <path d="M7 4h10M7 20h10M8 4c0 4 4 5 4 8s-4 4-4 8M16 4c0 4-4 5-4 8s4 4 4 8" />
    </Svg>
  ),
};
