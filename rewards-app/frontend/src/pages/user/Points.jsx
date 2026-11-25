import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Avatar, Badge, ChipBar, EmptyState, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { clockTime, groupByDay, num, signedPoints, thaiDate } from '../../lib/format';
import { tierCard, tierIcon } from '../../lib/tier';
import { useLanguage, useT } from '../../lib/i18n';
import { SpecialExpiryNote, SpecialPointIcon } from '../../components/SpecialPoints';

const SOURCE_ICON = {
  vote: Icon.Vote,
  event: Icon.Calendar,
  reward: Icon.Gift,
  store: Icon.Bag,
  system: Icon.History,
};

function TransactionRow({ tx, showStatus = false }) {
  const t = useT();
  const Ico = SOURCE_ICON[tx.source] || Icon.History;
  const positive = tx.points > 0;
  const special = tx.point_kind === 'special';

  return (
    <li className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 last:border-0">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-wash text-primary">
        <Ico size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{tx.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted">
          {clockTime(tx.created_at)}
          {showStatus && tx.redemption_status && (
            <Badge
              className={
                tx.redemption_status === 'received' ? 'bg-primary text-white' : 'bg-gold text-white'
              }
            >
              {t(tx.redemption_status === 'received' ? 'points.pickedUp' : 'points.waitingPickup')}
            </Badge>
          )}
        </p>
      </div>

      {/* ประวัติรวมสองกระเป๋าไว้ด้วยกัน จึงต้องมีไอคอนกำกับ
          ไม่งั้นผู้ใช้บวกเลขแล้วไม่ตรงกับยอดคงเหลือและคิดว่าระบบผิด */}
      <span
        className={`flex shrink-0 items-center gap-1 font-bold ${
          positive ? 'text-success' : 'text-danger'
        }`}
      >
        {special && <SpecialPointIcon size={16} />}
        {signedPoints(tx.points)} {special ? t('points.special') : t('common.points')}
      </span>
    </li>
  );
}

export function PointsPage() {
  const { t, lang } = useLanguage();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.points().then(setData);
  }, [lang]);

  if (!data) {
    return (
      <MobileShell title={t('points.title')} back="/profile">
        <Spinner />
      </MobileShell>
    );
  }

  const { user, recent, joinedCount, expiringPoints } = data;
  const TierIcon = tierIcon(user.tier_color);
  const theme = tierCard(user.tier_color);

  return (
    <MobileShell title={t('points.title')} back="/profile">
      <div className="space-y-4 px-4 py-4">
        <section className={`rounded-2xl p-5 text-center shadow-card ${theme.surface}`}>
          <div className="flex items-center gap-3 text-left">
            <Avatar name={user.display_name} size={44} />
            <div>
              <p className={`font-bold ${theme.title}`}>{user.display_name}</p>
              <p className={`mt-0.5 flex items-center gap-2 text-2xs ${theme.muted}`}>
                {t('points.id')} : {user.employee_code}
                <span>{t('points.level')} :</span>
                <Badge className={theme.badge}>
                  <TierIcon size={12} /> <span className="ml-1">{user.tier}</span>
                </Badge>
              </p>
            </div>
          </div>

          <p className={`mt-4 text-[28px] font-bold leading-none ${theme.value}`}>
            {num(user.points)} <span className="text-xl">{t('common.points')}</span>
          </p>
          <p className={`mt-2 text-2xs ${theme.muted}`}>
            {t('points.expireAt', { date: user.points_expire_at ? thaiDate(user.points_expire_at) : '-' })}
          </p>

          {/* คะแนนพิเศษ — วางเป็นบรรทัดเดียวบนพื้นการ์ดเดิม ไม่ใส่กล่องพื้นหลังทับ
              เพราะกล่องสีอ่อนบนการ์ดสีเข้มจะกลายเป็นแถบเทาที่แย่งสายตาจากคะแนนหลัก
              คั่นด้วยเส้นบาง ๆ แทน บอกได้ว่าเป็นคนละกระเป๋าโดยไม่ตัดการ์ดเป็นสองท่อน */}
          <div className={`mt-4 border-t pt-4 ${theme.divider}`}>
            <div className="flex items-center justify-center gap-2">
              <SpecialPointIcon size={26} />
              <span className={`text-xl font-bold leading-none ${theme.value}`}>
                {num(user.special_points || 0)}
              </span>
              <span className={`text-sm ${theme.muted}`}>{t('points.special')}</span>
            </div>

            {/* คะแนนพิเศษหมดอายุแล้วถูกตัดเหลือ 0 ทั้งก้อน จึงต้องบอกวันหมดอายุไว้ตรงนี้เสมอ
                ไม่ใช่ปล่อยให้รู้ตัวอีกทีตอนยอดกลายเป็นศูนย์ */}
            <SpecialExpiryNote user={user} theme={theme} />
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-sm text-slate">{t('points.joinedCount')}</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-primary">
              <span className="text-muted">
                <Icon.Calendar size={20} />
              </span>
              {joinedCount}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-slate">{t('points.expiring')}</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-gold">
              <span className="text-muted">
                <Icon.Hourglass size={20} />
              </span>
              {num(expiringPoints)}
            </p>
          </div>
        </div>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <span className="text-primary">
                <Icon.History size={18} />
              </span>
              {t('points.recent')}
            </h2>
            <Link to="/points/history" className="flex items-center text-sm text-primary">
              {t('common.seeAll')} <Icon.Next size={14} />
            </Link>
          </div>

          {recent.length === 0 ? (
            <EmptyState icon={Icon.History} title={t('points.recentEmpty')} />
          ) : (
            <ul className="card overflow-hidden">
              {recent.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </MobileShell>
  );
}

const FILTERS = [
  { value: 'all', key: 'common.all' },
  { value: 'redeem', key: 'points.filterRedeem' },
  { value: 'earn', key: 'points.filterEarn' },
  { value: 'spend', key: 'points.filterSpend' },
];

export function PointsHistoryPage() {
  const { t, lang } = useLanguage();
  const [filter, setFilter] = useState('all');
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    setTransactions(null);
    api.pointsHistory(filter).then(({ transactions }) => setTransactions(transactions));
  }, [filter, lang]);

  return (
    <MobileShell title={t('points.historyTitle')} back="/points">
      <div className="px-4 py-4">
        <ChipBar
          options={FILTERS.map((f) => ({ value: f.value, label: t(f.key) }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {!transactions ? (
        <Spinner />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Icon.History}
          title={t('points.historyEmpty')}
          hint={t('points.historyEmptyHint')}
        />
      ) : (
        <div className="space-y-4 px-4 pb-6">
          {groupByDay(transactions).map((group) => (
            <section key={group.date.toISOString()}>
              <h2 className="mb-2 text-sm text-muted">{thaiDate(group.date)}</h2>
              <ul className="card overflow-hidden">
                {group.items.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} showStatus />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
