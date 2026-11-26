import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import PolicyBody from '../../components/PolicyBody';
import { ChipBar, EmptyState, Notice, Spinner } from '../../components/ui';
import { Icon } from '../../components/icons';
import { thaiDate } from '../../lib/format';

/*
ประชาสัมพันธ์ฝั่งพนักงาน

เปิดจากเมนูใน LINE ได้โดยตรง กดแล้วเข้าสู่ระบบด้วยบัญชีเดิม แล้วเด้งมาที่หน้านี้
อ่านข่าวหรือดูวิดีโอจนครบเงื่อนไขแล้วได้คะแนนอัตโนมัติ ไม่ต้องกดปุ่มรับคะแนน

คะแนนที่ได้คือคะแนน K-POINT ก้อนเดียวกับกิจกรรม ไม่ใช่กระเป๋าแยก
*/

const TABS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'news', label: 'ข่าวสาร' },
  { value: 'announce', label: 'ประกาศ' },
  { value: 'video', label: 'วิดีโอ' },
];

const KIND_BADGE = {
  video: { label: 'วิดีโอ', className: 'bg-primary text-white' },
  image: { label: 'รูปภาพ', className: 'bg-[#2D4FA0] text-white' },
  text: { label: 'ข้อความ', className: 'bg-slate text-white' },
};

const CATEGORY_BADGE = {
  news: { label: 'ข่าวสาร', className: 'bg-primary text-white' },
  announce: { label: 'ประกาศ', className: 'bg-[#2D4FA0] text-white' },
};

// ป้ายบนรูป: วิดีโอเด่นกว่าหมวด เพราะเป็นสิ่งที่บอกว่าต้องดูไม่ใช่อ่าน
function badgeOf(item) {
  if (item.kind === 'video') return KIND_BADGE.video;
  return CATEGORY_BADGE[item.category] || CATEGORY_BADGE.news;
}

function matchesTab(item, tab) {
  if (tab === 'all') return true;
  if (tab === 'video') return item.kind === 'video';
  return item.category === tab;
}

/* ---------- หน้ารายการ ---------- */

export function PrListPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .pr()
      .then(({ items }) => setData(items || []))
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <MobileShell title="ประชาสัมพันธ์" back="/">
        <div className="p-4">
          <Notice tone="error">{error}</Notice>
        </div>
      </MobileShell>
    );
  }
  if (!data) {
    return (
      <MobileShell title="ประชาสัมพันธ์" back="/">
        <Spinner />
      </MobileShell>
    );
  }

  const shown = data.filter((item) => matchesTab(item, tab));

  return (
    <MobileShell title="ประชาสัมพันธ์" back="/">
      <div className="space-y-4 p-4">
        <ChipBar options={TABS} value={tab} onChange={setTab} />

        {shown.length === 0 ? (
          <EmptyState icon={Icon.Megaphone} title="ยังไม่มีเรื่องในหมวดนี้" />
        ) : (
          <ul className="space-y-3">
            {shown.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => navigate(`/pr/${item.id}`)}
                  className="card w-full overflow-hidden text-left"
                >
                  <Cover item={item} />

                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <p className="line-clamp-2 min-w-0 flex-1 font-semibold leading-snug text-ink">
                        {item.title}
                      </p>
                      <span className="mt-0.5 shrink-0 text-muted">
                        <Icon.Next size={18} />
                      </span>
                    </div>

                    <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-muted">
                      <Icon.Calendar size={12} />
                      {thaiDate(item.starts_at || item.created_at)}
                    </p>

                    {item.points > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <RewardChip item={item} />
                        <ProgressChip item={item} />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobileShell>
  );
}

/*
ความคืบหน้าของเรื่องหนึ่งชิ้น คิดเป็นเปอร์เซ็นต์ของสิ่งที่ต้องทำให้ครบ

วิดีโอเทียบกับจำนวนวินาทีที่ต้องดู (ความยาวคลิป × เปอร์เซ็นต์ที่ตั้งไว้)
ข้อความและรูปภาพเทียบกับเวลาอ่านที่ตั้งไว้

ตัวเลขนี้ใช้แสดงผลอย่างเดียว การตัดสินว่าครบเงื่อนไขหรือยังเป็นของเซิร์ฟเวอร์
*/
function percentOf(item) {
  if (item.awarded) return 100;

  if (item.kind === 'video') {
    const need = Math.round(((item.video_seconds || 0) * (item.watch_percent || 0)) / 100);
    if (need <= 0) return 0;
    return Math.min(100, Math.round(((item.watched_seconds || 0) / need) * 100));
  }

  const need = item.read_seconds || 0;
  if (need <= 0) return 0;
  return Math.min(100, Math.round(((item.progress || 0) / need) * 100));
}

// รูปหน้าปก วิดีโอขึ้นปุ่มเล่นทับไว้ให้รู้ว่าต้องดู ไม่ใช่อ่าน
function Cover({ item }) {
  const badge = badgeOf(item);
  const cover = item.image_url;
  const percent = percentOf(item);

  return (
    <div className="relative aspect-[16/9] bg-page">
      {cover ? (
        <img src={cover} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-line">
          <Icon.Megaphone size={40} />
        </div>
      )}

      {item.kind === 'video' && (
        <span className="absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white">
            <Icon.Play size={22} />
          </span>
        </span>
      )}

      <span
        className={`absolute left-2 top-2 rounded-pill px-2.5 py-1 text-2xs font-semibold ${badge.className}`}
      >
        {badge.label}
      </span>

      {/*
        ป้ายรับคะแนนแล้ว เป็นป้ายพื้นขาวมีคำกำกับ ไม่ใช่วงกลมทึบลอยอยู่มุมรูป
        วงกลมทึบทับรูปหน้าปกแล้วอ่านไม่ออกว่าหมายถึงอะไร

        ใช้สีเขียวน้ำทะเลของธีม ไม่ใช่สีเขียวแจ้งสำเร็จ เพราะอยู่บนการ์ดเดียวกับ
        ป้ายหมวดสีเดียวกัน แยกกันด้วยพื้นขาวสลับกับพื้นทึบแทน
      */}
      {item.awarded && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-pill bg-white px-2 py-1 text-2xs font-semibold text-primary shadow-card ring-1 ring-primary/25">
          <span className="grid h-4 w-4 place-items-center rounded-full bg-primary text-white">
            <Icon.Check size={11} />
          </span>
          รับคะแนนแล้ว
        </span>
      )}

      {/* แถบความคืบหน้าพาดท้ายรูป บอกว่าอ่านหรือดูไปแล้วเท่าไหร่โดยไม่กินพื้นที่การ์ด */}
      {!item.awarded && percent > 0 && (
        <span className="absolute inset-x-0 bottom-0 block h-1.5 bg-ink/25">
          <span
            className="block h-full rounded-r-pill bg-primary transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </div>
  );
}

// ป้ายบอกว่าอ่านหรือดูไปแล้วกี่เปอร์เซ็นต์ ไม่ขึ้นถ้ายังไม่เคยเปิด
function ProgressChip({ item }) {
  const percent = percentOf(item);
  if (item.awarded || percent <= 0) return null;

  return (
    <span className="inline-flex items-center rounded-pill bg-primary-wash px-2.5 py-1 text-2xs font-semibold text-primary">
      {item.kind === 'video' ? 'ดูแล้ว' : 'อ่านแล้ว'} {percent}%
    </span>
  );
}

/*
ป้ายคะแนนใต้วันที่ ทั้งสองสถานะอยู่ในโทนเขียวน้ำทะเลของธีม

ยังไม่ได้รับ  พื้นขาว ขอบสีธีม ตัวหนังสือเขียวน้ำทะเลเข้ม เหรียญกลมทึบสีธีม
รับไปแล้ว     พื้นอ่อนของธีม ตัวหนังสือสีธีม วงกลมติ๊กถูกทึบ

แยกสองสถานะด้วยขอบคู่กับพื้น ไม่ใช่สองสีต่างวงศ์
ยังไม่ได้รับเป็นป้ายโปร่งมีขอบ รับแล้วเป็นป้ายพื้นทึบอ่อน ต่างกันชัดตั้งแต่เหลือบมอง

เหรียญกลมทึบสีธีมเป็นจุดสีเดียวของป้าย ทำให้ป้ายเบาแต่ไม่จางหายไปกับพื้นการ์ด
*/
function RewardChip({ item }) {
  if (item.awarded) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-pill bg-primary-wash py-1 pl-1 pr-3 text-2xs font-semibold text-primary ring-1 ring-primary/25">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
          <Icon.Check size={12} />
        </span>
        ได้รับ <b className="text-xs leading-none">{item.earned_points}</b> คะแนนแล้ว
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-white py-1 pl-1 pr-3 text-2xs font-semibold text-[#0B7E82] ring-2 ring-primary/45">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
        <Icon.StarSparkle size={11} />
      </span>
      {item.kind === 'video' ? 'รับชมคลิปครบ' : 'อ่านครบ'} รับ{' '}
      <b className="text-xs leading-none">{item.points}</b> คะแนน
    </span>
  );
}

/* ---------- หน้าอ่าน ---------- */

export function PrDetailPage() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState({ eligible: false, reason: '', watched: 0, need: 0 });
  const [result, setResult] = useState(null); // { points } เมื่อเพิ่งรับคะแนนสำเร็จ
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    setItem(null);
    setStatus({ eligible: false, reason: '', watched: 0, need: 0 });
    api
      .prItem(id)
      .then((res) => {
        setItem(res.item);
        /*
          รับสภาพการอ่านที่เซิร์ฟเวอร์จำไว้มาตั้งแต่ตอนเปิดหน้า

          ของเดิมรอให้หน้าเว็บนับเองแล้วรายงานเข้าไปก่อนถึงจะรู้สถานะ
          คนที่อ่านครบแล้วแต่ลืมกดรับคะแนน พอกลับเข้ามาใหม่จึงเห็นว่าเริ่มนับหนึ่งใหม่
          ทั้งที่เซิร์ฟเวอร์ยังจำไว้ครบ
        */
        setStatus({
          eligible: !!res.eligible,
          reason: res.reason || '',
          watched: res.watched || 0,
          need: res.need || 0,
        });
      })
      .catch((err) => setError(err.message));
  }, [id]);

  /*
    ส่งความคืบหน้าให้เซิร์ฟเวอร์บันทึก แล้วรับกลับมาว่าครบเงื่อนไขหรือยัง

    หน้าเว็บไม่ตัดสินเองว่าครบแล้ว เพราะเงื่อนไขที่ตัดสินในเบราว์เซอร์แก้ได้ด้วย console
    หน้าที่ของหน้าเว็บคือรายงานสิ่งที่เกิดขึ้น ส่วนการตัดสินและการจ่ายคะแนน
    เป็นเรื่องของเซิร์ฟเวอร์ทั้งหมด
  */
  const report = useCallback(
    async (payload) => {
      try {
        const res = await api.prProgress(id, payload);
        setStatus({
          eligible: !!res.eligible,
          reason: res.reason || '',
          watched: res.watched || 0,
          need: res.need || 0,
        });
        return res;
      } catch (err) {
        setError(err.message);
        return null;
      }
    },
    [id]
  );

  async function claim() {
    setClaiming(true);
    try {
      const res = await api.prClaim(id);
      if (res.alreadyAwarded) setItem((prev) => ({ ...prev, awarded: true, earned_points: res.points }));
      else setResult({ points: res.points });
    } catch (err) {
      setError(err.message);
      setClaiming(false);
    }
  }

  if (error) {
    return (
      <MobileShell title="ประชาสัมพันธ์" back="/pr">
        <div className="p-4">
          <Notice tone="error">{error}</Notice>
        </div>
      </MobileShell>
    );
  }
  if (!item) {
    return (
      <MobileShell title="ประชาสัมพันธ์" back="/pr">
        <Spinner />
      </MobileShell>
    );
  }

  if (result) return <PrReward points={result.points} />;

  const claimBar = (
    <ClaimBar item={item} status={status} busy={claiming} onClaim={claim} />
  );

  return (
    <MobileShell title={item.title} back="/pr">
      {item.kind === 'video' ? (
        <VideoReader item={item} report={report} status={status} claimBar={claimBar} />
      ) : (
        <TextReader item={item} report={report} claimBar={claimBar} />
      )}
    </MobileShell>
  );
}

/*
แถบรับคะแนนท้ายหน้า

ปุ่มขึ้นเมื่อเซิร์ฟเวอร์บอกว่าครบเงื่อนไขแล้วเท่านั้น
ก่อนหน้านั้นเป็นข้อความบอกว่ายังเหลืออะไร ไม่ใช่ปุ่มที่กดแล้วขึ้น error

ของเดิมจ่ายคะแนนให้เองทันทีที่ถึงเกณฑ์แล้วเด้งหน้ารับคะแนนขึ้นมาทับ
คนที่ดูคลิปอยู่จึงถูกขัดจังหวะตั้งแต่ยังดูไม่จบ และไม่มีใครดูส่วนที่เหลือ
*/
function ClaimBar({ item, status, busy, onClaim }) {
  if (item.points <= 0) return null;

  /*
    แถบรับคะแนนแล้ว

    ของเดิมเป็นพื้นทึบไล่สีเข้ม ตัวหนังสือขาวบนพื้นนั้นอ่านยาก โดยเฉพาะบรรทัดรอง
    เปลี่ยนเป็นพื้นอ่อนของธีมแล้วใช้ตัวหนังสือสีเข้มแทน ความต่างของสีจึงสูงขึ้นมาก
    ส่วนที่ต้องเด่นคือจำนวนคะแนน ย้ายไปอยู่ในป้ายทึบด้านขวาแทน
  */
  if (item.awarded) {
    return (
      <div className="flex items-center gap-3 rounded-card bg-gradient-to-br from-primary-wash to-[#F4FCF8] p-4 ring-1 ring-primary-soft">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white shadow-card">
          <Icon.Check size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug text-ink">รับคะแนนเรียบร้อยแล้ว</p>
          <p className="mt-0.5 text-2xs text-slate">เข้าบัญชี K-POINT ของคุณแล้ว</p>
        </div>
        <span className="shrink-0 rounded-pill bg-primary px-2.5 py-1 text-2xs font-bold text-white">
          +{item.earned_points} คะแนน
        </span>
      </div>
    );
  }

  // ยังไม่ครบเงื่อนไขก็ไม่ต้องขึ้นอะไร วงกลมความคืบหน้าด้านบนบอกอยู่แล้วว่าเหลืออีกเท่าไหร่
  if (!status.eligible) return null;

  return (
    <button onClick={onClaim} disabled={busy} className="btn-primary w-full">
      <Icon.Gift size={18} /> รับ {item.points} คะแนน
    </button>
  );
}

/*
อ่านข้อความหรือดูรูป นับเวลาที่เปิดค้างไว้

นับเฉพาะตอนที่แท็บยังเปิดอยู่ ถ้าสลับไปแอปอื่นแล้วเวลายังเดิน
ก็เท่ากับเปิดทิ้งไว้แล้วไปทำอย่างอื่นก็ได้คะแนน ซึ่งไม่ใช่การอ่าน
*/
function TextReader({ item, report, claimBar }) {
  const need = item.read_seconds || 0;
  // เริ่มนับต่อจากที่เซิร์ฟเวอร์จำไว้ ไม่ใช่เริ่มที่ศูนย์ทุกครั้งที่เปิดหน้า
  const [seconds, setSeconds] = useState(item.progress || 0);
  const done = item.awarded || item.points <= 0;

  useEffect(() => {
    if (done) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [done]);

  // ส่งทุกห้าวินาทีระหว่างทาง เผื่อปิดหน้าไปก่อน ความคืบหน้าจะได้ไม่หายทั้งหมด
  useEffect(() => {
    if (done || seconds === 0) return;
    if (seconds >= need || seconds % 5 === 0) report({ progress: seconds });
  }, [seconds, need, done, report]);

  const percent = need > 0 ? Math.min(100, Math.round((seconds / need) * 100)) : 100;

  return (
    <div className="space-y-4 p-4">
      {item.image_url && (
        <img src={item.image_url} alt="" className="w-full rounded-card border border-line" />
      )}

      <div>
        <h1 className="text-lg font-bold leading-snug text-ink">{item.title}</h1>
        <p className="mt-1 text-2xs text-muted">{thaiDate(item.starts_at || item.created_at)}</p>
      </div>

      {item.body && <PolicyBody content={item.body} />}

      {item.link_url && (
        <a href={item.link_url} target="_blank" rel="noreferrer" className="btn-ghost w-full">
          {item.link_label || 'เปิดลิงก์ที่แนบมา'}
        </a>
      )}
      {item.file_url && (
        <a href={item.file_url} target="_blank" rel="noreferrer" className="btn-ghost w-full">
          {item.file_name || 'เปิดไฟล์แนบ'}
        </a>
      )}

      {!done && item.points > 0 && (
        <div className="card p-4">
          <div className="h-2 overflow-hidden rounded-pill bg-page">
            <div
              className="h-full rounded-pill bg-primary transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2.5 text-center text-sm text-slate">
            เปิดอ่านแล้ว {seconds} จาก {need} วินาที
          </p>
        </div>
      )}

      {claimBar}
    </div>
  );
}

/*
นาฬิกาจับเวลาที่ "ดูจริง"

รับตำแหน่งปัจจุบันของคลิปมาเรื่อย ๆ แล้วบวกสะสมเฉพาะช่วงที่ขยับทีละน้อย
แบบการเล่นปกติ ถ้ากระโดดทีเดียวหลายวินาทีแปลว่าลากแถบข้าม จะไม่นับช่วงนั้น

เพดาน 2 วินาทีต่อหนึ่งก้าว รองรับการเปิดเร่งความเร็วสองเท่า
และรองรับจังหวะที่เบราว์เซอร์แจ้งเวลาช้ากว่าปกติเล็กน้อย

ย้อนกลับไปดูซ้ำไม่ถูกนับเพิ่ม เพราะเป็นเนื้อหาที่ดูไปแล้ว
*/
function useWatchClock(initial = 0) {
  const watched = useRef(initial);
  const last = useRef(null);

  const tick = useCallback((currentTime) => {
    const previous = last.current;
    last.current = currentTime;
    if (previous === null) return watched.current;

    const step = currentTime - previous;
    if (step > 0 && step <= 2) watched.current += step;
    return watched.current;
  }, []);

  const reset = useCallback(() => {
    last.current = null;
  }, []);

  return { tick, reset, seconds: () => Math.floor(watched.current) };
}

/*
ดูวิดีโอ นับวินาทีที่คลิปเล่นไปจริง

ของเดิมนับจากตำแหน่งที่เลื่อนไปถึงไกลที่สุด การลากแถบไปท้ายคลิปครั้งเดียว
จึงทำให้ความคืบหน้าขึ้นเป็น 100% ทันทีทั้งที่ไม่ได้ดูอะไรเลย
*/
function VideoReader({ item, report, status, claimBar }) {
  // วินาทีที่ดูไปแล้วจากครั้งก่อน นับต่อจากตรงนั้น ไม่ใช่เริ่มนับหนึ่งใหม่
  const saved = item.watched_seconds || 0;
  const clock = useWatchClock(saved);
  const [shown, setShown] = useState(saved); // วินาทีที่ดูแล้ว สำหรับแสดงผล
  const [duration, setDuration] = useState(item.video_seconds || 0);
  const sentRef = useRef(saved);
  const done = item.awarded || item.points <= 0;

  const youtubeID = item.video_kind === 'youtube' ? youtubeId(item.video_url) : '';
  const needSeconds = status.need || Math.round((duration * (item.watch_percent || 90)) / 100);

  /*
    ส่งความคืบหน้าขึ้นเซิร์ฟเวอร์ทุกห้าวินาทีของการดูจริง

    ไม่ส่งทุกจังหวะที่เวลาขยับ เพราะ timeupdate ยิงราวสี่ครั้งต่อวินาที
    จะกลายเป็นยิงคำขอรัว ๆ ตลอดเวลาที่ดูคลิป
  */
  const push = useCallback(
    (seconds, extra = {}) => {
      if (done) return;
      if (seconds - sentRef.current < 5 && !extra.force) return;
      sentRef.current = seconds;
      report({ watchedSeconds: seconds, ...extra });
    },
    [done, report]
  );

  function onTimeUpdate(event) {
    const video = event.currentTarget;
    const total = video.duration || 0;
    if (!total) return;

    const seconds = Math.floor(clock.tick(video.currentTime));
    setShown(seconds);
    push(seconds, { progress: Math.min(100, Math.round((seconds / total) * 100)) });
  }

  return (
    <div className="space-y-4 p-4">
      <div className="overflow-hidden rounded-card border border-line bg-black">
        {youtubeID ? (
          <YouTubePlayer
            videoId={youtubeID}
            onReady={(total) => {
              setDuration(total);
              report({ videoSeconds: Math.round(total), watchedSeconds: clock.seconds() });
            }}
            onTime={(currentTime, total) => {
              const seconds = Math.floor(clock.tick(currentTime));
              setShown(seconds);
              push(seconds, { progress: total ? Math.min(100, Math.round((seconds / total) * 100)) : 0 });
            }}
            onSeek={clock.reset}
          />
        ) : (
          <video
            className="aspect-video w-full"
            src={item.video_url}
            controls
            playsInline
            onLoadedMetadata={(e) => {
              const total = Math.round(e.currentTarget.duration || 0);
              setDuration(total);
              if (total > 0) report({ videoSeconds: total, watchedSeconds: clock.seconds() });
            }}
            onSeeking={clock.reset}
            onTimeUpdate={onTimeUpdate}
            onPause={() => push(clock.seconds(), { force: true })}
            onEnded={() => push(clock.seconds(), { force: true })}
          />
        )}
      </div>

      <div>
        <h1 className="text-lg font-bold leading-snug text-ink">{item.title}</h1>
        <p className="mt-1 text-2xs text-muted">{thaiDate(item.starts_at || item.created_at)}</p>
      </div>

      {item.body && <PolicyBody content={item.body} />}

      {!done && item.points > 0 && (
        <WatchProgress
          watched={Math.max(shown, status.watched)}
          need={needSeconds}
          percent={item.watch_percent}
        />
      )}

      {claimBar}
    </div>
  );
}

/*
ตัวเล่นคลิป YouTube ที่นับการรับชมได้จริง

iframe เปล่า ๆ อ่านไม่ได้ว่าดูไปถึงไหนแล้ว จึงใช้ IFrame Player API ของ YouTube
ซึ่งบอกตำแหน่งปัจจุบันและความยาวคลิปได้ นับแบบเดียวกับคลิปที่อัปโหลดเอง

ฟังก์ชันที่ส่งเข้ามาเก็บไว้ใน ref ไม่ใช่ใส่ไว้ในรายการที่ useEffect เฝ้าดู

เหตุผลคือหน้าที่เรียกใช้ส่งฟังก์ชันแบบเขียนสดเข้ามา ซึ่งเป็นคนละตัวกันทุกครั้งที่วาดใหม่
ถ้าเอาไปใส่ในรายการเฝ้าดู ทุกครั้งที่เวลาเดินแล้ว setState ตัวเล่นจะถูกทำลายและสร้างใหม่
วนแบบนั้นไปเรื่อย ๆ จนไม่มีโอกาสขึ้นจอเลย เห็นเป็นกล่องดำ ซึ่งเป็นอาการที่เจอจริง

ตัวเล่นจึงผูกกับรหัสคลิปอย่างเดียว สร้างครั้งเดียวแล้วอยู่ยาว
*/
function YouTubePlayer({ videoId, onReady, onTime, onSeek }) {
  const holder = useRef(null);
  const player = useRef(null);
  const previous = useRef(0);

  // เก็บฟังก์ชันล่าสุดไว้ ตัวเล่นเรียกผ่าน ref จึงได้ของใหม่เสมอโดยไม่ต้องสร้างตัวเล่นใหม่
  const handlers = useRef({ onReady, onTime, onSeek });
  handlers.current = { onReady, onTime, onSeek };

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    function create() {
      if (cancelled || !holder.current || !window.YT?.Player) return;

      /*
        YouTube จะแทนที่ element ที่ชี้ให้ด้วย iframe ของเขาเอง
        คลาสที่ใส่ไว้บน element นั้นจึงหายไปด้วย ต้องบอกขนาดผ่าน width/height ตรงนี้
        ไม่งั้นได้ iframe ขนาด 640x390 ตายตัวที่ล้นกรอบบนจอมือถือ
      */
      player.current = new window.YT.Player(holder.current, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
        events: {
          onReady: (e) => {
            e.target.getIframe?.()?.setAttribute('style', 'width:100%;height:100%;border:0');
            handlers.current.onReady?.(e.target.getDuration() || 0);
          },
          onStateChange: (e) => {
            // 1 = กำลังเล่น จับเวลาเฉพาะตอนเล่น หยุดเมื่อพัก
            if (e.data === window.YT.PlayerState.PLAYING) {
              clearInterval(timer);
              timer = setInterval(() => {
                const p = player.current;
                if (!p?.getCurrentTime) return;

                const now = p.getCurrentTime();
                // กระโดดเกินสองวินาทีแปลว่าลากแถบ ไม่ใช่การเล่นต่อเนื่อง
                if (Math.abs(now - previous.current) > 2) handlers.current.onSeek?.();
                previous.current = now;
                handlers.current.onTime?.(now, p.getDuration?.() || 0);
              }, 500);
            } else {
              clearInterval(timer);
            }
          },
        },
      });
    }

    if (window.YT?.Player) {
      create();
    } else {
      // โหลดสคริปต์ครั้งเดียว ถ้ามีคลิปหลายตัวจะใช้ตัวที่โหลดไว้แล้ว
      if (!document.getElementById('youtube-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'youtube-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      const before = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        before?.();
        create();
      };
    }

    return () => {
      cancelled = true;
      clearInterval(timer);
      player.current?.destroy?.();
      player.current = null;
    };
  }, [videoId]);

  return (
    <div className="aspect-video w-full">
      <div ref={holder} className="h-full w-full" />
    </div>
  );
}

// วงกลมบอกว่าดูจริงไปแล้วกี่วินาที จากที่ต้องดูกี่วินาที
function WatchProgress({ watched, need, percent }) {
  const size = 72;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = need > 0 ? Math.min(1, watched / need) : 0;

  return (
    <div className="card flex items-center gap-4 p-4">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-page" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="stroke-primary transition-all duration-500"
        />
      </svg>

      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-ink">{Math.round(ratio * 100)}%</p>
        <p className="mt-1.5 text-sm leading-snug text-slate">
          กรุณารับชมให้ครบอย่างน้อย {percent}% ของวิดีโอ
        </p>
      </div>
    </div>
  );
}

// ดึงรหัสคลิปจากลิงก์ YouTube ได้ทั้งแบบเต็มและแบบย่อ
function youtubeId(url = '') {
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/
  );
  return m ? m[1] : '';
}

/* ---------- จอรับคะแนนสำเร็จ ---------- */

function PrReward({ points }) {
  const navigate = useNavigate();

  return (
    <MobileShell title="ประชาสัมพันธ์" back="/pr">
      <div className="relative overflow-hidden px-6 py-10 text-center">
        <Confetti />

        <span className="relative mx-auto grid h-24 w-24 place-items-center rounded-full bg-primary text-white shadow-pop">
          <Icon.Check size={48} />
        </span>

        <h1 className="relative mt-6 text-xl font-bold text-ink">รับคะแนนสำเร็จ!</h1>
        <p className="relative mt-1 text-sm text-slate">คุณได้รับ</p>
        <p className="relative mt-1 text-4xl font-bold leading-none text-primary">
          {points} <span className="text-lg">คะแนน</span>
        </p>

        <span className="relative mx-auto mt-8 block w-fit text-primary">
          <Icon.Gift size={72} />
        </span>

        <div className="relative mt-8 space-y-2">
          <button onClick={() => navigate('/pr')} className="btn-primary w-full">
            กลับสู่หน้าประชาสัมพันธ์
          </button>
          <button onClick={() => navigate('/')} className="btn-ghost w-full">
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    </MobileShell>
  );
}

/*
กระดาษโปรยพื้นหลัง วาดด้วยสี่เหลี่ยมเล็ก ๆ ตำแหน่งคงที่

ตำแหน่งคงที่ไม่ใช่สุ่ม เพราะสุ่มใหม่ทุกครั้งที่ React วาดซ้ำ
จะทำให้กระดาษกระโดดไปมาระหว่างที่ผู้ใช้ยังดูหน้าจอนี้อยู่
*/
function Confetti() {
  const bits = [
    [6, 8, 'bg-primary', 10],
    [18, 22, 'bg-gold', -15],
    [30, 6, 'bg-primary-soft', 25],
    [46, 16, 'bg-gold-wash', -8],
    [62, 4, 'bg-primary', 18],
    [76, 20, 'bg-primary-soft', -22],
    [88, 10, 'bg-gold', 12],
    [12, 42, 'bg-gold-wash', -18],
    [84, 46, 'bg-primary-soft', 20],
    [70, 62, 'bg-gold', -12],
    [22, 66, 'bg-primary', 15],
  ];

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {bits.map(([left, top, color, angle], i) => (
        <span
          key={i}
          className={`absolute block h-2.5 w-1.5 rounded-[2px] ${color}`}
          style={{ left: `${left}%`, top: `${top}%`, transform: `rotate(${angle}deg)` }}
        />
      ))}
    </span>
  );
}
