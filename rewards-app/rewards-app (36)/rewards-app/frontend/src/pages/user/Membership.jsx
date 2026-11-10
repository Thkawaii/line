import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Spinner } from '../../components/ui';
import TierProgress from '../../components/TierProgress';
import { Icon } from '../../components/icons';
import { num } from '../../lib/format';
import { tierCard, tierCircle, tierIcon } from '../../lib/tier';
import { useT } from '../../lib/i18n';


export default function Membership() {
  const t = useT();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.tiers().then(setData);
  }, []);

  if (!data) {
    return (
      <MobileShell title={t('membership.title')} back="/profile">
        <Spinner />
      </MobileShell>
    );
  }

  const { tiers, current, tierTarget, nextTier } = data;
  const theme = tierCard(current.tier_color);

  return (
    <MobileShell title={t('membership.title')} back="/profile">
      <div className="space-y-4 px-4 py-4">
        <section className={`rounded-2xl p-5 shadow-card ${theme.surface}`}>
          <p className={`text-sm ${theme.muted}`}>{t('membership.currentLevel')}</p>
          <p className={`mt-1 text-2xl font-bold ${theme.title}`}>{current.tier}</p>
          <p className={`mt-2 text-[26px] font-bold leading-none ${theme.value}`}>
            {num(current.points)} <span className="text-lg">{t('common.points')}</span>
          </p>

          <div className="mt-4">
            <TierProgress points={current.points} target={tierTarget} nextTier={nextTier} theme={theme} />
          </div>
        </section>

        <ul className="space-y-3">
          {tiers.map((tier) => {
            const reached = current.points >= tier.min_points;
            const isCurrent = tier.key === current.tier;
            const TierIcon = tierIcon(tier.color);
            const card = tierCard(tier.color);

            return (
              <li
                key={tier.key}
                className={`rounded-card p-4 shadow-card ${card.surface} ${
                  isCurrent ? `ring-2 ${card.ring}` : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-full ${tierCircle(tier.color)}`}
                  >
                    <TierIcon size={22} />
                  </span>

                  <div className="flex-1">
                    <p className={`font-bold ${card.title}`}>{tier.name}</p>
                    <p className={`text-2xs ${card.muted}`}>
                      {t('membership.pointsFrom', { points: num(tier.min_points) })}
                    </p>
                  </div>

                  {isCurrent ? (
                    <span className={`badge ${card.chipOn}`}>{t('membership.yourLevel')}</span>
                  ) : reached ? (
                    <span className={card.title}>
                      <Icon.Check size={20} />
                    </span>
                  ) : (
                    <span className={`badge ${card.chipOff}`}>{t('membership.notReached')}</span>
                  )}
                </div>

                <p className={`mt-3 whitespace-pre-line text-[15px] leading-relaxed ${card.muted}`}>
                  {tier.benefits}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </MobileShell>
  );
}
