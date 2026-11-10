import { Icon } from './icons';
import { ImagePlaceholder } from './ui';
import { num, thaiDate, timeRange } from '../lib/format';

function FavoriteButton({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'นำออกจากรายการโปรด' : 'เพิ่มเข้ารายการโปรด'}
      className="text-primary"
    >
      <Icon.Heart size={22} filled={active} />
    </button>
  );
}

export function EventCard({ event, onOpen, onRegister, onFavorite }) {
  const isVote = event.kind === 'vote';
  const full = event.capacity > 0 && event.joined_count >= event.capacity;

  return (
    <article className="card overflow-hidden">
      <button onClick={onOpen} className="block w-full text-left" aria-label={`ดูรายละเอียด ${event.title}`}>
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
              <Icon.Calendar size={15} /> {thaiDate(event.event_date)}
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
            รับ <span className="text-base font-bold text-primary">{num(event.points)}</span> คะแนน
          </p>
        </div>

        <button
          onClick={onRegister}
          disabled={event.joined || full}
          className={`mt-3 w-full ${isVote ? 'btn-gold' : 'btn-primary'}`}
        >
          {event.joined ? (isVote ? 'โหวตแล้ว' : 'ลงทะเบียนแล้ว') : full ? 'เต็มแล้ว' : isVote ? 'โหวต' : 'ลงทะเบียน'}
        </button>
      </div>
    </article>
  );
}

export function RewardCard({ reward, myPoints, onOpen, onFavorite, onRedeem }) {
  const notEnough = myPoints != null && myPoints < reward.points;
  const soldOut = reward.stock <= 0;

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className="relative">
        <button onClick={onOpen} className="block w-full" aria-label={`ดูรายละเอียด ${reward.name}`}>
          <ImagePlaceholder src={reward.image_url} className="aspect-[4/3] w-full" />
        </button>
        {onFavorite && (
          <span className="absolute right-2 top-2">
            <FavoriteButton active={reward.favorite} onClick={onFavorite} />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 text-[15px] font-semibold text-ink">{reward.name}</h3>
          <span className="shrink-0 text-2xs text-muted">เหลือ {reward.stock} สิทธิ์</span>
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
          <span className="text-2xs text-muted">คะแนน</span>
        </p>

        {notEnough && (
          <p className="mt-0.5 text-2xs text-gold">*สะสมเพิ่มอีก {num(reward.points - myPoints)} คะแนน</p>
        )}

        <button
          onClick={onRedeem}
          disabled={notEnough || soldOut}
          className="btn-primary btn-sm mt-3 w-full"
        >
          {soldOut ? 'ของหมด' : notEnough ? 'คะแนนไม่พอ' : 'แลกรางวัล'}
        </button>
      </div>
    </article>
  );
}
