import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { ProgressBar, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num } from '../../lib/format';

const TIER_COLOR = {
  gold: 'bg-gold',
  sky: 'bg-sky',
  slate: 'bg-[#9AA3A3]',
};

export default function Membership() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.tiers().then(setData);
  }, []);

  if (!data) {
    return (
      <MobileShell title="สิทธิประโยชน์" back="/profile">
        <Spinner />
      </MobileShell>
    );
  }

  const { tiers, current, tierTarget, nextTier } = data;

  return (
    <MobileShell title="สิทธิประโยชน์" back="/profile">
      <div className="space-y-4 px-4 py-4">
        <section className="rounded-2xl bg-gradient-to-br from-[#EAF4F8] to-[#DCEDF4] p-5 shadow-card">
          <p className="text-sm text-slate">ระดับปัจจุบันของคุณ</p>
          <p className="mt-1 text-2xl font-bold text-ink">{current.tier}</p>
          <p className="mt-2 text-[26px] font-bold leading-none text-primary">
            {num(current.points)} <span className="text-lg">คะแนน</span>
          </p>

          {tierTarget && (
            <div className="mt-4">
              <p className="mb-1 text-right text-2xs text-slate">
                {num(current.points)} / {num(tierTarget)} P
              </p>
              <ProgressBar value={current.points} max={tierTarget} />
              <p className="mt-1.5 text-2xs text-slate">
                อีก {num(Math.max(tierTarget - current.points, 0))} คะแนนเพื่อเลื่อนสู่ระดับ {nextTier}
              </p>
            </div>
          )}
        </section>

        <ul className="space-y-3">
          {tiers.map((tier) => {
            const reached = current.points >= tier.min_points;
            const isCurrent = tier.key === current.tier;

            return (
              <li
                key={tier.key}
                className={`card p-4 ${isCurrent ? 'ring-2 ring-primary' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-full text-white ${
                      TIER_COLOR[tier.color] || TIER_COLOR.slate
                    }`}
                  >
                    <Icon.Star size={20} />
                  </span>

                  <div className="flex-1">
                    <p className="font-bold text-ink">{tier.name}</p>
                    <p className="text-2xs text-muted">{num(tier.min_points)} คะแนนขึ้นไป</p>
                  </div>

                  {isCurrent ? (
                    <span className="badge bg-primary text-white">ระดับของคุณ</span>
                  ) : reached ? (
                    <span className="text-primary">
                      <Icon.Check size={20} />
                    </span>
                  ) : (
                    <span className="badge bg-line text-muted">ยังไม่ถึง</span>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate">{tier.benefits}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </MobileShell>
  );
}
