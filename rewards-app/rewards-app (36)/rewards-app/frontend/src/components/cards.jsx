import { Icon } from './icons';
import { ImagePlaceholder } from './ui';
import { dateRange, num, timeRange } from '../lib/format';
import { useT } from '../lib/i18n';
import { tierIcon, tierSolidCircle } from '../lib/tier';

function FavoriteButton({ active, onClick }) {
  const t = useT();
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={t(active ? 'favorite.remove' : 'favorite.add')}
      className="text-primary"
    >
      <Icon.Heart size={22} filled={active} />
    </button>
  );
}

export function EventCard({ event, onOpen, onRegister, onFavorite }) {
  const t = useT();
  const isVote = event.kind === 'vote';
  const full = event.capacity > 0 && event.joined_count >= event.capacity;

  return (
    <article className="card overflow-hidden">
      <button onClick={onOpen} className="block w-full text-left" aria-label={t('events.openDetails', { title: event.title })}>
        <ImagePlaceholder src={event.image_url} className="h-40 w-full" />
      </button>

      <div className="p-4">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 text-[17px] font-semibold leading-snug text-ink">
            <button onClick={onOpen} className="text-left hover:text-primary-dark">
              {event.title}
            </button>
          </h3>
          {onFavorite && <FavoriteButton active={event.favorite} onClick={onFavorite} />}
        </div>

        <div className="mt-2 space-y-1 text-sm text-muted">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Icon.Calendar size={15} /> {dateRange(event.event_date, event.end_date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon.Clock size={15} /> {timeRange(event.start_time, event.end_time)}
            </span>
          </p>
          {event.location && (
            <p className="flex items-center gap-1.5">
              <Icon.Pin size={15} /> {event.location}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {t('events.receive')} <span className="text-base font-bold text-primary">{num(event.points)}</span>{' '}
            {t('common.points')}
          </p>
        </div>

        <button
          onClick={onRegister}
          disabled={event.joined || full}
          className={`mt-3 w-full ${isVote ? 'btn-gold' : 'btn-primary'}`}
        >
          {event.joined
            ? t(isVote ? 'events.voted' : 'events.registered')
            : full
              ? t('events.full')
              : t(isVote ? 'events.vote' : 'events.register')}
        </button>
      </div>
    </article>
  );
}

/* สีประจำระดับของป้ายบนการ์ด ใช้ชุดเดียวกับไอคอนระดับ */
const TIER_COLOR = { Member: 'slate', Silver: 'sky', Elite: 'gold' };

/** ป้ายระดับมุมซ้ายบนของการ์ด บอกว่าของรางวัลนี้เป็นของระดับไหน */
export function TierTag({ tier }) {
  const color = TIER_COLOR[tier] || 'slate';
  const TierIcon = tierIcon(color);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/95 py-1 pl-1 pr-3 shadow-card">
      <span className={`grid h-6 w-6 place-items-center rounded-full ${tierSolidCircle(color)}`}>
        <TierIcon size={14} />
      </span>
      <span className="text-2xs font-semibold text-ink">{tier}</span>
    </span>
  );
}

export function RewardCard({ reward, myPoints, onOpen, onFavorite, onRedeem }) {
  const t = useT();
  const locked = !!reward.locked;
  const notEnough = !locked && myPoints != null && myPoints < reward.points;
  const soldOut = reward.stock <= 0;
  const daysLeft = reward.days_left;
  const limited = daysLeft !== null && daysLeft !== undefined;

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative">
        <button onClick={onOpen} className="block w-full" aria-label={t('rewards.openDetails', { name: reward.name })}>
          <ImagePlaceholder src={reward.image_url} className="aspect-[4/3] w-full" />
        </button>

        {/* ของรางวัลที่ระดับยังไม่ถึง ยังเห็นรูปได้แต่ถูกคลุมไว้ให้รู้ว่าแลกไม่ได้ */}
        {locked && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/45 px-3 text-center backdrop-blur-[2px]">
            <span className="text-white">
              <Icon.Lock size={30} />
            </span>
            <span className="text-2xs font-semibold text-white">
              {t('rewards.lockedOverlay', { tier: reward.min_tier })}
            </span>
          </div>
        )}

        {reward.min_tier && reward.min_tier !== 'Member' && (
          <span className="absolute left-2 top-2">
            <TierTag tier={reward.min_tier} />
          </span>
        )}

        {limited && (
          <span className="absolute left-0 top-12 inline-flex items-center gap-1 rounded-r-pill bg-danger py-1 pl-2 pr-3 text-2xs font-semibold text-white shadow-card">
            <Icon.Gift size={13} /> {t('rewards.specialEvent')}
          </span>
        )}

        {onFavorite && (
          <span className="absolute right-2 top-2">
            <FavoriteButton active={reward.favorite} onClick={onFavorite} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 text-[15px] font-semibold text-ink">{reward.name}</h3>
          <span className="shrink-0 text-2xs text-muted">{t('rewards.remaining', { count: reward.stock })}</span>
        </div>

        <p className="mt-1 flex items-center gap-1.5">
          {notEnough && (
            <span className="text-slate">
              <Icon.Star size={16} />
            </span>
          )}
          {reward.old_points && (
            <span className="text-2xs text-muted line-through">{num(reward.old_points)}</span>
          )}
          <span className="text-base font-bold text-primary">{num(reward.points)}</span>
          <span className="text-2xs text-muted">{t('common.points')}</span>
        </p>

        {notEnough && (
          <p className="mt-0.5 text-2xs text-gold">
            {t('rewards.needMore', { points: num(reward.points - myPoints) })}
          </p>
        )}

        {limited && (
          <p className="mt-0.5 flex items-center gap-1 text-2xs font-medium text-danger">
            <Icon.Clock size={13} />
            {daysLeft > 0 ? t('rewards.daysLeft', { days: daysLeft }) : t('rewards.lastDay')}
          </p>
        )}

        <button
          onClick={onRedeem}
          disabled={locked || notEnough || soldOut}
          className="btn-primary btn-sm mt-3 w-full"
        >
          {locked ? (
            <>
              <Icon.Lock size={15} /> {t('rewards.lockedButton', { tier: reward.min_tier })}
            </>
          ) : soldOut ? (
            t('rewards.soldOut')
          ) : notEnough ? (
            t('rewards.notEnough')
          ) : (
            t('rewards.redeem')
          )}
        </button>
      </div>
    </article>
  );
}
