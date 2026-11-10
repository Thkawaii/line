import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useT } from '../lib/i18n';
import { Icon } from './icons';
import { tierCard, tierIcon } from '../lib/tier';

const STORAGE_PREFIX = 'rewards.seenTier.';

function readSeenTier(userId) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId);
  } catch {
    return null;
  }
}

function writeSeenTier(userId, tierKey) {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, tierKey);
  } catch {
    /* เก็บไม่ได้ก็ปล่อยไป เช่นโหมดส่วนตัวของเบราว์เซอร์ที่ปิด storage */
  }
}

// วงกลมตรงกลางป็อปอัป สีทึบตัดกับพื้นไล่สีของการ์ด (ตรงข้ามกับ tierCircle ที่ใช้โปร่งแสง)
const BADGE_CIRCLE = {
  slate: 'bg-white text-[#8A9494]',
  sky: 'bg-white text-primary',
  gold: 'bg-gradient-to-br from-gold to-[#FFC247] text-[#5B3900]',
};

/**
 * ป็อปอัปฉลองการเลื่อนระดับสมาชิก
 *
 * ตั้งใจไม่ให้มีปุ่มกากบาทและไม่ปิดเมื่อกดพื้นหลังหรือกด Esc
 * เพราะอยากให้พนักงานเห็นข่าวดีนี้แน่ๆ อย่างน้อยหนึ่งครั้ง ต้องกดปุ่มใดปุ่มหนึ่งด้านล่างเท่านั้นจึงจะปิดได้
 */
function LevelUpModal({ tier, onDismiss }) {
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const theme = tierCard(tier.color);
  const TierIcon = tierIcon(tier.color);
  const badgeCircle = BADGE_CIRCLE[tier.color] || BADGE_CIRCLE.slate;
  const tierName = tier.name || tier.key;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-5"
      style={{ animation: 'levelup-fade .25s ease-out' }}
      role="dialog"
      aria-modal="true"
      aria-label={t('levelUp.congrats')}
    >
      <div
        className="w-full max-w-[340px] overflow-hidden rounded-[28px] bg-white shadow-pop"
        style={{ animation: 'levelup-pop .45s cubic-bezier(.34,1.56,.64,1)' }}
      >
        {/* ส่วนบน ไล่สีตามธีมของระดับ (ใช้ธีมเดียวกับการ์ดระดับสมาชิกหน้าอื่น ๆ ในแอป) */}
        <div className={`relative overflow-hidden px-6 pb-10 pt-7 text-center ${theme.surface}`}>
          <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/10" />
          <span className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full border border-white/10" />

          <span
            className={`relative inline-flex items-center gap-1.5 rounded-pill border border-current/40 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${theme.link}`}
          >
            <Icon.Gift size={12} />
            {t('levelUp.badge')}
          </span>

          <div className="relative mx-auto mt-7 h-24 w-24">
            <span
              className="absolute inset-0 rounded-full border border-white/25"
              style={{ animation: 'levelup-glow 2.6s ease-in-out infinite' }}
            />
            <span className="absolute inset-2.5 rounded-full border border-white/20" />
            <span
              className={`absolute inset-[18px] grid place-items-center rounded-full shadow-[0_10px_24px_-6px_rgba(0,0,0,.45)] ${badgeCircle}`}
            >
              <TierIcon size={32} />
            </span>
            <span
              className="absolute -right-1 top-0 text-white/85"
              style={{ animation: 'levelup-sparkle 2.2s ease-in-out infinite' }}
            >
              <Icon.StarSparkle size={16} />
            </span>
            <span
              className="absolute -left-1.5 bottom-2 text-white/60"
              style={{ animation: 'levelup-sparkle 2.2s ease-in-out .5s infinite' }}
            >
              <Icon.StarSparkle size={11} />
            </span>
          </div>

          <p className={`mt-5 text-sm ${theme.muted}`}>{t('levelUp.unlocked')}</p>
          <p className={`mt-1 text-[27px] font-extrabold leading-tight ${theme.title}`}>
            {t('levelUp.congrats')}
          </p>
          <p className={`mt-1 text-[15px] ${theme.muted}`}>{t('levelUp.movedTo', { tier: tierName })}</p>

          <span className={`mt-5 inline-flex items-center gap-2 rounded-pill px-5 py-2 text-sm font-bold ${theme.badge}`}>
            <TierIcon size={16} />
            {tierName}
          </span>
        </div>

        {/* ส่วนล่าง พื้นขาว ปุ่มปิดป็อปอัป */}
        <div className="px-6 pb-7 pt-6 text-center">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate">
            {t('levelUp.rewardsWaiting')}
          </p>

          <button
            type="button"
            onClick={() => {
              onDismiss();
              navigate('/membership');
            }}
            className="mt-5 flex w-full items-center justify-center gap-1 rounded-pill bg-ink py-3.5 text-[15px] font-bold text-white transition hover:bg-ink/90"
          >
            {t('levelUp.viewBenefits')} <Icon.Next size={16} />
          </button>

          <button
            type="button"
            onClick={onDismiss}
            className="mt-4 text-sm font-medium text-muted transition hover:text-slate"
          >
            {t('levelUp.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * เฝ้าดูการเลื่อนระดับสมาชิกของพนักงานที่ล็อกอินอยู่
 *
 * เทียบระดับปัจจุบันกับระดับล่าสุดที่เครื่องนี้เคยเห็น (เก็บไว้ใน localStorage ต่อผู้ใช้หนึ่งคน)
 * ถ้าระดับสูงขึ้นกว่าที่เคยเห็น (เทียบจากลำดับ min_points ของระดับ ไม่ใช่ชื่อ เผื่อแอดมินแก้ชื่อระดับ)
 * จะเด้งป็อปอัปฉลองขึ้นมาหนึ่งครั้ง และจำว่าเห็นแล้วก็ต่อเมื่อพนักงานกดปุ่มปิดจริง ๆ
 *
 * ยังไม่เคยบันทึกไว้บนเครื่องนี้เลย (เข้าแอปครั้งแรก) นับว่า "เคยเห็น" แค่ระดับต่ำสุดเท่านั้น
 * ถ้าระดับปัจจุบันสูงกว่าระดับต่ำสุดตั้งแต่เข้ามาครั้งแรก (เช่นแอดมินปรับระดับให้ก่อนพนักงานจะเปิดแอปครั้งแรก)
 * ก็ยังถือว่าเป็นข่าวดีที่ควรฉลองให้เห็น ไม่ใช่แค่จำเงียบ ๆ
 *
 * ระดับลดลง (เช่นรีเซ็ตคะแนนประจำปี) จะไม่เด้งป็อปอัป แค่จำระดับปัจจุบันไว้เงียบ ๆ
 *
 * เช็กซ้ำทุกครั้งที่กลับมาหน้าแรกของฝั่งพนักงาน (ไม่ใช่แค่ตอนล็อกอิน) เผื่อแอดมินเพิ่งปรับระดับให้
 * ระหว่างที่พนักงานเปิดแอปค้างอยู่ โดยไม่ต้องออกจากระบบแล้วเข้าใหม่
 */
export default function TierLevelUpWatcher() {
  const { user } = useAuth();
  const location = useLocation();
  const [levelUp, setLevelUp] = useState(null);
  const checkingRef = useRef(false);

  const check = useCallback(() => {
    if (!user || user.role === 'admin' || !user.terms_accepted_at || checkingRef.current) return;
    checkingRef.current = true;

    api
      .tiers()
      .then(({ tiers, current }) => {
        if (!tiers?.length || !current?.tier) return;

        const order = tiers.map((item) => item.key);
        const currentRank = order.indexOf(current.tier);
        if (currentRank < 0) return;

        const seen = readSeenTier(user.id);
        // ยังไม่เคยบันทึกไว้บนเครื่องนี้: ถือว่า "เคยเห็น" แค่ระดับต่ำสุด (ลำดับ 0) เพื่อให้พนักงาน
        // ที่แอดมินปรับระดับให้ไว้ก่อนเปิดแอปครั้งแรก ก็ยังได้เห็นป็อปอัปฉลองด้วย
        const seenRank = seen ? order.indexOf(seen) : 0;

        if (currentRank > seenRank) {
          const info = tiers.find((item) => item.key === current.tier);
          setLevelUp((prev) =>
            prev || (info ? { ...info } : { key: current.tier, name: current.tier, color: current.tier_color })
          );
        } else if (currentRank !== seenRank || seen === null) {
          writeSeenTier(user.id, current.tier);
        }
      })
      .catch(() => {
        /* เช็กไม่สำเร็จก็แค่ไม่เด้งป็อปอัปรอบนี้ ไม่กระทบการใช้งานหน้าอื่น */
      })
      .finally(() => {
        checkingRef.current = false;
      });
  }, [user]);

  // เช็กตอนล็อกอิน/โหลดแอป และทุกครั้งที่กลับมาหน้าแรก หรือสลับมาที่แท็บนี้
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

  if (!levelUp || !user) return null;

  return (
    <LevelUpModal
      tier={levelUp}
      onDismiss={() => {
        writeSeenTier(user.id, levelUp.key);
        setLevelUp(null);
      }}
    />
  );
}
