import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Icon } from '../../components/icons';
import { ImagePlaceholder, Spinner } from '../../components/ui';
import TierProgress from '../../components/TierProgress';
import { dateRange, num, timeRange } from '../../lib/format';
import { tierCard, tierCircle, tierIcon } from '../../lib/tier';
import { useT } from '../../lib/i18n';
import LanguagePicker from '../../components/LanguagePicker';

/**
 * แบนเนอร์หนึ่งใบ ถ้าตั้งลิงก์ไว้ให้กดไปตามลิงก์ได้
 * ลิงก์ภายในแอป (ขึ้นต้นด้วย /) ใช้ Link เพื่อไม่ให้โหลดหน้าใหม่ทั้งหน้า
 * ลิงก์ภายนอกเปิดแท็บใหม่ พร้อม rel กันหน้าปลายทางเข้าถึงหน้าเราได้
 */
function BannerSlide({ banner }) {
  const t = useT();
  const image = <ImagePlaceholder src={banner.image_url} className="h-40 w-full rounded-card" />;
  const link = (banner.link_url || '').trim();

  if (!link) return image;

  if (link.startsWith('/')) {
    return (
      <Link to={link} aria-label={banner.title || t('home.banner')}>
        {image}
      </Link>
    );
  }

  return (
    <a href={link} target="_blank" rel="noopener noreferrer" aria-label={banner.title || t('home.banner')}>
      {image}
    </a>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const t = useT();
  const [data, setData] = useState(null);
  const [slide, setSlide] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    api.home().then(setData).catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <MobileShell bell={false}>
        <Spinner />
      </MobileShell>
    );
  }

  const { user, banners, rewards, events, tierTarget, nextTier } = data;
  const TierIcon = tierIcon(user.tier_color);
  const theme = tierCard(user.tier_color);
  const slides = banners.length ? banners : [{ id: 'empty' }];

  const goSlide = (index) => {
    const next = (index + slides.length) % slides.length;
    setSlide(next);
    const track = trackRef.current;
    if (track) track.scrollTo({ left: track.clientWidth * next, behavior: 'smooth' });
  };

  return (
    <MobileShell bell={false}>
      <header
        className="flex items-center justify-between bg-white px-4 py-3"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
      >
        <LanguagePicker />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate">
            {t('home.greeting', { name: user.display_name.split(' ')[0] })}
          </span>
          <Link to="/notifications" className="text-slate" aria-label={t('common.notifications')}>
            <Icon.Bell size={22} />
          </Link>
        </div>
      </header>

      <div className="space-y-5 px-4 py-4">
        {/* การ์ดคะแนนสะสม */}
        <section className={`rounded-2xl p-4 shadow-card ${theme.surface}`}>
          <div className="flex items-center gap-2.5">
            <span className={`grid h-9 w-9 place-items-center rounded-full ${tierCircle(user.tier_color)}`}>
              <TierIcon size={20} />
            </span>
            <span className={`flex-1 text-lg font-bold ${theme.title}`}>{user.tier}</span>
            <Link to="/points/history" className={`flex items-center text-sm ${theme.link}`}>
              {t('home.pointsHistory')} <Icon.Next size={14} />
            </Link>
          </div>

          <p className={`mt-3 text-[26px] font-bold leading-none ${theme.value}`}>
            {num(user.points)} <span className="text-xl">{t('common.points')}</span>
          </p>

          <div className="mt-3">
            <TierProgress points={user.points} target={tierTarget} nextTier={nextTier} theme={theme} />
          </div>
        </section>

        {/* แบนเนอร์ */}
        <section className="relative">
          <div
            ref={trackRef}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-card"
            onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {slides.map((banner) => (
              <div key={banner.id} className="w-full shrink-0 snap-center">
                <BannerSlide banner={banner} />
              </div>
            ))}
          </div>

          {slides.length > 1 && (
            <>
              <button
                onClick={() => goSlide(slide - 1)}
                aria-label={t('home.bannerPrev')}
                className="absolute left-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-slate shadow-card"
              >
                <Icon.Back size={18} />
              </button>
              <button
                onClick={() => goSlide(slide + 1)}
                aria-label={t('home.bannerNext')}
                className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/80 text-slate shadow-card"
              >
                <Icon.Next size={18} />
              </button>
              <div className="mt-2.5 flex justify-center gap-1.5">
                {slides.map((banner, index) => (
                  <button
                    key={banner.id}
                    onClick={() => goSlide(index)}
                    aria-label={t('home.bannerGoto', { index: index + 1 })}
                    className={`h-1.5 rounded-pill transition-all ${
                      index === slide ? 'w-4 bg-primary' : 'w-1.5 bg-[#CFD4D4]'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* ของรางวัล */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <span className="text-primary">
                <Icon.Gift size={20} />
              </span>
              {t('home.rewards')}
            </h2>
            <Link to="/rewards" className="flex items-center text-sm text-primary">
              {t('common.seeAll')} <Icon.Next size={14} />
            </Link>
          </div>

          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {rewards.map((reward) => (
              <button
                key={reward.id}
                onClick={() => navigate(`/rewards?focus=${reward.id}`)}
                className="card w-40 shrink-0 overflow-hidden text-left"
              >
                <ImagePlaceholder src={reward.image_url} className="aspect-square w-full" />
                <div className="p-2.5">
                  <p className="line-clamp-2 text-sm font-semibold text-ink">{reward.name}</p>
                  <p className="mt-1 text-sm font-bold text-primary">
                    {num(reward.points)}{' '}
                    <span className="text-2xs font-normal text-muted">{t('common.points')}</span>
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* กิจกรรมที่กำลังเปิด */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <span className="text-primary">
                <Icon.Calendar size={20} />
              </span>
              {t('home.events')}
            </h2>
            <Link to="/events" className="flex items-center text-sm text-primary">
              {t('common.seeAll')} <Icon.Next size={14} />
            </Link>
          </div>

          <ul className="space-y-3">
            {events.map((event) => (
              <li key={event.id}>
                <Link to="/events" className="card flex gap-3 overflow-hidden p-3">
                  <ImagePlaceholder src={event.image_url} className="h-20 w-24 shrink-0 rounded-[8px]" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{event.title}</p>
                    <p className="mt-1 text-2xs text-muted">
                      {dateRange(event.event_date, event.end_date)}
                    </p>
                    <p className="text-2xs text-muted">{timeRange(event.start_time, event.end_time)}</p>
                    <p className="mt-1 text-sm text-muted">
                      {t('home.receive')} <span className="font-bold text-primary">{num(event.points)}</span>{' '}
                      {t('common.points')}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </MobileShell>
  );
}
