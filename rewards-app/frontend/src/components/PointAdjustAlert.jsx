import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useEmployeeArea } from '../lib/useEmployeeArea';
import { useT } from '../lib/i18n';
import { dateTime, num } from '../lib/format';
import { Icon } from './icons';
import { SpecialPointIcon } from './SpecialPoints';

/*
ป็อปอัปแจ้งพนักงานว่าคะแนนถูกปรับ

คะแนนที่ถูกปรับด้วยมือเปลี่ยนไปโดยที่เจ้าตัวไม่ได้ทำอะไร ต่างจากคะแนนจากกิจกรรม
ที่พนักงานรู้ตัวอยู่แล้วว่าไปร่วมงานมา ถ้าไม่บอก คนที่เห็นคะแนนหายไปเฉย ๆ
จะเข้าใจว่าระบบคำนวณผิด

บอกให้ครบว่าเกิดอะไรขึ้น ไม่ใช่แค่ตัวเลข
	ปรับเท่าไหร่ · รายการอะไร · เพราะอะไร · ใครอนุมัติ

เรื่องเงินและคะแนนเป็นเรื่องที่คนอยากรู้ที่มา การบอกครึ่งเดียวสร้างคำถามมากกว่าคำตอบ

ตั้งใจไม่มีปุ่มกากบาทและปิดด้วยการกดพื้นหลังไม่ได้ ต้องกดรับทราบเท่านั้น
เพราะเป็นข้อมูลที่พนักงานควรได้อ่านจริง ๆ อย่างน้อยหนึ่งครั้ง
*/
function AlertModal({ alert, index, total, onAck }) {
  const navigate = useNavigate();
  const t = useT();

  // ล็อกการเลื่อนหน้าหลังไว้ระหว่างเปิด ไม่งั้นเลื่อนทะลุไปโดนเนื้อหาข้างหลัง
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const added = alert.points > 0;
  const special = alert.point_kind === 'special';
  const approvers = Array.isArray(alert.approvers) ? alert.approvers : [];

  /*
    หัวกล่องใช้สีหลักของแบรนด์ (#00ADB0) ทั้งกรณีเพิ่มและกรณีลด

    เดิมเพิ่มเป็นเขียว ลดเป็นส้ม ซึ่งทำให้ป็อปอัปใบนี้เป็นหน้าจอเดียวในแอป
    ที่ไม่มีสีแบรนด์อยู่เลย และสีส้มเต็มหัวกล่องทำให้การแก้ตัวเลขที่จ่ายซ้ำ
    ดูเหมือนการถูกลงโทษ ทั้งที่ส่วนใหญ่เป็นแค่การแก้ให้ถูก

    ทิศทางของคะแนนไม่ได้หายไป ยังบอกด้วยเครื่องหมาย + − ตัวใหญ่กลางกล่อง
    ป้ายใต้ตัวเลข และข้อความ ซึ่งอ่านชัดกว่าการจำว่าสีไหนแปลว่าอะไร
  */
  const tone = added
    ? { chip: 'bg-primary-wash text-primary-dark', pill: 'bg-white/20 text-white' }
    : { chip: 'bg-gold-wash text-gold-ink', pill: 'bg-gold/90 text-white' };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-5"
      style={{ animation: 'levelup-fade .25s ease-out' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('pointAlert.title')}
    >
      <div
        className="max-h-[88vh] w-full max-w-[340px] overflow-y-auto overflow-x-hidden rounded-[28px] bg-white shadow-pop"
        style={{ animation: 'levelup-pop .45s cubic-bezier(.34,1.56,.64,1)' }}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-dark px-6 pb-8 pt-7 text-center">
          <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/15" />
          <span className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full border border-white/15" />

          <span className="relative inline-flex items-center gap-1.5 rounded-pill border border-white/40 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
            <Icon.Wallet size={12} />
            {t('pointAlert.badge')}
          </span>

          <div className="relative mx-auto mt-6 h-20 w-20">
            <span
              className="absolute inset-0 rounded-full border border-white/25"
              style={{ animation: 'levelup-glow 2.6s ease-in-out infinite' }}
            />
            <span className="absolute inset-2 grid place-items-center rounded-full bg-white text-primary">
              {special ? <SpecialPointIcon size={34} /> : <Icon.Wallet size={30} />}
            </span>
          </div>

          <p className="relative mt-4 text-[34px] font-bold leading-none text-white">
            {added ? '+' : '−'}
            {num(Math.abs(alert.points))}
          </p>
          {/* ป้ายใต้ตัวเลขรับหน้าที่บอกทิศทางแทนสีหัวกล่อง
              กรณีลดใช้พื้นส้มเฉพาะป้ายเล็ก ๆ ใบนี้ สะดุดตาพอให้สังเกต
              แต่ไม่ทำให้ทั้งหน้าจอดูเหมือนการแจ้งเตือนความผิด */}
          <span
            className={`relative mt-2 inline-block rounded-pill px-3 py-1 text-2xs font-semibold ${tone.pill}`}
          >
            {special ? t('points.special') : t('common.points')}
          </span>
        </div>

        <div className="px-6 pb-6 pt-5">
          <p className="text-center font-bold leading-snug text-ink">
            {added ? t('pointAlert.added') : t('pointAlert.deducted')}
          </p>

          <div className="mt-3 rounded-card bg-page px-3.5 py-3">
            <p className="text-2xs text-muted">{t('pointAlert.item')}</p>
            <p className="mt-0.5 font-semibold leading-snug text-ink">{alert.title}</p>

            <p className="mt-2.5 text-2xs text-muted">{t('pointAlert.reason')}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate">{alert.reason}</p>
          </div>

          {/* บอกชื่อคนอนุมัติ ไม่ใช่แค่ว่า "ระบบปรับให้"
              พนักงานที่สงสัยจะได้รู้ว่าเดินไปถามใครได้ */}
          {approvers.length > 0 && (
            <div className="mt-3">
              <p className="text-2xs text-muted">{t('pointAlert.approvedBy')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {approvers.map((a, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold ${tone.chip}`}
                  >
                    <Icon.Check size={12} />
                    {a.name}
                    <span className="font-normal opacity-70">{a.group}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mt-3 text-center text-2xs text-muted">{dateTime(alert.created_at)}</p>

          <button onClick={onAck} className="btn-primary mt-4 w-full">
            {total > 1 ? t('pointAlert.next', { n: index + 1, total }) : t('pointAlert.ok')}
          </button>

          <button
            onClick={() => {
              onAck();
              navigate('/points/history');
            }}
            className="mt-2 w-full py-1.5 text-sm font-semibold text-primary"
          >
            {t('pointAlert.seeHistory')}
          </button>
        </div>
      </div>
    </div>
  );
}

/*
PointAdjustAlertWatcher ตรวจว่ามีรายการที่ยังไม่ได้กดรับทราบไหม

เช็กทุกครั้งที่เปลี่ยนหน้าในฝั่งพนักงานและตอนสลับกลับมาที่แท็บนี้
เผื่อผู้อนุมัติเพิ่งกดอนุมัติระหว่างที่พนักงานเปิดแอปค้างอยู่
จะได้ไม่ต้องออกจากระบบแล้วเข้าใหม่

ตัวจำว่าเห็นแล้วอยู่ที่ฐานข้อมูล ไม่ใช่ที่เครื่อง เปลี่ยนเครื่องหรือล้างแคช
จึงไม่โดนเด้งซ้ำเรื่องเดิม (ต่างจากป็อปอัปเลื่อนระดับที่จำไว้ที่เครื่อง
เพราะระดับสมาชิกอ่านจากสถานะปัจจุบันได้ ไม่ต้องมีรายการให้ตามทีละใบ)
*/
export default function PointAdjustAlertWatcher() {
  const { user } = useAuth();
  const location = useLocation();
  const inEmployeeArea = useEmployeeArea();
  const [queue, setQueue] = useState([]);
  const checkingRef = useRef(false);

  const check = useCallback(() => {
    // ไม่เด้งในหน้าผู้ดูแลระบบ พนักงานแผนกหลังบ้านมี role เป็น user แต่เข้าหน้านั้นได้
    if (!inEmployeeArea) return;
    if (!user || user.role === 'admin' || !user.terms_accepted_at || checkingRef.current) return;
    checkingRef.current = true;

    api
      .pointAlerts()
      .then(({ alerts }) => {
        if (alerts?.length) setQueue((prev) => (prev.length ? prev : alerts));
      })
      .catch(() => {
        /* เช็กไม่สำเร็จก็แค่ไม่เด้งรอบนี้ ไม่กระทบการใช้งานหน้าอื่น */
      })
      .finally(() => {
        checkingRef.current = false;
      });
  }, [user, inEmployeeArea]);

  useEffect(() => {
    check();
  }, [check, location.pathname]);

  useEffect(() => {
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [check]);

  /*
    ซ่อนเฉย ๆ ตอนอยู่ฝั่งผู้ดูแลระบบ ไม่ล้างคิวทิ้ง

    ถ้าเริ่มดึงข้อมูลตอนอยู่ฝั่งพนักงานแล้วผู้ใช้กดเข้าหน้าผู้ดูแลก่อนผลจะกลับมา
    ป็อปอัปจะไปโผล่ผิดที่ พอกลับมาฝั่งพนักงานจะได้เห็นเหมือนเดิมเพราะยังไม่ได้กดรับทราบ
  */
  if (!inEmployeeArea || !queue.length) return null;

  const [current, ...rest] = queue;

  return (
    <AlertModal
      alert={current}
      index={queue.length - rest.length - 1}
      total={queue.length}
      onAck={() => {
        // บันทึกทีละใบตอนกด ปิดแอปกลางคันแล้วใบที่เหลือยังเด้งต่อรอบหน้า
        api.ackPointAlerts([current.id]).catch(() => {});
        setQueue(rest);
      }}
    />
  );
}
