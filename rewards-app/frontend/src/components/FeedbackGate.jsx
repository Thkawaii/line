import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useEmployeeArea } from '../lib/useEmployeeArea';
import { useLanguage } from '../lib/i18n';
import { Icon } from './icons';
import { Notice, useToast } from './ui';

/**
 * แบบประเมินความพึงพอใจหลังกิจกรรม
 *
 * ขึ้นให้ตอบก่อนกิจกรรมจบตามจำนวนชั่วโมงที่ตั้งไว้ในหน้าตั้งค่าระบบ
 * เหตุผลที่ขึ้นก่อนจบ ไม่ใช่หลังจบ เพราะคนยังอยู่ในงานและยังจำบรรยากาศได้
 * ถ้ารอจนกลับบ้านแล้วค่อยส่ง อัตราการตอบจะตกลงมาก
 *
 * ต่างจากประกาศข่าวสารตรงที่ปิดทิ้งได้ ไม่บังคับ
 * แบบประเมินที่บังคับตอบจะได้คำตอบที่กดผ่าน ๆ ซึ่งแย่กว่าไม่มีข้อมูลเลย
 * ปิดไปแล้วยังกลับมาตอบได้จนกว่าจะหมดเวลาที่ตั้งไว้
 */

const SCALE = [
  { score: 5, label: 'มากที่สุด' },
  { score: 4, label: 'มาก' },
  { score: 3, label: 'ปานกลาง' },
  { score: 2, label: 'น้อย' },
  { score: 1, label: 'น้อยที่สุด' },
];

const QUESTIONS = [
  { key: 'q1', text: 'ท่านมีความพึงพอใจโดยรวมต่อกิจกรรมครั้งนี้มากน้อยเพียงใด' },
  { key: 'q2', text: 'รูปแบบและเนื้อหาของกิจกรรมมีความเหมาะสมมากน้อยเพียงใด' },
  { key: 'q3', text: 'วัน เวลา และสถานที่ในการจัดกิจกรรมมีความเหมาะสมมากน้อยเพียงใด' },
  { key: 'q4', text: 'ท่านได้รับประโยชน์หรือประสบการณ์ที่ดีจากการเข้าร่วมกิจกรรมมากน้อยเพียงใด' },
  { key: 'q5', text: 'ท่านต้องการเข้าร่วมกิจกรรมลักษณะนี้อีกในอนาคตมากน้อยเพียงใด' },
];

/** หนึ่งคำถามพร้อมตัวเลือกห้าระดับ */
function Question({ index, text, value, onPick }) {
  return (
    <fieldset className="rounded-card border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">
        {index}. {text}
      </legend>

      {/*
        เรียงจากมากที่สุดลงไปน้อยที่สุดตามแบบฟอร์มกระดาษที่ใช้กันอยู่
        คนที่เคยกรอกแบบกระดาษจะได้ไม่ต้องปรับความเคยชิน
      */}
      <div className="mt-2 space-y-1.5">
        {SCALE.map((item) => {
          const picked = value === item.score;
          return (
            <label
              key={item.score}
              className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2 text-sm transition-colors ${
                picked
                  ? 'border-primary bg-primary-wash font-semibold text-primary-dark'
                  : 'border-line text-slate hover:bg-page'
              }`}
            >
              {/*
                วาดวงกลมเอง ไม่ใช้ของเบราว์เซอร์

                accent-color ย้อมได้แค่สีพื้น ส่วนจุดตรงกลางเบราว์เซอร์วาดเอง
                บางตัวจึงออกมาเป็นจุดดำคาอยู่กลางวงแหวนสีเขียว ดูเหมือนรูปรั่ว
                ซ่อน input ไว้ให้คีย์บอร์ดกับโปรแกรมอ่านหน้าจอยังใช้ได้เหมือนเดิม
                แล้ววาดวงกลมด้วย span ซึ่งคุมสีได้ทั้งวง
              */}
              <input
                type="radio"
                name={`q-${index}`}
                className="peer sr-only"
                checked={picked}
                onChange={() => onPick(item.score)}
              />
              <span
                aria-hidden="true"
                className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 ${
                  picked ? 'border-primary' : 'border-[#C6CED2]'
                }`}
              >
                {picked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              {item.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function FeedbackGate() {
  const { user } = useAuth();
  const inEmployeeArea = useEmployeeArea();
  const { lang } = useLanguage();
  const toast = useToast();

  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);

  // เฉพาะพนักงานที่ยอมรับ PDPA แล้ว ผู้ดูแลระบบไม่ต้องเจอ
  // เฉพาะฝั่งพนักงานเท่านั้น ไม่เด้งทับหน้าผู้ดูแลระบบ
  const active = inEmployeeArea && user?.role === 'user' && !!user?.terms_accepted_at;

  useEffect(() => {
    if (!active) {
      setQueue([]);
      return;
    }
    api
      .pendingFeedback()
      .then(({ events }) => {
        setQueue(events);
        setIndex(0);
      })
      .catch(() => setQueue([]));
  }, [active, lang]);

  const current = queue[index];

  // เปลี่ยนกิจกรรมแล้วต้องล้างคำตอบเดิมและเลื่อนกลับขึ้นบน
  useEffect(() => {
    setAnswers({});
    setComment('');
    setError('');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [current?.id]);

  if (!active || !current) return null;

  function next() {
    if (index + 1 < queue.length) setIndex(index + 1);
    else setQueue([]);
  }

  async function submit(event) {
    event.preventDefault();

    const missing = QUESTIONS.filter((q) => !answers[q.key]);
    if (missing.length > 0) {
      setError(`กรุณาให้คะแนนข้อ ${missing.map((q) => QUESTIONS.indexOf(q) + 1).join(', ')}`);
      // พาไปที่ข้อแรกที่ยังไม่ได้ตอบ จะได้ไม่ต้องไล่หาเอง
      document.getElementById(`feedback-${missing[0].key}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }

    setBusy(true);
    try {
      await api.submitFeedback(current.id, { ...answers, comment });
      toast('ขอบคุณสำหรับความคิดเห็น', 'primary');
      next();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center bg-ink/60 p-4">
      <div className="flex max-h-[88dvh] w-full max-w-mobile flex-col overflow-hidden rounded-2xl bg-white shadow-pop">
        <header className="shrink-0 bg-gradient-to-br from-primary to-[#0B7E82] px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-white/20 px-2.5 py-1 text-2xs font-semibold">
              <Icon.StarSparkle size={14} />
              แบบประเมินความพึงพอใจ
            </span>

            {queue.length > 1 && (
              <span className="text-2xs text-white/80">
                {index + 1} จาก {queue.length}
              </span>
            )}
          </div>

          {/* ป้ายด้านบนบอกอยู่แล้วว่าเป็นแบบประเมิน ตรงนี้จึงเหลือแค่ชื่อกิจกรรม
              ไม่ต้องพูดซ้ำสองรอบในกรอบเดียวกัน */}
          <h2 className="mt-2.5 text-lg font-bold leading-snug">{current.title}</h2>
          <p className="mt-1.5 text-2xs leading-relaxed text-white/85">
            กรุณาประเมินความพึงพอใจต่อกิจกรรมที่ท่านเข้าร่วม
            เพื่อนำความคิดเห็นไปพัฒนาการจัดกิจกรรมในอนาคต
          </p>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {QUESTIONS.map((question, i) => (
              <div key={question.key} id={`feedback-${question.key}`}>
                <Question
                  index={i + 1}
                  text={question.text}
                  value={answers[question.key]}
                  onPick={(score) => setAnswers((prev) => ({ ...prev, [question.key]: score }))}
                />
              </div>
            ))}

            <div>
              <label className="label" htmlFor="feedback-comment">
                6. ข้อเสนอแนะเพิ่มเติม <span className="text-muted">(ไม่บังคับ)</span>
              </label>
              <textarea
                id="feedback-comment"
                rows={3}
                className="field"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>

            {error && <Notice>{error}</Notice>}
          </div>

          <footer className="shrink-0 border-t border-line px-5 py-4">
            <div className="flex gap-2">
              {/* ปิดได้ ไม่บังคับ แบบประเมินที่บังคับตอบจะได้คำตอบที่กดผ่าน ๆ
                  ซึ่งแย่กว่าไม่มีข้อมูลเลย ปิดแล้วยังกลับมาตอบได้ภายหลัง */}
              <button type="button" onClick={next} className="btn-ghost flex-1">
                ไว้ทีหลัง
              </button>
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy ? 'กำลังส่ง' : 'ส่งแบบประเมิน'}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
