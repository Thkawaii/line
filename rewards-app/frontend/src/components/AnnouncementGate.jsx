import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useEmployeeArea } from '../lib/useEmployeeArea';
import { useLanguage } from '../lib/i18n';
import { Icon } from './icons';
import { ImagePlaceholder } from './ui';
import { dateTime } from '../lib/format';

/**
 * ประกาศข่าวสารที่ต้องอ่านก่อนใช้งาน
 *
 * พนักงานเข้าระบบมาแล้วถ้ามีประกาศที่ยังไม่ได้กดรับทราบ จะถูกแสดงทันที
 * ปุ่ม "รับทราบข้อมูลข่าวสาร" จะกดได้ก็ต่อเมื่อเลื่อนอ่านลงมาจนสุดแล้วเท่านั้น
 *
 * ทำไมต้องเช็กการเลื่อน: เจตนาคือให้พนักงานได้เห็นเนื้อหาทั้งหมดจริง ๆ
 * ไม่ใช่กดผ่านไปเฉย ๆ ระบบจึงเก็บไว้เป็นหลักฐานได้ว่าแจ้งแล้วและเขาอ่านแล้ว
 *
 * มีประกาศค้างหลายฉบับก็แสดงทีละฉบับเรียงจากเก่าไปใหม่
 */
export default function AnnouncementGate() {
  const { user } = useAuth();
  const inEmployeeArea = useEmployeeArea();
  const { lang, t } = useLanguage();

  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [atBottom, setAtBottom] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  // แสดงเฉพาะพนักงานที่ยอมรับ PDPA แล้ว
  // ผู้ดูแลระบบและฝ่ายธุรการไม่ต้องเจอ เพราะเป็นคนออกประกาศเอง
  // เฉพาะฝั่งพนักงานเท่านั้น ไม่เด้งทับหน้าผู้ดูแลระบบ
  const active = inEmployeeArea && user?.role === 'user' && !!user?.terms_accepted_at;

  useEffect(() => {
    if (!active) {
      setQueue([]);
      return;
    }
    api
      .announcements()
      .then(({ announcements }) => {
        setQueue(announcements);
        setIndex(0);
      })
      .catch(() => setQueue([]));
  }, [active, lang]);

  const current = queue[index];

  /**
   * ตรวจว่าเลื่อนถึงล่างสุดหรือยัง
   *
   * เผื่อไว้ 4 พิกเซล เพราะความสูงที่เบราว์เซอร์คำนวณมีเศษทศนิยม
   * บางเครื่องจึงเลื่อนสุดแล้วแต่ตัวเลขยังขาดไปไม่ถึงหนึ่งพิกเซล
   *
   * ถ้าเนื้อหาสั้นจนไม่มีอะไรให้เลื่อน ถือว่าอ่านครบแล้วทันที
   * ไม่งั้นปุ่มจะกดไม่ได้ตลอดกาลและผู้ใช้จะติดอยู่ในหน้านี้
   */
  const checkBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    const reached = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
    setAtBottom(reached || node.scrollHeight <= node.clientHeight);
  }, []);

  // เปลี่ยนฉบับแล้วต้องเลื่อนกลับขึ้นบนและคำนวณใหม่
  useEffect(() => {
    if (!current) return;
    setAtBottom(false);
    const node = scrollRef.current;
    if (node) node.scrollTop = 0;
    // รอให้เนื้อหาวาดเสร็จก่อนวัดความสูง ไม่งั้นได้ค่าของฉบับก่อนหน้า
    const timer = setTimeout(checkBottom, 60);
    return () => clearTimeout(timer);
  }, [current, checkBottom]);

  // รูปในประกาศโหลดเสร็จทีหลัง ความสูงจึงเปลี่ยน ต้องวัดใหม่
  useEffect(() => {
    if (!current) return;
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(checkBottom);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => observer.disconnect();
  }, [current, checkBottom]);

  if (!active || !current) return null;

  async function acknowledge() {
    setBusy(true);
    try {
      await api.acknowledgeAnnouncement(current.id);
      if (index + 1 < queue.length) setIndex(index + 1);
      else setQueue([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    /*
      จัดกลางทั้งแนวตั้งและแนวนอนทุกขนาดจอ

      เดิมบนมือถือเป็นแผ่นเลื่อนขึ้นจากขอบล่าง ซึ่งเหมาะกับเมนูหรือตัวเลือกสั้น ๆ
      แต่ประกาศมีทั้งแบบสั้นและแบบยาว ประกาศสั้นจะไปกองอยู่ติดขอบล่างจอ
      เหลือพื้นที่ว่างโล่งข้างบน ดูเหมือนป็อปอัปโฆษณามากกว่าประกาศทางการ

      จัดกลางแล้วประกาศสั้นลอยอยู่กลางจอเหมือนป้ายประกาศ ส่วนประกาศยาว
      ยังขยายเต็มความสูงที่กำหนดไว้เหมือนเดิม จึงได้ทั้งสองแบบ
    */
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-4">
      <div className="flex max-h-[88dvh] w-full max-w-mobile flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
        {/* หัวประกาศเป็นแถบสีเข้ม แยกตัวเองออกจากหน้าจอปกติอย่างชัดเจน
            ผู้ใช้จะได้รู้ตั้งแต่แวบแรกว่านี่คือประกาศทางการ ไม่ใช่ป็อปอัปโฆษณา */}
        <header className="shrink-0 bg-gradient-to-br from-primary to-[#0B7E82] px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/20 px-2.5 py-1 text-2xs font-semibold">
              <Icon.Megaphone size={14} />
              {t('news.badge')}
            </span>

            {queue.length > 1 && (
              <span className="text-2xs text-white/80">
                {t('news.counter', { index: index + 1, total: queue.length })}
              </span>
            )}
          </div>

          <h2 className="mt-2.5 text-lg font-bold leading-snug">{current.title}</h2>
        </header>

        <div
          ref={scrollRef}
          onScroll={checkBottom}
          className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        >
          {current.image_url && (
            <ImagePlaceholder
              src={current.image_url}
              alt=""
              className="mb-4 aspect-[16/9] w-full rounded-card"
            />
          )}

          <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate">
            {current.body}
          </p>

          {/* ลิงก์และไฟล์แนบ วางไว้ท้ายเนื้อหาเพราะผู้ใช้ต้องอ่านก่อนแล้วค่อยไปทำต่อ
              เปิดแท็บใหม่เสมอ กดแล้วจะได้ไม่หลุดจากประกาศที่ยังกดรับทราบไม่เสร็จ */}
          {(current.link_url || current.file_url) && (
            <div className="mt-5 space-y-2">
              {current.link_url && (
                <a
                  href={current.link_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-card border border-primary bg-primary-wash px-4 py-3 transition-colors hover:bg-primary/10"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-white">
                    <Icon.Globe size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-primary-dark">
                      {current.link_label || t('news.openLink')}
                    </span>
                    <span className="block truncate text-2xs text-muted">{current.link_url}</span>
                  </span>
                  <span className="shrink-0 text-primary">
                    <Icon.Next size={18} />
                  </span>
                </a>
              )}

              {current.file_url && (
                <a
                  href={current.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-card border border-line px-4 py-3 transition-colors hover:bg-page"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
                    <Icon.Box size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">
                      {current.file_name || t('news.openFile')}
                    </span>
                    <span className="block text-2xs text-muted">PDF</span>
                  </span>
                  <span className="shrink-0 text-muted">
                    <Icon.Next size={18} />
                  </span>
                </a>
              )}
            </div>
          )}

          <p className="mt-6 text-2xs text-muted">
            {t('news.publishedAt', { date: dateTime(current.created_at) })}
          </p>

          {/* เส้นปิดท้าย ช่วยให้ผู้ใช้รู้ว่าอ่านจบแล้วจริง ๆ ไม่ใช่เนื้อหาโหลดไม่ครบ */}
          <p className="mt-4 border-t border-line pt-4 text-center text-2xs text-muted">
            {t('news.endOfContent')}
          </p>
        </div>

        <footer className="shrink-0 border-t border-line px-5 py-4">
          <button
            onClick={acknowledge}
            disabled={!atBottom || busy}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('common.processing') : t('news.acknowledge')}
          </button>
        </footer>
      </div>
    </div>
  );
}
