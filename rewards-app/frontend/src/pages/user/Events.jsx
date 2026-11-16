import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { EventCard } from '../../components/cards';
import { ChipBar, EmptyState, ImagePlaceholder, Modal, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { dateRange, num, timeRange } from '../../lib/format';
import { useLanguage } from '../../lib/i18n';
import { formatDistance, getPosition } from '../../lib/geolocation';
import { SpecialPointIcon } from '../../components/SpecialPoints';

/**
 * หน้าต่างแจ้งปัญหาเรื่องตำแหน่ง
 *
 * ใช้หน้าต่างกลางจอแทนแถบแจ้งเตือนมุมจอ เพราะแถบแจ้งเตือนหายไปเองในไม่กี่วินาที
 * ผู้ใช้ที่กดลงทะเบียนแล้วมองไปทางอื่นจะไม่เห็นเลยว่าทำไมไม่สำเร็จ
 *
 * แต่ละสาเหตุมีหัวข้อ คำอธิบาย และสีของตัวเอง เพราะทางแก้ต่างกันสิ้นเชิง
 * สาเหตุที่ผู้ใช้แก้เองได้จะมีปุ่มลองอีกครั้งให้ ส่วนที่ต้องให้ผู้ดูแลแก้จะไม่มี
 */
function LocationIssueDialog({ issue, onClose, onRetry, t }) {
  if (!issue) return null;

  const outside = issue.code === 'outside';
  const canRetry = issue.code !== 'insecure';

  const text = {
    outside: {
      title: t('events.outsideVenueTitle'),
      detail: t('events.outsideVenueDetail', { distance: formatDistance(issue.distance) }),
      hint: t('events.outsideVenueHint'),
    },
    denied: {
      title: t('events.locationDeniedTitle'),
      detail: t('events.locationDenied'),
      hint: t('events.locationDeniedHint'),
    },
    insecure: {
      title: t('events.locationInsecureTitle'),
      detail: t('events.locationInsecure'),
      hint: '',
    },
  }[issue.code] || {
    title: t('events.locationUnavailableTitle'),
    detail: t('events.locationUnavailable'),
    hint: t('events.locationUnavailableHint'),
  };

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="p-6 text-center">
        {/* วงกลมไอคอนใหญ่ตรงกลาง อ่านออกตั้งแต่ยังไม่ทันอ่านตัวหนังสือ
            ว่าเป็นเรื่องตำแหน่ง ไม่ใช่เรื่องคะแนนหรือสิทธิ์ */}
        <span
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            outside ? 'bg-gold-wash text-gold-ink' : 'bg-danger/10 text-danger'
          }`}
        >
          <Icon.Pin size={30} />
        </span>

        <h2 className="mt-4 text-lg font-bold text-ink">{text.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate">{text.detail}</p>

        {text.hint && (
          <p className="mt-3 rounded-[10px] bg-page px-3 py-2.5 text-2xs text-muted">
            {text.hint}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <button onClick={onClose} className="btn-ghost flex-1">
            {t('common.close')}
          </button>
          {canRetry && (
            <button onClick={onRetry} className="btn-primary flex-1">
              {t('events.tryAgain')}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * หน้าต่างยืนยันว่าลงทะเบียนหรือโหวตสำเร็จ
 *
 * ปิดตัวเองหลัง 3 วินาที แต่กดปิดเองก่อนได้
 * ใช้หน้าต่างกลางจอแทนแถบแจ้งเตือนมุมจอ เพราะคะแนนที่ได้รับเป็นผลลัพธ์หลัก
 * ของการกดปุ่ม ควรเห็นชัดว่าได้เท่าไหร่ ไม่ใช่แวบผ่านไปที่มุมจอ
 */
function SuccessDialog({ result, onClose, t }) {
  /*
    ตั้งเวลาปิดใหม่ทุกครั้งที่หน้าต่างเปิด และเคลียร์ทิ้งเมื่อปิด
    ถ้าไม่เคลียร์ ผู้ใช้ที่กดปิดเองแล้วลงทะเบียนกิจกรรมถัดไปทันที
    จะโดนตัวจับเวลาของรอบก่อนปิดหน้าต่างใหม่ทิ้งกลางคัน
  */
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [result, onClose]);

  if (!result) return null;

  const voted = result.kind === 'vote';

  return (
    <Modal open onClose={onClose} size="sm">
      <div className="p-7 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-wash text-success">
          <Icon.CheckCircle size={34} />
        </span>

        <h2 className="mt-4 text-lg font-bold text-ink">
          {t(voted ? 'events.voteSuccess' : 'events.registerSuccess')}
        </h2>

        {/* คะแนนเป็นพระเอกของหน้าต่างนี้ จึงตัวใหญ่กว่าหัวข้อ */}
        {result.points > 0 && (
          <p className="mt-3 text-2xl font-bold text-primary">
            +{num(result.points)}{' '}
            <span className="text-base font-normal text-muted">{t('common.points')}</span>
          </p>
        )}

        {result.specialPoints > 0 && (
          <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xl font-bold text-primary">
            <SpecialPointIcon size={24} />+{num(result.specialPoints)}
            <span className="text-base font-normal text-muted">{t('points.special')}</span>
          </p>
        )}

        <button onClick={onClose} className="btn-ghost mt-6 w-full">
          {t('common.close')}
        </button>
      </div>
    </Modal>
  );
}

const FILTERS = [
  { value: 'all', key: 'common.all' },
  { value: 'soon', key: 'events.filterSoon' },
  { value: 'not-joined', key: 'events.filterNotJoined' },
  { value: 'joined', key: 'events.filterJoined' },
];

export default function Events() {
  const toast = useToast();
  const { t, lang } = useLanguage();
  const [filter, setFilter] = useState('all');
  const [registering, setRegistering] = useState(false);
  const [locating, setLocating] = useState(false);

  // ปัญหาเรื่องตำแหน่ง เก็บกิจกรรมกับตัวเลือกไว้ด้วย ผู้ใช้จะได้กดลองใหม่จากหน้าต่างเดิม
  const [locationIssue, setLocationIssue] = useState(null);

  // ผลลัพธ์ของการลงทะเบียน/โหวต แสดงเป็นหน้าต่างกลางจอที่ปิดเองใน 3 วินาที
  const [success, setSuccess] = useState(null);
  const [q, setQ] = useState('');
  const [events, setEvents] = useState(null);
  const [active, setActive] = useState(null);
  const [choice, setChoice] = useState(null);

  const load = useCallback(() => {
    api.events({ filter, q }).then(({ events }) => setEvents(events));
  }, [filter, q, lang]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  /*
    ลงทะเบียน

    กิจกรรมที่ผู้ดูแลตั้งพื้นที่จัดงานไว้ (needs_location) ต้องขอตำแหน่งจากเบราว์เซอร์ก่อน
    แล้วส่งไปให้เซิร์ฟเวอร์ตรวจว่าอยู่ในรัศมีงานไหม ผ่านแล้วได้คะแนนทันที

    ปัญหาเรื่องตำแหน่งแสดงเป็นหน้าต่างกลางจอ ไม่ใช่แถบแจ้งเตือนมุมจอ
    เพราะแถบแจ้งเตือนหายไปเองในไม่กี่วินาที ผู้ใช้ที่กดแล้วมองไปทางอื่น
    จะไม่เห็นเลยว่าทำไมลงทะเบียนไม่สำเร็จ แล้วกดซ้ำไปเรื่อย ๆ

    แยกสาเหตุเป็นสี่แบบ เพราะทางแก้ของผู้ใช้ต่างกันสิ้นเชิง
      อยู่นอกพื้นที่          ต้องเดินเข้าไปใกล้จุดจัดงาน
      ไม่อนุญาตให้ใช้ตำแหน่ง  ต้องไปเปิดสิทธิ์ในตั้งค่าของเบราว์เซอร์
      หาตำแหน่งไม่ได้         ต้องเปิด GPS หรือเดินออกไปที่โล่ง
      เว็บไม่ได้เปิดผ่าน https ต้องให้ผู้ดูแลระบบแก้ที่เครื่องเซิร์ฟเวอร์
  */
  async function register(event, optionId) {
    setRegistering(true);
    try {
      let position = null;

      if (event.needs_location) {
        setLocating(true);
        try {
          const spot = await getPosition();
          position = { lat: spot.lat, lng: spot.lng };
        } catch (err) {
          setLocationIssue({ code: err.code, event, optionId });
          return;
        } finally {
          setLocating(false);
        }
      }

      const res = await api.registerEvent(event.id, optionId, position);

      // เลือกข้อความจากชนิดของกิจกรรม ไม่ใช่จากจำนวนคะแนน
      // เดิมดูจากคะแนน พอกิจกรรมลงทะเบียนเริ่มจ่ายคะแนนทันที
      // ข้อความเลยกลายเป็น "โหวตเรียบร้อย" ทั้งที่ผู้ใช้กดลงทะเบียน
      setSuccess({
        kind: res.kind,
        points: res.points || 0,
        specialPoints: res.specialPoints || 0,
      });

      setActive(null);
      setChoice(null);
      load();
    } catch (err) {
      // เซิร์ฟเวอร์ส่งระยะห่างกลับมาด้วย บอกผู้ใช้ไปเลยว่าห่างแค่ไหน
      // เขาจะได้รู้ว่าควรเดินเข้าไปอีกหน่อย หรือมาผิดที่ไปเลย
      if (err.data?.code === 'outside_venue') {
        setLocationIssue({
          code: 'outside',
          distance: err.data.distance,
          event,
          optionId,
        });
      } else {
        toast(err.message);
      }
    } finally {
      setRegistering(false);
      setLocating(false);
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

      <SuccessDialog result={success} t={t} onClose={() => setSuccess(null)} />

      <LocationIssueDialog
        issue={locationIssue}
        t={t}
        onClose={() => setLocationIssue(null)}
        onRetry={() => {
          const retry = locationIssue;
          setLocationIssue(null);
          register(retry.event, retry.optionId);
        }}
      />
    </MobileShell>
  );
}
