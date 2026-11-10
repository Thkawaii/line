import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { EventCard } from '../../components/cards';
import { ChipBar, EmptyState, ImagePlaceholder, Modal, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { dateRange, num, timeRange } from '../../lib/format';
import { useT } from '../../lib/i18n';

const FILTERS = [
  { value: 'all', key: 'common.all' },
  { value: 'soon', key: 'events.filterSoon' },
  { value: 'not-joined', key: 'events.filterNotJoined' },
  { value: 'joined', key: 'events.filterJoined' },
];

export default function Events() {
  const toast = useToast();
  const t = useT();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [events, setEvents] = useState(null);
  const [active, setActive] = useState(null);
  const [choice, setChoice] = useState(null);

  const load = useCallback(() => {
    api.events({ filter, q }).then(({ events }) => setEvents(events));
  }, [filter, q]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function register(event, optionId) {
    try {
      const res = await api.registerEvent(event.id, optionId);
      toast(
        res.kind === 'vote'
          ? t('events.voteSuccess', { points: num(res.points) })
          : t('events.registerSuccess'),
        'primary'
      );
      setActive(null);
      setChoice(null);
      load();
    } catch (err) {
      toast(err.message);
    }
  }

  async function toggleFavorite(event) {
    const { favorite } = await api.toggleFavorite('event', event.id);
    toast(t(favorite ? 'favorite.added' : 'favorite.removed'));
    setEvents((list) => list.map((e) => (e.id === event.id ? { ...e, favorite } : e)));
    setActive((prev) => (prev && prev.id === event.id ? { ...prev, favorite } : prev));
  }

  return (
    <MobileShell title={t('events.title')} back="/">
      <div className="space-y-3 px-4 py-4">
        <SearchInput value={q} onChange={setQ} placeholder={t('events.searchPlaceholder')} />
        <ChipBar
          options={FILTERS.map((f) => ({ value: f.value, label: t(f.key) }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {!events ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState icon={Icon.Calendar} title={t('events.empty')} hint={t('events.emptyHint')} />
      ) : (
        <ul className="space-y-4 px-4 pb-6">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard
                event={event}
                onOpen={() => {
                  setChoice(null);
                  setActive(event);
                }}
                onRegister={() => {
                  // กิจกรรมโหวตที่มีตัวเลือก ต้องเปิดรายละเอียดไปเลือกก่อน กดจากการ์ดตรง ๆ ไม่ได้
                  if (event.kind === 'vote' && event.options?.length > 0) {
                    setChoice(null);
                    setActive(event);
                    return;
                  }
                  register(event);
                }}
                onFavorite={() => toggleFavorite(event)}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!active}
        onClose={() => {
          setActive(null);
          setChoice(null);
        }}
      >
        {active && (
          <>
            <ImagePlaceholder src={active.image_url} className="h-48 w-full" />
            <div className="p-5">
              <div className="flex items-start gap-2">
                <h2 className="flex-1 text-xl font-bold leading-snug text-ink">{active.title}</h2>
                <button
                  onClick={() => toggleFavorite(active)}
                  className="text-primary"
                  aria-label={t('favorite.label')}
                >
                  <Icon.Heart size={22} filled={active.favorite} />
                </button>
              </div>

              <p className="mt-1 text-[17px] font-semibold text-slate">
                {t('events.receive')} <span className="text-primary">{num(active.points)}</span>{' '}
                {t('common.points')}
              </p>

              <div className="mt-3 space-y-1.5 text-sm text-muted">
                <p className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    <Icon.Calendar size={15} /> {dateRange(active.event_date, active.end_date)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Icon.Clock size={15} /> {timeRange(active.start_time, active.end_time)}
                  </span>
                </p>
                {active.location && (
                  <p className="flex items-center gap-1.5">
                    <Icon.Pin size={15} /> {active.location}
                  </p>
                )}
              </div>

              {active.description && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">{t('events.details')}</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">
                    {active.description}
                  </p>
                </section>
              )}

              {active.agenda && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">{t('events.schedule')}</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">{active.agenda}</p>
                </section>
              )}

              {active.kind === 'vote' && active.options?.length > 0 && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">{t('events.chooseOption')}</h3>

                  <ul className="mt-2 space-y-2">
                    {active.options.map((option) => {
                      const picked = active.joined
                        ? String(active.chosen_option_id) === String(option.id)
                        : choice === option.id;

                      return (
                        <li key={option.id}>
                          <button
                            type="button"
                            onClick={() => !active.joined && setChoice(option.id)}
                            disabled={active.joined}
                            aria-pressed={picked}
                            className={`flex w-full items-center gap-3 rounded-card border p-3 text-left transition-colors ${
                              picked ? 'border-primary bg-primary-wash' : 'border-line bg-white'
                            } ${active.joined ? 'cursor-default' : 'hover:border-primary'}`}
                          >
                            {/* วงกลมเลือก วาดเองเพื่อให้คุมขนาดและสีได้ตรงกับดีไซน์ */}
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${
                                picked ? 'border-primary' : 'border-[#C9D2D2]'
                              }`}
                            >
                              {picked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-ink">{option.label}</span>
                              {option.detail && (
                                <span className="mt-0.5 block text-2xs text-muted">{option.detail}</span>
                              )}
                            </span>

                            {active.joined && (
                              <span className="shrink-0 text-2xs text-muted">{num(option.votes)}</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  {!active.joined && <p className="mt-2 text-2xs text-muted">{t('events.voteOnce')}</p>}
                </section>
              )}

              <button
                onClick={() => {
                  if (active.kind === 'vote' && active.options?.length > 0 && !choice) {
                    toast(t('events.pickOne'));
                    return;
                  }
                  register(active, choice);
                }}
                disabled={active.joined}
                className={`mt-6 w-full ${active.kind === 'vote' ? 'btn-gold' : 'btn-primary'}`}
              >
                {active.joined
                  ? t(active.kind === 'vote' ? 'events.voted' : 'events.registered')
                  : t(active.kind === 'vote' && active.options?.length > 0
                      ? 'events.confirmVote'
                      : active.kind === 'vote'
                        ? 'events.vote'
                        : 'events.register')}
              </button>
            </div>
          </>
        )}
      </Modal>
    </MobileShell>
  );
}
