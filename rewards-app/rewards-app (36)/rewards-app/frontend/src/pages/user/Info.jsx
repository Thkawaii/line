import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import PolicyBody from '../../components/PolicyBody';
import { ChipBar, EmptyState, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { clockTime, groupByDay, relativeDay, thaiDate } from '../../lib/format';
import { useT } from '../../lib/i18n';

const CATEGORIES = [
  { value: 'all', key: 'common.all' },
  { value: 'announce', key: 'notifications.catAnnounce' },
  { value: 'event', key: 'notifications.catEvent' },
  { value: 'reward', key: 'notifications.catReward' },
  { value: 'point', key: 'notifications.catPoint' },
];

const CATEGORY_STYLE = {
  point: { icon: Icon.Wallet, className: 'bg-gold text-white' },
  reward: { icon: Icon.Gift, className: 'bg-[#E8556E] text-white' },
  event: { icon: Icon.Calendar, className: 'bg-primary text-white' },
  announce: { icon: Icon.Megaphone, className: 'bg-[#2D4FA0] text-white' },
};

export function NotificationsPage() {
  const t = useT();
  const [category, setCategory] = useState('all');
  const [data, setData] = useState(null);

  const load = (cat) => api.notifications(cat).then(setData);

  useEffect(() => {
    setData(null);
    load(category);
  }, [category]);

  async function readAll() {
    await api.readAllNotifications();
    load(category);
  }

  return (
    <MobileShell title={t('notifications.title')} back bell={false}>
      <div className="px-4 py-4">
        <ChipBar
          options={CATEGORIES.map((c) => ({ value: c.value, label: t(c.key) }))}
          value={category}
          onChange={setCategory}
        />
      </div>

      {!data ? (
        <Spinner />
      ) : data.notifications.length === 0 ? (
        <EmptyState icon={Icon.Bell} title={t('notifications.empty')} />
      ) : (
        <div className="space-y-4 px-4 pb-6">
          {groupByDay(data.notifications).map((group, index) => (
            <section key={group.date.toISOString()}>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm text-muted">{relativeDay(group.date)}</h2>
                {index === 0 && data.unread > 0 && (
                  <button onClick={readAll} className="text-sm font-semibold text-primary">
                    {t('notifications.readAll')}
                  </button>
                )}
              </div>

              <ul className="space-y-2.5">
                {group.items.map((item) => {
                  const style = CATEGORY_STYLE[item.category] || CATEGORY_STYLE.announce;
                  const Ico = style.icon;
                  return (
                    <li
                      key={item.id}
                      className={`card flex gap-3 p-3 ${item.read_at ? '' : 'ring-1 ring-primary/40'}`}
                    >
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${style.className}`}>
                        <Ico size={22} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug text-ink">{item.title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.body}</p>
                      </div>
                      <span className="shrink-0 self-end text-2xs text-muted">
                        {clockTime(item.created_at).replace('เวลา ', '')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </MobileShell>
  );
}

export function FaqPage() {
  const t = useT();
  const [faqs, setFaqs] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.faqs().then(({ faqs }) => setFaqs(faqs));
  }, []);

  return (
    <MobileShell title={t('faq.title')} back="/profile">
      {!faqs ? (
        <Spinner />
      ) : (
        <ul className="space-y-3 px-4 py-4">
          {faqs.map((faq) => {
            const expanded = open === faq.id;
            return (
              <li key={faq.id} className="card overflow-hidden">
                <button
                  onClick={() => setOpen(expanded ? null : faq.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="flex-1 font-semibold leading-snug text-ink">{faq.question}</span>
                  <span className={`shrink-0 text-slate transition-transform ${expanded ? 'rotate-180' : ''}`}>
                    <Icon.Chevron size={18} />
                  </span>
                </button>
                {expanded && (
                  <p className="border-t border-line px-4 py-3.5 text-[15px] leading-relaxed text-slate">
                    {faq.answer}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </MobileShell>
  );
}

export function PolicyPage() {
  const t = useT();
  const { key = 'terms' } = useParams();
  const [policy, setPolicy] = useState(null);

  useEffect(() => {
    setPolicy(null);
    api.policy(key).then(({ policy }) => setPolicy(policy));
  }, [key]);

  return (
    <MobileShell title={t('policy.title')} back="/profile">
      {!policy ? (
        <Spinner />
      ) : (
        <article className="card m-4 p-5">
          <h2 className="text-lg font-bold leading-snug text-ink">{policy.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {t('policy.updatedAt', { date: thaiDate(policy.updated_at, { full: true }) })}
          </p>
          <div className="mt-4">
            <PolicyBody content={policy.content} />
          </div>
        </article>
      )}
    </MobileShell>
  );
}
