import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import MobileShell from '../../components/MobileShell';
import { EmptyState, Modal, Notice, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num, thaiDate } from '../../lib/format';
import { useLanguage } from '../../lib/i18n';

/**
 * รายการที่พนักงานต้องทำ — ลงทะเบียน แบบสำรวจ และแสดงความคิดเห็น
 *
 * หัวข้อทั้งหมดมาจากที่ผู้ดูแลตั้งไว้ และถูกแปลมาแล้วจากฝั่งเซิร์ฟเวอร์ตามภาษาที่เลือก
 *
 * เรื่องความเป็นส่วนตัวเราบอกผู้ใช้ตรง ๆ บนหน้าจอก่อนกดส่ง ว่าคำตอบจะถูกนับรวม
 * เป็นภาพรวมของแผนกเท่านั้น เพราะคนจะตอบตามจริงก็ต่อเมื่อรู้ว่าปลอดภัยที่จะตอบ
 */

/** คำถามที่ผู้ดูแลตั้งไว้ถูกส่งมาเป็นข้อความ JSON จากฐานข้อมูล */
function readQuestions(raw) {
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** ปุ่มเปิดรายการ ใช้คำให้ตรงกับชนิดของหัวข้อ */
function actionLabel(kind, t) {
  if (kind === 'survey') return t('surveys.answer');
  if (kind === 'feedback') return t('surveys.giveFeedback');
  return t('surveys.register');
}

function TopicCard({ topic, onOpen, t }) {
  const done = topic.done;

  return (
    <li className="rounded-card bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
            done ? 'bg-success-wash text-success' : 'bg-primary-wash text-primary'
          }`}
        >
          {done ? <Icon.CheckCircle size={18} /> : <Icon.Vote size={18} />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{topic.title}</p>
          {topic.description && (
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{topic.description}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
            {done ? (
              <span className="font-semibold text-success">
                {topic.submitted_at
                  ? t('surveys.doneAt', { date: thaiDate(topic.submitted_at) })
                  : t('surveys.done')}
              </span>
            ) : (
              <span className="font-semibold text-gold-ink">{t('surveys.pending')}</span>
            )}

            {topic.ends_at && <span>{t('surveys.closesOn', { date: thaiDate(topic.ends_at) })}</span>}
            {topic.points > 0 && (
              <span>{t('surveys.earnPoints', { points: num(topic.points) })}</span>
            )}
          </div>
        </div>
      </div>

      {!done && (
        <button onClick={() => onOpen(topic)} className="btn-primary btn-sm mt-3 w-full">
          {actionLabel(topic.kind, t)}
        </button>
      )}
    </li>
  );
}

/** ฟอร์มตอบ รองรับคำถามแบบเลือกตอบ แบบพิมพ์เอง และช่องความคิดเห็นท้ายฟอร์ม */
function AnswerForm({ topic, onClose, onDone, t }) {
  const toast = useToast();
  const questions = readQuestions(topic?.questions);
  const [answers, setAnswers] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // เปิดหัวข้อใหม่ต้องล้างคำตอบเดิมทิ้ง ไม่งั้นคำตอบของหัวข้อก่อนหน้าค้างอยู่ในฟอร์ม
  useEffect(() => {
    setAnswers({});
    setComment('');
    setError('');
  }, [topic?.id]);

  if (!topic) return null;

  const write = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));

  async function submit(event) {
    event.preventDefault();

    const missing = questions.some(
      (question) => question.required && !String(answers[question.id] ?? '').trim()
    );
    if (missing) {
      setError(t('common.required'));
      return;
    }

    setBusy(true);
    try {
      const result = await api.submitSurvey(topic.id, { answers, comment });
      toast(
        result.points > 0
          ? t('surveys.successPoints', { points: num(result.points) })
          : t('surveys.success'),
        'primary'
      );
      onDone();
    } catch (err) {
      // ตอบซ้ำเป็นกรณีที่เกิดได้จริงเมื่อเปิดไว้สองแท็บ บอกให้เข้าใจแทนที่จะโชว์ error ดิบ
      setError(err.status === 409 ? t('surveys.already') : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!topic} onClose={onClose}>
      <form onSubmit={submit} className="p-5">
        <h2 className="text-lg font-bold text-ink">{topic.title}</h2>
        {topic.description && (
          <p className="mt-1 whitespace-pre-line text-sm text-muted">{topic.description}</p>
        )}

        {questions.length > 0 && (
          <div className="mt-4 space-y-4">
            {questions.map((question) => (
              <div key={question.id}>
                <label className="label" htmlFor={`q-${question.id}`}>
                  {question.label}
                  {question.required ? ' *' : ''}
                </label>

                {Array.isArray(question.options) && question.options.length > 0 ? (
                  <div className="space-y-2">
                    {question.options.map((option) => (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm ${
                          answers[question.id] === option
                            ? 'border-primary bg-primary-wash font-semibold text-primary-dark'
                            : 'border-line text-slate'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={() => write(question.id, option)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    id={`q-${question.id}`}
                    rows={3}
                    className="field"
                    value={answers[question.id] ?? ''}
                    onChange={(e) => write(question.id, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <label className="label" htmlFor="survey-comment">
            {t('surveys.comment')} <span className="text-muted">({t('common.optional')})</span>
          </label>
          <textarea
            id="survey-comment"
            rows={3}
            className="field"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('surveys.commentPlaceholder')}
          />
        </div>

        {/* บอกให้ชัดก่อนกดส่งว่าใครจะเห็นอะไร */}
        <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-page p-3 text-2xs text-muted">
          <span className="mt-0.5 shrink-0">
            <Icon.Lock size={14} />
          </span>
          {topic.anonymous ? t('surveys.anonymousNote') : t('surveys.identifiedNote')}
        </p>

        {error && (
          <div className="mt-3">
            <Notice>{error}</Notice>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy} className="btn-primary flex-1">
            {busy ? t('common.submitting') : t('common.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Surveys() {
  const { t, lang } = useLanguage();
  const [topics, setTopics] = useState(null);
  const [active, setActive] = useState(null);

  function load() {
    api.surveys().then(({ topics }) => setTopics(topics));
  }

  // ดึงใหม่เมื่อเปลี่ยนภาษา เพราะชื่อหัวข้อถูกแปลมาจากเซิร์ฟเวอร์
  useEffect(load, [lang]);

  return (
    <MobileShell title={t('surveys.title')} back="/profile">
      <div className="px-4 py-4">
        {!topics ? (
          <Spinner />
        ) : topics.length === 0 ? (
          <EmptyState icon={Icon.Check} title={t('surveys.empty')} hint={t('surveys.emptyHint')} />
        ) : (
          <ul className="space-y-3">
            {topics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} onOpen={setActive} t={t} />
            ))}
          </ul>
        )}
      </div>

      <AnswerForm
        topic={active}
        t={t}
        onClose={() => setActive(null)}
        onDone={() => {
          setActive(null);
          load();
        }}
      />
    </MobileShell>
  );
}
