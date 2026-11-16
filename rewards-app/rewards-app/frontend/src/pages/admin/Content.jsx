import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Badge, ImagePlaceholder, Modal, Notice, Spinner, useToast } from '../../components/ui';
import ImageCropper from '../../components/ImageCropper';
import TranslatedFields from '../../components/TranslatedFields';
import { Icon } from '../../components/icons';
import { dateTime } from '../../lib/format';

/* ---------- Banner ---------- */

function BannerPage() {
  const toast = useToast();
  const [banners, setBanners] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', imageUrl: '', linkUrl: '', sortOrder: 0, active: true });
  const [error, setError] = useState('');

  const load = useCallback(() => api.adminBanners().then(({ banners }) => setBanners(banners)), []);
  useEffect(() => {
    load();
  }, [load]);

  function start(banner) {
    setEditing(banner);
    setError('');
    setForm(
      banner
        ? {
            title: banner.title,
            imageUrl: banner.image_url || '',
            linkUrl: banner.link_url || '',
            sortOrder: banner.sort_order,
            active: banner.active,
          }
        : { title: '', imageUrl: '', linkUrl: '', sortOrder: (banners?.length || 0) + 1, active: true }
    );
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = { ...form, sortOrder: Number(form.sortOrder) };
      if (editing) await api.adminUpdateBanner(editing.id, payload);
      else await api.adminCreateBanner(payload);
      toast(editing ? 'บันทึกแบนเนอร์แล้ว' : 'เพิ่มแบนเนอร์แล้ว', 'primary');
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(banner) {
    if (!window.confirm(`ลบแบนเนอร์ "${banner.title}" ใช่ไหม`)) return;
    await api.adminDeleteBanner(banner.id);
    toast('ลบแบนเนอร์แล้ว');
    load();
  }

  async function toggle(banner) {
    await api.adminUpdateBanner(banner.id, { active: !banner.active });
    load();
  }

  return (
    <AdminShell
      title="ประกาศและเนื้อหา"
      breadcrumb="Banner"
      actions={
        <button onClick={() => start(null)} className="btn-primary btn-sm">
          <Icon.Plus size={16} /> เพิ่มแบนเนอร์
        </button>
      }
    >
      <section className="card overflow-hidden">
        <h2 className="border-l-4 border-primary px-4 py-3 font-semibold text-ink">แบนเนอร์หน้าแรก</h2>

        {!banners ? (
          <Spinner />
        ) : banners.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">ยังไม่มีแบนเนอร์</p>
        ) : (
          <ul className="divide-y divide-line">
            {banners.map((banner) => (
              <li key={banner.id} className="flex flex-wrap items-center gap-4 p-4">
                <ImagePlaceholder src={banner.image_url} className="h-16 w-28 shrink-0 rounded-[8px]" />

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{banner.title}</p>
                  <p className="truncate text-sm text-muted">{banner.link_url || 'ไม่ได้ตั้งลิงก์'}</p>
                </div>

                <span className="text-sm text-muted">ลำดับ {banner.sort_order}</span>

                <button onClick={() => toggle(banner)}>
                  <Badge className={banner.active ? 'bg-success-wash text-success' : 'bg-line text-slate'}>
                    {banner.active ? 'แสดงอยู่' : 'ซ่อนไว้'}
                  </Badge>
                </button>

                <div className="flex gap-3 text-sm">
                  <button onClick={() => start(banner)} className="text-primary">
                    แก้ไข
                  </button>
                  <button onClick={() => remove(banner)} className="text-danger">
                    ลบ
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="p-6">
          <h2 className="text-lg font-bold text-ink">{editing ? 'แก้ไขแบนเนอร์' : 'เพิ่มแบนเนอร์'}</h2>
          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <div className="mt-4">
            <TranslatedFields
              fields={[{ name: 'title', label: 'ชื่อแบนเนอร์', required: true, full: true }]}
              value={form}
              onChange={setForm}
            />
          </div>

          <div className="mt-3">
            <ImageCropper
              value={form.imageUrl}
              onChange={(url) => setForm({ ...form, imageUrl: url })}
            />
          </div>

          <label className="label mt-3" htmlFor="bannerLink">
            ลิงก์เมื่อคลิกแบนเนอร์
          </label>
          <input
            id="bannerLink"
            className="field"
            value={form.linkUrl}
            onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
            placeholder="https://"
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="bannerSort">
                ลำดับการแสดง
              </label>
              <input
                id="bannerSort"
                type="number"
                className="field"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </div>
            <label className="mt-7 flex items-center gap-2 text-sm text-slate">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              แสดงในแอป
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              ยกเลิก
            </button>
            <button type="submit" className="btn-primary">
              บันทึก
            </button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}

/* ---------- FAQ ---------- */

function FaqPage() {
  const toast = useToast();
  const [faqs, setFaqs] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ question: '', answer: '', sortOrder: 0 });
  const [error, setError] = useState('');

  const load = useCallback(() => api.adminFaqs().then(({ faqs }) => setFaqs(faqs)), []);
  useEffect(() => {
    load();
  }, [load]);

  function start(faq) {
    setEditing(faq);
    setError('');
    setForm(
      faq
        ? { question: faq.question, answer: faq.answer, sortOrder: faq.sort_order }
        : { question: '', answer: '', sortOrder: (faqs?.length || 0) + 1 }
    );
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    try {
      const payload = { ...form, sortOrder: Number(form.sortOrder) };
      if (editing) await api.adminUpdateFaq(editing.id, payload);
      else await api.adminCreateFaq(payload);
      toast(editing ? 'บันทึกคำถามแล้ว' : 'เพิ่มคำถามแล้ว', 'primary');
      setOpen(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(faq) {
    if (!window.confirm('ลบคำถามนี้ใช่ไหม')) return;
    await api.adminDeleteFaq(faq.id);
    toast('ลบคำถามแล้ว');
    load();
  }

  return (
    <AdminShell
      title="ประกาศและเนื้อหา"
      breadcrumb="FAQ"
      actions={
        <button onClick={() => start(null)} className="btn-primary btn-sm">
          <Icon.Plus size={16} /> เพิ่มคำถาม
        </button>
      }
    >
      <section className="card overflow-hidden">
        <h2 className="border-l-4 border-primary px-4 py-3 font-semibold text-ink">คำถามที่พบบ่อย</h2>

        {!faqs ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th w-20">ลำดับ</th>
                  <th className="th">คำถาม</th>
                  <th className="th">คำตอบ</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {faqs.map((faq) => (
                  <tr key={faq.id}>
                    <td className="td">{faq.sort_order}</td>
                    <td className="td max-w-xs whitespace-normal font-medium text-ink">{faq.question}</td>
                    <td className="td max-w-md whitespace-normal">{faq.answer}</td>
                    <td className="td">
                      <div className="flex gap-3">
                        <button onClick={() => start(faq)} className="text-primary">
                          แก้ไข
                        </button>
                        <button onClick={() => remove(faq)} className="text-danger">
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {faqs.length === 0 && (
                  <tr>
                    <td className="td text-center text-muted" colSpan={4}>
                      ยังไม่มีคำถาม
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="p-6">
          <h2 className="text-lg font-bold text-ink">{editing ? 'แก้ไขคำถาม' : 'เพิ่มคำถาม'}</h2>
          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <div className="mt-4">
            <TranslatedFields
              fields={[
                { name: 'question', label: 'คำถาม', required: true, full: true },
                { name: 'answer', label: 'คำตอบ', type: 'textarea', rows: 4, required: true },
              ]}
              value={form}
              onChange={setForm}
            />
          </div>

          <label className="label mt-3" htmlFor="faqSort">
            ลำดับ
          </label>
          <input
            id="faqSort"
            type="number"
            className="field w-28"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              ยกเลิก
            </button>
            <button type="submit" className="btn-primary">
              บันทึก
            </button>
          </div>
        </form>
      </Modal>
    </AdminShell>
  );
}

/* ---------- Terms & Policy ---------- */

function TermsPage() {
  const toast = useToast();
  const [policies, setPolicies] = useState(null);
  const [active, setActive] = useState('privacy');
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api.adminPolicies().then(({ policies }) => {
        setPolicies(policies);
        const current = policies.find((p) => p.key === active) || policies[0];
        if (current) {
          setActive(current.key);
          setDraft({ title: current.title, content: current.content });
        }
      }),
    [active]
  );

  useEffect(() => {
    api.adminPolicies().then(({ policies }) => {
      setPolicies(policies);
      const current = policies.find((p) => p.key === 'privacy') || policies[0];
      if (current) {
        setDraft({ title: current.title, content: current.content });
      }
    });
  }, []);

  function pick(key) {
    const policy = policies.find((p) => p.key === key);
    setActive(key);
    setDraft({ title: policy.title, content: policy.content });
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    try {
      await api.adminSavePolicy(active, draft);
      toast('บันทึกเอกสารแล้ว', 'primary');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!policies) {
    return (
      <AdminShell title="ประกาศและเนื้อหา" breadcrumb="Terms & Policy">
        <Spinner />
      </AdminShell>
    );
  }

  const current = policies.find((p) => p.key === active);

  return (
    <AdminShell title="ประกาศและเนื้อหา" breadcrumb="Terms & Policy">
      <div className="mb-5 flex gap-6 border-b border-line">
        {policies.map((policy) => (
          <button
            key={policy.key}
            onClick={() => pick(policy.key)}
            className={`-mb-px border-b-2 pb-2.5 text-[15px] font-semibold ${
              active === policy.key ? 'border-primary text-primary' : 'border-transparent text-slate'
            }`}
          >
            {policy.key === 'privacy' ? 'Privacy / PDPA' : 'Terms of Use'}
          </button>
        ))}
      </div>

      <form onSubmit={save} className="card p-5">
        {error && (
          <div className="mb-3">
            <Notice>{error}</Notice>
          </div>
        )}

        <p className="text-sm text-muted">แก้ไขล่าสุด {current ? dateTime(current.updated_at) : '-'}</p>

        <div className="mt-4">
          <TranslatedFields
            fields={[
              { name: 'title', label: 'หัวข้อเอกสาร', required: true, full: true },
              { name: 'content', label: 'เนื้อหา', type: 'textarea', rows: 18, required: true },
            ]}
            value={draft}
            onChange={setDraft}
          />
        </div>
        <p className="mt-1.5 text-2xs text-muted">
          ขึ้นต้นบรรทัดด้วย <code>##</code> เพื่อทำหัวข้อ และ <code>-</code> เพื่อทำรายการ
        </p>

        <div className="mt-5 flex justify-end">
          <button type="submit" className="btn-primary">
            บันทึกเอกสาร
          </button>
        </div>
      </form>
    </AdminShell>
  );
}

export default function AdminContent() {
  const { key } = useParams();
  if (key === 'faq') return <FaqPage />;
  if (key === 'terms') return <TermsPage />;
  return <BannerPage />;
}
