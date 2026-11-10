import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { RewardCard, TierTag } from '../../components/cards';
import { ChipBar, EmptyState, ImagePlaceholder, Modal, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num } from '../../lib/format';
import { pointsBadge } from '../../lib/tier';
import { useT } from '../../lib/i18n';

export default function Rewards() {
  const toast = useToast();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('ทั้งหมด');
  const [data, setData] = useState(null);
  const [active, setActive] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(() => {
    api.rewards({ q, category }).then(setData);
  }, [q, category]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  // เปิดรายละเอียดอัตโนมัติเมื่อมาจากการ์ดในหน้าแรก
  useEffect(() => {
    const focus = params.get('focus');
    if (!focus || !data) return;
    const reward = data.rewards.find((r) => String(r.id) === focus);
    if (reward) setActive(reward);
    setParams({}, { replace: true });
  }, [params, data, setParams]);

  async function redeem(reward) {
    try {
      const res = await api.redeem(reward.id);
      setActive(null);
      setSuccess(res.refCode);
      load();
    } catch (err) {
      toast(err.message);
    }
  }

  async function toggleFavorite(reward) {
    const { favorite } = await api.toggleFavorite('reward', reward.id);
    toast(t(favorite ? 'favorite.added' : 'favorite.removed'));
    setData((prev) => ({
      ...prev,
      rewards: prev.rewards.map((r) => (r.id === reward.id ? { ...r, favorite } : r)),
    }));
    setActive((prev) => (prev && prev.id === reward.id ? { ...prev, favorite } : prev));
  }

  // ชื่อหมวดหมู่เป็นข้อมูลที่ผู้ดูแลกรอก จึงแสดงตามที่กรอกไว้ ไม่ได้แปล
  const categories = ['ทั้งหมด', ...(data?.categories || [])];
  const notEnough = active && data && !active.locked && data.points < active.points;

  return (
    <MobileShell title={t('rewards.title')} back="/">
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2 rounded-pill border border-line bg-white px-3 py-2.5 shadow-card">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#4A5555] text-white">
            <Icon.Star size={16} />
          </span>
          <span className="text-sm text-slate">
            {t('rewards.yourPoints')} : <b className="text-ink">{num(data?.points)}</b> {t('common.points')}
          </span>
        </div>

        <SearchInput value={q} onChange={setQ} placeholder={t('rewards.searchPlaceholder')} />
        <ChipBar
          options={categories.map((c) => ({ value: c, label: c === 'ทั้งหมด' ? t('common.all') : c }))}
          value={category}
          onChange={setCategory}
        />
      </div>

      {!data ? (
        <Spinner />
      ) : data.rewards.length === 0 ? (
        <EmptyState icon={Icon.Gift} title={t('rewards.empty')} hint={t('rewards.emptyHint')} />
      ) : (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {data.rewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              myPoints={data.points}
              onOpen={() => setActive(reward)}
              onFavorite={() => toggleFavorite(reward)}
              onRedeem={() => setActive(reward)}
            />
          ))}
        </div>
      )}

      {/* รายละเอียดของรางวัล */}
      <Modal open={!!active} onClose={() => setActive(null)}>
        {active && (
          <>
            {/* ใช้สัดส่วน 4:3 เท่ากับตอนครอปตอนอัปโหลด และ object-contain ให้เห็นสินค้าทั้งชิ้น
                ไม่ใช่ความสูงคงที่แล้วครอป ซึ่งทำให้รูปดูถูกซูมเข้าไป */}
            <div className="relative bg-[#F2F5F6]">
              <ImagePlaceholder
                src={active.image_url}
                className="aspect-[4/3] max-h-[46vh] w-full"
                fit="contain"
              />
              {active.min_tier && active.min_tier !== 'Member' && (
                <span className="absolute left-3 top-3">
                  <TierTag tier={active.min_tier} />
                </span>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start gap-2">
                <h2 className="flex-1 text-xl font-bold leading-snug text-ink">{active.name}</h2>
                <button onClick={() => toggleFavorite(active)} className="text-primary" aria-label={t('favorite.label')}>
                  <Icon.Heart size={22} filled={active.favorite} />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <p className="flex items-center gap-2">
                  {/* ไอคอนหน้าแต้มคะแนนผูกกับระดับของรางวัล ให้ตรงกับป้าย Elite/Silver ด้านบนรูปเสมอ */}
                  {(() => {
                    const { circleClass, Icon: PointsIcon } = pointsBadge(active.min_tier);
                    return (
                      <span className={`grid h-6 w-6 place-items-center rounded-full ${circleClass}`}>
                        <PointsIcon size={14} />
                      </span>
                    );
                  })()}
                  <span className="text-lg font-bold text-primary">{num(active.points)}</span>
                  <span className="text-sm text-muted">{t('common.points')}</span>
                </p>
                <span className="text-sm text-muted">{t('rewards.stock', { count: active.stock })}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{t('rewards.yourPointsIs', { points: num(data.points) })}</p>

              {active.days_left !== null && active.days_left !== undefined && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-danger-wash px-3 py-1 text-sm font-medium text-danger">
                  <Icon.Clock size={15} />
                  {active.days_left > 0
                    ? t('rewards.daysLeft', { days: active.days_left })
                    : t('rewards.lastDay')}
                </p>
              )}

              {active.description && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">{t('rewards.details')}</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">
                    {active.description}
                  </p>
                </section>
              )}
              {active.how_to && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">{t('rewards.howTo')}</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">{active.how_to}</p>
                </section>
              )}
              {active.conditions && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">{t('rewards.conditions')}</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">
                    {active.conditions}
                  </p>
                </section>
              )}

              <button
                onClick={() => redeem(active)}
                disabled={active.locked || notEnough || active.stock <= 0}
                className="btn-primary mt-6 w-full"
              >
                {active.locked ? (
                  <>
                    <Icon.Lock size={16} /> {t('rewards.lockedButton', { tier: active.min_tier })}
                  </>
                ) : active.stock <= 0 ? (
                  t('rewards.soldOut')
                ) : notEnough ? (
                  t('rewards.notEnough')
                ) : (
                  t('rewards.redeem')
                )}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* แลกสำเร็จ */}
      <Modal open={!!success} onClose={() => setSuccess(null)} size="sm">
        <div className="px-6 py-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary text-white">
            <Icon.Check size={32} />
          </span>
          <h2 className="mt-4 text-xl font-bold text-ink">{t('rewards.successTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-gold">{t('rewards.successHint')}</p>
          <Link to="/my-rewards" className="btn-primary mt-6 w-full">
            {t('rewards.goMyRewards')}
          </Link>
        </div>
      </Modal>
    </MobileShell>
  );
}
