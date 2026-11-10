import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { RewardCard } from '../../components/cards';
import { ChipBar, EmptyState, ImagePlaceholder, Modal, SearchInput, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num } from '../../lib/format';

export default function Rewards() {
  const toast = useToast();
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
    toast(favorite ? 'บันทึกเข้ารายการโปรดแล้ว' : 'นำออกจากรายการโปรดแล้ว');
    setData((prev) => ({
      ...prev,
      rewards: prev.rewards.map((r) => (r.id === reward.id ? { ...r, favorite } : r)),
    }));
    setActive((prev) => (prev && prev.id === reward.id ? { ...prev, favorite } : prev));
  }

  const categories = ['ทั้งหมด', ...(data?.categories || [])];
  const notEnough = active && data && data.points < active.points;

  return (
    <MobileShell title="ของรางวัล" back="/">
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2 rounded-pill border border-line bg-white px-3 py-2.5 shadow-card">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#4A5555] text-white">
            <Icon.Star size={16} />
          </span>
          <span className="text-sm text-slate">
            คะแนนสะสมของคุณ : <b className="text-ink">{num(data?.points)}</b> คะแนน
          </span>
        </div>

        <SearchInput value={q} onChange={setQ} placeholder="ค้นหาของรางวัล" />
        <ChipBar
          options={categories.map((c) => ({ value: c, label: c }))}
          value={category}
          onChange={setCategory}
        />
      </div>

      {!data ? (
        <Spinner />
      ) : data.rewards.length === 0 ? (
        <EmptyState icon={Icon.Gift} title="ไม่พบของรางวัลที่ค้นหา" hint="ลองเปลี่ยนหมวดหมู่หรือคำค้นดู" />
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
            <ImagePlaceholder src={active.image_url} className="h-52 w-full" />
            <div className="p-5">
              <div className="flex items-start gap-2">
                <h2 className="flex-1 text-xl font-bold leading-snug text-ink">{active.name}</h2>
                <button onClick={() => toggleFavorite(active)} className="text-primary" aria-label="รายการโปรด">
                  <Icon.Heart size={22} filled={active.favorite} />
                </button>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <p className="flex items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#4A5555] text-white">
                    <Icon.Star size={14} />
                  </span>
                  <span className="text-lg font-bold text-primary">{num(active.points)}</span>
                  <span className="text-sm text-muted">คะแนน</span>
                </p>
                <span className="text-sm text-muted">คงเหลือ : {active.stock}</span>
              </div>
              <p className="mt-1 text-sm text-muted">(คะแนนของคุณ : {num(data.points)} คะแนน)</p>

              {active.description && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">รายละเอียด</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">
                    {active.description}
                  </p>
                </section>
              )}
              {active.how_to && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">วิธีการรับรางวัล</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">{active.how_to}</p>
                </section>
              )}
              {active.conditions && (
                <section className="mt-4">
                  <h3 className="font-semibold text-ink">เงื่อนไขการแลกรางวัล</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed text-slate">
                    {active.conditions}
                  </p>
                </section>
              )}

              <button
                onClick={() => redeem(active)}
                disabled={notEnough || active.stock <= 0}
                className="btn-primary mt-6 w-full"
              >
                {active.stock <= 0 ? 'ของหมด' : notEnough ? 'คะแนนไม่พอ' : 'แลกรางวัล'}
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
          <h2 className="mt-4 text-xl font-bold text-ink">แลกรางวัล สำเร็จ</h2>
          <p className="mt-2 text-sm leading-relaxed text-gold">
            กรุณาติดต่อรับสินค้าได้ที่ฝ่ายทรัพยากรบุคคล
            <br />
            และแสดงประวัติการทำรายการเป็นหลักฐานเพื่อรับสินค้า
          </p>
          <p className="mt-3 text-sm text-muted">
            รหัสอ้างอิง : <b className="text-ink">{success}</b>
          </p>
          <Link to="/my-rewards" className="btn-primary mt-6 w-full">
            ของรางวัลของฉัน
          </Link>
        </div>
      </Modal>
    </MobileShell>
  );
}
