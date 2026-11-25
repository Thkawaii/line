import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { RewardCard, EventCard } from '../../components/cards';
import {
  Badge,
  EmptyState,
  ImagePlaceholder,
  Modal,
  Notice,
  SegmentedToggle,
  Spinner,
  useToast,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { countdown, dateTime, num } from '../../lib/format';
import { useLanguage } from '../../lib/i18n';

export function FavoritesPage() {
  const toast = useToast();
  const { t, lang } = useLanguage();
  const [type, setType] = useState('reward');
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    setItems(null);
    api.favorites(type).then(({ items }) => setItems(items));
  }, [type, lang]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id) {
    await api.toggleFavorite(type, id);
    toast(t('favorite.removed'));
    load();
  }

  return (
    <MobileShell title={t('favorites.title')} back="/profile">
      <div className="flex justify-center px-4 py-4">
        <SegmentedToggle
          value={type}
          onChange={setType}
          options={[
            { value: 'event', label: t('favorites.tabEvents') },
            { value: 'reward', label: t('favorites.tabRewards') },
          ]}
        />
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Icon.Heart}
          title={t('favorites.empty')}
          hint={t('favorites.emptyHint')}
        />
      ) : type === 'reward' ? (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          {items.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={{ ...reward, favorite: true }}
              onOpen={() => {}}
              onFavorite={() => remove(reward.id)}
              onRedeem={() => {}}
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-4 px-4 pb-6">
          {items.map((event) => (
            <li key={event.id}>
              <EventCard
                event={{ ...event, favorite: true, joined: false, joined_count: 0, capacity: 0 }}
                onOpen={() => {}}
                onRegister={() => {}}
                onFavorite={() => remove(event.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </MobileShell>
  );
}

/*
หน้าต่าง QR สำหรับรับของรางวัล

QR มีอายุสั้นและเซ็นกำกับจากเซิร์ฟเวอร์ ไม่ใช่การเอารหัสอ้างอิงมาแปลงเป็นรูปเฉย ๆ
รหัสอ้างอิงพิมพ์อยู่บนการ์ดอยู่แล้ว ใครถ่ายหน้าจอส่งต่อก็เอาไปรับของแทนได้
QR ที่หมดอายุในไม่กี่นาทีจึงบังคับให้เป็นเจ้าตัวเปิดแอปตอนนั้นจริง ๆ

หมดเวลาแล้วไม่ปิดหน้าต่างทิ้ง แต่ขอรหัสใหม่ให้เอง
คนที่ยืนต่อแถวอยู่ไม่ควรต้องย้อนกลับไปกดใหม่ตั้งแต่ต้น
*/
function RewardQrModal({ item, onClose }) {
  const { t } = useLanguage();
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [image, setImage] = useState('');
  const [left, setLeft] = useState(0);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!item) return;
    try {
      setError('');
      const data = await api.myRewardQr(item.id);
      setInfo(data);
      setLeft(data.expiresIn);
      setImage(await QRCode.toDataURL(data.token, { width: 520, margin: 1 }));
    } catch (err) {
      setError(err.message);
    }
  }, [item]);

  useEffect(() => {
    setInfo(null);
    setImage('');
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (left <= 0) return;
    const timer = setInterval(() => setLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [left]);

  useEffect(() => {
    if (left === 0 && info) refresh();
  }, [left, info, refresh]);

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(item.ref_code);
      toast(t('myRewards.copied'), 'primary');
    } catch {
      // เบราว์เซอร์บางตัวไม่ให้คัดลอกถ้าหน้าไม่ได้เปิดผ่าน https
      // รหัสยังอ่านได้ด้วยตาอยู่แล้ว จึงไม่ต้องขัดจังหวะผู้ใช้ด้วยข้อความแจ้งเตือน
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} size="sm">
      <div className="p-5">
        {/*
          หัวเรื่องเว้นที่ทางขวาไว้ให้ปุ่มปิดของ Modal ซึ่งลอยอยู่มุมขวาบนเสมอ

          เดิมแถบรหัสอ้างอิงเริ่มที่ขอบบนพอดี ปุ่มคัดลอกจึงไปซ้อนใต้ปุ่มปิด
          กดทีไรก็ลุ้นว่าจะได้คัดลอกหรือได้ปิดหน้าต่าง
        */}
        <div className="pr-10">
          <h2 className="text-base font-bold leading-snug text-ink">{t('myRewards.qrTitle')}</h2>
          <p className="mt-0.5 truncate text-2xs text-muted">{item?.name}</p>
        </div>

        {/* รหัสอ้างอิงอยู่เหนือ QR เพราะเป็นทางสำรองตอนกล้องเจ้าหน้าที่อ่านไม่ติด
            ให้เขาพิมพ์รหัสเข้าเครื่องสแกนได้เลยโดยไม่ต้องปิดหน้าต่างนี้ */}
        <div className="mt-4 flex items-center gap-3 rounded-card bg-page px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-2xs text-muted">{t('myRewards.refCode')}</p>
            <p className="truncate text-sm font-bold tabular-nums text-ink">{item?.ref_code}</p>
          </div>
          <button
            onClick={copyRef}
            className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-2xs font-semibold text-primary shadow-card"
          >
            <Icon.Copy size={16} />
            {t('myRewards.copy')}
          </button>
        </div>

        <div className="mt-3 rounded-card border border-line p-4 text-center">
          {error ? (
            <Notice>{error}</Notice>
          ) : !image ? (
            <Spinner />
          ) : (
            <img src={image} alt={t('myRewards.qrImageAlt')} className="mx-auto w-52 max-w-full" />
          )}

          {/* นับถอยหลังเป็นของจริง หมดแล้วระบบขอรหัสใหม่ให้เอง
              ปุ่มนี้ไว้กดเร่งเองตอนที่ไม่อยากรอให้ครบเวลา */}
          <button
            onClick={refresh}
            className="mx-auto mt-3 flex items-center gap-2 rounded-full bg-primary-wash px-3 py-1.5 text-primary-dark"
            aria-label={t('myRewards.qrExpired')}
          >
            <Icon.Refresh size={16} />
            <span className="text-sm font-bold tabular-nums">{countdown(left)}</span>
          </button>
          <p className="mt-1.5 text-2xs text-muted">{t('myRewards.qrExpiresIn')}</p>
        </div>

        <p className="mt-4 text-center text-sm leading-relaxed text-muted">
          {t('myRewards.qrHint')}
        </p>
      </div>
    </Modal>
  );
}

export function MyRewardsPage() {
  const { t, lang } = useLanguage();
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  useEffect(() => {
    setItems(null);
    api.myRewards(status).then(({ redemptions }) => setItems(redemptions));
  }, [status, lang]);

  return (
    <MobileShell title={t('myRewards.title')} back="/profile">
      <div className="flex justify-center px-4 py-4">
        <SegmentedToggle
          value={status}
          onChange={setStatus}
          options={[
            { value: 'pending', label: t('myRewards.pending') },
            { value: 'received', label: t('myRewards.received') },
          ]}
        />
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Icon.Gift}
          title={t('myRewards.empty')}
          hint={t('myRewards.emptyHint')}
          action={
            <Link to="/rewards" className="btn-primary">
              {t('myRewards.goEarn')}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3 px-4 pb-6">
          {items.map((item) => (
            <li key={item.id} className="card overflow-hidden">
              <div className="flex gap-3 p-3">
                <ImagePlaceholder src={item.image_url} className="h-24 w-24 shrink-0 rounded-[8px]" />

                <div className="min-w-0 flex-1">
                  <div className="flex justify-end">
                    <Badge className={item.status === 'received' ? 'bg-primary text-white' : 'bg-gold text-white'}>
                      {t(item.status === 'received' ? 'myRewards.statusReceived' : 'myRewards.statusPending')}
                    </Badge>
                  </div>

                  <p className="mt-1 font-semibold leading-snug text-ink">{item.name}</p>

                  {item.status === 'received' ? (
                    <>
                      <p className="mt-1 text-2xs text-muted">
                        {t('myRewards.receivedAt', { date: dateTime(item.received_at) })}
                      </p>
                      <p className="mt-1.5 text-sm text-slate">
                        {t('myRewards.used')} : <b className="text-gold">{num(item.points_used)}</b>{' '}
                        {t('common.points')}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-2xs text-muted">
                        {t('myRewards.redeemedAt', { date: dateTime(item.redeemed_at) })}
                      </p>

                      {/* รหัสอ้างอิงโชว์บนการ์ดเลย เจ้าหน้าที่ขอดูได้โดยไม่ต้องให้กดเปิด QR
                          และใช้เป็นทางสำรองเวลากล้องอ่าน QR ไม่ติด */}
                      <p className="mt-1 text-2xs font-semibold text-slate">
                        {t('myRewards.refCode')} :{' '}
                        <span className="tabular-nums font-normal">{item.ref_code}</span>
                      </p>

                      <p className="mt-1.5 text-sm text-slate">
                        {t('myRewards.used')} : <b className="text-gold">{num(item.points_used)}</b>{' '}
                        {t('common.points')}
                      </p>

                      <div className="mt-2 flex justify-end">
                        <button onClick={() => setQrFor(item)} className="btn-primary btn-sm">
                          {t('myRewards.showQr')}
                        </button>
                      </div>

                      <p className="mt-2 text-2xs leading-relaxed text-muted">
                        {t('myRewards.pickupHint')}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <RewardQrModal item={qrFor} onClose={() => setQrFor(null)} />
    </MobileShell>
  );
}
