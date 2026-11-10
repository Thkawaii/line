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
  SegmentedToggle,
  Spinner,
  useToast,
} from '../../components/ui';
import { Icon } from '../../components/icons';
import { countdown, dateTime, num } from '../../lib/format';
import { useT } from '../../lib/i18n';

export function FavoritesPage() {
  const toast = useToast();
  const t = useT();
  const [type, setType] = useState('reward');
  const [items, setItems] = useState(null);

  const load = useCallback(() => {
    setItems(null);
    api.favorites(type).then(({ items }) => setItems(items));
  }, [type]);

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

export function MyRewardsPage() {
  const t = useT();
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState(null);
  const [qrFor, setQrFor] = useState(null);
  const [qrImage, setQrImage] = useState('');
  const [left, setLeft] = useState(0);

  useEffect(() => {
    setItems(null);
    api.myRewards(status).then(({ redemptions }) => setItems(redemptions));
  }, [status]);

  async function openQr(item) {
    setQrFor(item);
    setLeft(900);
    setQrImage(await QRCode.toDataURL(item.ref_code, { width: 520, margin: 1 }));
  }

  useEffect(() => {
    if (!qrFor || left <= 0) return;
    const timer = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [qrFor, left]);

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
                      <p className="mt-1.5 text-2xs text-slate">
                        {t('myRewards.refCode')} : <b>{item.ref_code}</b>
                      </p>
                      <div className="mt-2 flex justify-end">
                        <button onClick={() => openQr(item)} className="btn-primary btn-sm">
                          {t('myRewards.qrButton')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!qrFor} onClose={() => setQrFor(null)} size="sm">
        {qrFor && (
          <div className="p-5">
            <div className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2.5">
              <span className="flex-1 text-sm text-slate">
                {t('myRewards.refCode')} : <b className="text-ink">{qrFor.ref_code}</b>
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(qrFor.ref_code)}
                className="text-muted"
                aria-label={t('myRewards.copyRefCode')}
              >
                <Icon.Copy size={20} />
              </button>
            </div>

            <div className="mt-4 rounded-card bg-white p-4 text-center shadow-card">
              <img src={qrImage} alt={t('myRewards.qrImageAlt')} className="mx-auto w-52 max-w-full" />
              <p className="mt-3 flex items-center justify-center gap-2 text-primary">
                <Icon.Refresh size={18} />
                <span className="font-semibold tabular-nums">{countdown(left)}</span>
              </p>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate">
              {t('myRewards.qrHint')}
            </p>
          </div>
        )}
      </Modal>
    </MobileShell>
  );
}
