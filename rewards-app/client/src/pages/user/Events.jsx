import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { EventCard } from '../../components/cards';
import { ChipBar, EmptyState, ImagePlaceholder, Modal, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num, thaiDate, timeRange } from '../../lib/format';

const FILTERS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'soon', label: 'เร็วๆ นี้' },
  { value: 'not-joined', label: 'ยังไม่เข้าร่วม' },
  { value: 'joined', label: 'เข้าร่วมแล้ว' },
];

export default function Events() {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [events, setEvents] = useState(null);
  const [active, setActive] = useState(null);

  const load = useCallback(() => {
    api.events({ filter, q }).then(({ events }) => setEvents(events));
  }, [filter, q]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  async function register(event) {
    try {
      const res = await api.registerEvent(event.id);
      toast(
        res.kind === 'vote' ? `โหวตเรียบร้อย ได้รับ ${num(res.points)} คะแนน` : 'ลงทะเบียนเรียบร้อย',
        'primary'
      );
      setActive(null);
      load();
    } catch (err) {
      toast(err.message);
    }
  }

  async function toggleFavorite(event) {
    const { favorite } = await api.toggleFavorite('event', event.id);
    toast(favorite ? 'บันทึกเข้ารายการโปรดแล้ว' : 'นำออกจากรายการโปรดแล้ว');
    setEvents((list) => list.map((e) => (e.id === event.id ? { ...e, favorite } : e)));
    setActive((prev) => (prev && prev.id === event.id ? { ...prev, favorite } : prev));
  }

  return (
    <MobileShell title="กิจกรรม" back="/">
      <div className="space-y-3 px-4 py-4">
        <SearchInput value={q} onChange={setQ} placeholder="ค้นหา" />
        <ChipBar options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {!events ? (
        <Spinner />
      ) : events.length === 0 ? (
        <EmptyState icon={Icon.Calendar} title="ยังไม่มีกิจกรรมในหมวดนี้" hint="ลองเปลี่ยนตัวกรองหรือคำค้นดู" />
      ) : (
        <ul className="space-y-4 px-4 pb-6">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard
                event={event}
                onOpen={() => setActive(event)}
                onRegister={() => register(event)}
                onFavorite={() => toggleFavorite(event)}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!active} onClose={() => setActive(null)}>
        {active && (
          <>
            <ImagePlaceholder src={active.image_url} className="h-48 w-full" />
            <div className="p-5">
              <div className="flex items-start gap-2">
                <h2 className="flex-1 text-xl font-bold leading-snug text-ink">{active.title}</h2>
                <button
                  onClick={() => toggleFavorite(active)}
                  className="text-primary"
                  aria-label="รายการโปรด"
                >
                  <Icon.Heart size={22} filled={active.favorite} />
                </button>
              </div>

              <p className="mt-1 text-[17px] font-semibold text-slate">
                รับ <span className="text-primary">{num(active.points)}</span> คะแนน
              </p>

              <div className="mt-3 space-y-1.5 text-sm text-muted">
                <p className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center gap-1.5">
                    <Icon.Calendar size={15} /> {thaiDate(active.event_date)}
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
                  <h3 className="font-semibold text-ink">รายละเอียด</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">
                    {active.description}
                  </p>
                </section>
              )}

              {active.agenda && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">กำหนดการ</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">{active.agenda}</p>
                </section>
              )}

              <button
                onClick={() => register(active)}
                disabled={active.joined}
                className={`mt-6 w-full ${active.kind === 'vote' ? 'btn-gold' : 'btn-primary'}`}
              >
                {active.joined
                  ? active.kind === 'vote'
                    ? 'โหวตแล้ว'
                    : 'ลงทะเบียนแล้ว'
                  : active.kind === 'vote'
                    ? 'โหวต'
                    : 'ลงทะเบียน'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </MobileShell>
  );
}
