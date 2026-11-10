import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { Avatar, Badge, ChipBar, EmptyState, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { clockTime, groupByDay, num, signedPoints, thaiDate } from '../../lib/format';

const SOURCE_ICON = {
  vote: Icon.Vote,
  event: Icon.Calendar,
  reward: Icon.Gift,
  store: Icon.Bag,
  system: Icon.History,
};

function TransactionRow({ tx, showStatus = false }) {
  const Ico = SOURCE_ICON[tx.source] || Icon.History;
  const positive = tx.points > 0;

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
              {tx.redemption_status === 'received' ? 'รับสินค้าแล้ว' : 'รอรับสินค้า'}
            </Badge>
          )}
        </p>
      </div>

      <span className={`shrink-0 font-bold ${positive ? 'text-success' : 'text-danger'}`}>
        {signedPoints(tx.points)} คะแนน
      </span>
    </li>
  );
}

export function PointsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.points().then(setData);
  }, []);

  if (!data) {
    return (
      <MobileShell title="คะแนนของฉัน" back="/profile">
        <Spinner />
      </MobileShell>
    );
  }

  const { user, recent, joinedCount, expiringPoints } = data;

  return (
    <MobileShell title="คะแนนของฉัน" back="/profile">
      <div className="space-y-4 px-4 py-4">
        <section className="rounded-2xl bg-gradient-to-br from-[#EAF4F8] to-[#DCEDF4] p-5 text-center shadow-card">
          <div className="flex items-center gap-3 text-left">
            <Avatar name={user.display_name} size={44} />
            <div>
              <p className="font-bold text-ink">{user.display_name}</p>
              <p className="mt-0.5 flex items-center gap-2 text-2xs text-muted">
                ID : {user.employee_code}
                <span>ระดับ :</span>
                <Badge className="bg-white text-slate">
                  <Icon.Star size={11} /> <span className="ml-1">{user.tier}</span>
                </Badge>
              </p>
            </div>
          </div>

          <p className="mt-4 text-[28px] font-bold leading-none text-primary">
            {num(user.points)} <span className="text-xl">คะแนน</span>
          </p>
          <p className="mt-2 text-2xs text-muted">
            คะแนนหมดอายุ : {user.points_expire_at ? thaiDate(user.points_expire_at) : '-'}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-sm text-slate">กิจกรรมที่เข้าร่วม</p>
            <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-primary">
              <span className="text-muted">
                <Icon.Calendar size={20} />
              </span>
              {joinedCount}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-slate">คะแนนใกล้หมดอายุ</p>
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
              ประวัติรายการล่าสุด
            </h2>
            <Link to="/points/history" className="flex items-center text-sm text-primary">
              ดูทั้งหมด <Icon.Next size={14} />
            </Link>
          </div>

          {recent.length === 0 ? (
            <EmptyState icon={Icon.History} title="ยังไม่มีรายการทำธุรกรรมล่าสุด" />
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
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'redeem', label: 'แลกรางวัล' },
  { value: 'earn', label: 'ได้รับคะแนน' },
  { value: 'spend', label: 'ใช้คะแนน' },
];

export function PointsHistoryPage() {
  const [filter, setFilter] = useState('all');
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    setTransactions(null);
    api.pointsHistory(filter).then(({ transactions }) => setTransactions(transactions));
  }, [filter]);

  return (
    <MobileShell title="ประวัติคะแนน" back="/points">
      <div className="px-4 py-4">
        <ChipBar options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {!transactions ? (
        <Spinner />
      ) : transactions.length === 0 ? (
        <EmptyState
          icon={Icon.History}
          title="ยังไม่มีประวัติการทำรายการ"
          hint={'ประวัติการสะสมและใช้คะแนนของ\nคุณจะแสดงที่นี่'}
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
