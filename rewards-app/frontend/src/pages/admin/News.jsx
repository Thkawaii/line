import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Select } from '../../components/ComboBox';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  Notice,
  Spinner,
  useToast,
} from '../../components/ui';
import ImageCropper from '../../components/ImageCropper';
import { Icon } from '../../components/icons';
import { dateTime, num } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { isBackOffice } from '../../lib/org';
import DateField from '../../components/DateField';

/**
 * ประกาศข่าวสารที่พนักงานต้องกดรับทราบ
 *
 * ต่างจากหน้า Notifications ตรงที่ประกาศชนิดนี้ "บังคับอ่าน"
 * พนักงานเข้าระบบมาแล้วจะถูกแสดงทันที และต้องเลื่อนอ่านจนสุดก่อนจึงกดรับทราบได้
 *
 * การ์ดแต่ละใบมีแถบความคืบหน้าบอกว่ามีคนกดรับทราบแล้วกี่คนจากทั้งหมดกี่คน
 */

const STATUS = {
  published: { label: 'เผยแพร่อยู่', className: 'bg-success-wash text-success' },
  draft: { label: 'ฉบับร่าง', className: 'bg-line text-slate' },
  archived: { label: 'เก็บเข้าคลัง', className: 'bg-gold-wash text-gold-ink' },
};

const emptyForm = {
  title: '',
  body: '',
  imageUrl: '',
  status: 'published',
  requireAck: true,
  linkUrl: '',
  linkLabel: '',
  fileUrl: '',
  fileName: '',
  startsAt: '',
  endsAt: '',
};

/* ---------- ฟอร์ม ---------- */

function NewsForm({ open, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  /*
    อ่านไฟล์เป็น data URL แล้วส่งไปให้เซิร์ฟเวอร์เก็บ
    ใช้ทางเดียวกับรูปภาพเพื่อไม่ต้องมีสองวิธีอัปโหลดในระบบเดียว

    เซิร์ฟเวอร์ตรวจซ้ำว่าเป็น PDF จริงจากไบต์ในไฟล์ ไม่เชื่อ accept ของช่องนี้
    เพราะ accept เป็นแค่ตัวกรองในกล่องเลือกไฟล์ ไม่ได้บังคับอะไร
  */
  async function pickFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(file);
      });

      const result = await api.adminUploadDocument(data, file.name);
      setForm((prev) => ({ ...prev, fileUrl: result.url, fileName: result.name }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      editing
        ? {
            title: editing.title || '',
            body: editing.body || '',
            imageUrl: editing.image_url || '',
            status: editing.status || 'published',
            requireAck: !!editing.require_ack,
            linkUrl: editing.link_url || '',
            linkLabel: editing.link_label || '',
            fileUrl: editing.file_url || '',
            fileName: editing.file_name || '',
            startsAt: (editing.starts_at || '').slice(0, 10),
            endsAt: (editing.ends_at || '').slice(0, 10),
          }
        : emptyForm
    );
  }, [open, editing]);

  const set = (key) => (event) => {
    const target = event.target;
    setForm((prev) => ({
      ...prev,
      [key]: target.type === 'checkbox' ? target.checked : target.value,
    }));
  };

  async function save(event) {
    event.preventDefault();
    try {
      if (editing) await api.adminUpdateAnnouncement(editing.id, form);
      else await api.adminCreateAnnouncement(form);
      toast(editing ? 'บันทึกประกาศแล้ว' : 'เผยแพร่ประกาศแล้ว', 'primary');
      onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <form onSubmit={save} className="p-6">
        <h2 className="text-xl font-bold text-ink">
          {editing ? 'แก้ไขประกาศ' : 'สร้างประกาศใหม่'}
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="news-title">
              หัวข้อ *
            </label>
            <input
              id="news-title"
              className="field"
              value={form.title}
              onChange={set('title')}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="news-body">
              เนื้อหา *
            </label>
            <textarea
              id="news-body"
              rows={10}
              className="field"
              value={form.body}
              onChange={set('body')}
              required
            />
            <p className="mt-1 text-2xs text-muted">
              ขึ้นบรรทัดใหม่ได้ตามปกติ พนักงานต้องเลื่อนอ่านจนจบก่อนจึงกดรับทราบได้
            </p>
          </div>

          <div className="sm:col-span-2">
            <ImageCropper
              label="รูปประกอบ"
              value={form.imageUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, imageUrl: url }))}
              aspect={16 / 9}
            />
          </div>

          <div>
            <label className="label" htmlFor="news-status">
              สถานะ
            </label>
            <Select
              id="news-status"
              options={[
                { value: 'published', label: 'เผยแพร่' },
                { value: 'draft', label: 'ฉบับร่าง' },
                { value: 'archived', label: 'เก็บเข้าคลัง' },
              ]}
              value={form.status}
              onChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
            />
          </div>

          <div />

          <div>
            <label className="label" htmlFor="news-start">
              เริ่มแสดงวันที่
            </label>
            <DateField
              id="news-start"
                            className="field"
              value={form.startsAt}
              onChange={set('startsAt')}
            />
          </div>

          <div>
            <label className="label" htmlFor="news-end">
              แสดงถึงวันที่
            </label>
            <DateField
              id="news-end"
                            className="field"
              value={form.endsAt}
              onChange={set('endsAt')}
            />
          </div>

          {/* ลิงก์และไฟล์แนบ ประกาศหลายเรื่องต้องพาไปทำอย่างอื่นต่อ
              เช่น แบบสำรวจใน Google Form หรือเอกสารที่ต้องเปิดอ่าน */}
          <fieldset className="rounded-[10px] border border-line p-4 sm:col-span-2">
            <legend className="px-1 text-sm font-semibold text-ink">
              ลิงก์และไฟล์แนบ (ไม่บังคับ)
            </legend>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="news-link">
                  ลิงก์
                </label>
                <input
                  id="news-link"
                  type="url"
                  className="field"
                  value={form.linkUrl}
                  onChange={set('linkUrl')}
                  placeholder="https://forms.gle/..."
                />
              </div>
              <div>
                <label className="label" htmlFor="news-link-label">
                  ข้อความ
                </label>
                <input
                  id="news-link-label"
                  className="field"
                  value={form.linkLabel}
                  onChange={set('linkLabel')}
                />
              </div>
            </div>

            <div className="mt-3">
              <span className="label">ไฟล์แนบ (PDF)</span>

              {form.fileUrl ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-page p-3">
                  <span className="text-primary">
                    <Icon.Box size={18} />
                  </span>
                  <a
                    href={form.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-sm text-primary underline"
                  >
                    {form.fileName || 'เอกสารแนบ.pdf'}
                  </a>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, fileUrl: '', fileName: '' }))}
                    className="btn-ghost btn-sm text-danger"
                  >
                    ลบไฟล์
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={pickFile}
                    disabled={uploading}
                    className="field"
                  />
                  <p className="mt-1 text-2xs text-muted">
                    {uploading ? 'กำลังอัปโหลด...' : 'รองรับเฉพาะไฟล์ PDF ขนาดไม่เกิน 15 MB'}
                  </p>
                </>
              )}
            </div>
          </fieldset>
        </div>

        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            ยกเลิก
          </button>
          <button type="submit" className="btn-primary">
            บันทึก
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------- หน้าหลัก ---------- */

export default function AdminNews() {
  const toast = useToast();
  const { user } = useAuth();
  // พนักงานแผนกหลังบ้านจัดการหน้านี้ได้เท่าผู้ดูแลระบบ
  // ที่กันไว้เฉพาะผู้ดูแลระบบตัวจริงคือกลุ่มเมนู "ตั้งค่าระบบ" เท่านั้น
  const isAdmin = isBackOffice(user);

  const [items, setItems] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(
    () => api.adminAnnouncements().then(({ announcements }) => setItems(announcements)),
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  async function remove() {
    const target = removing;
    setRemoving(null);
    await api.adminDeleteAnnouncement(target.id);
    toast('ลบประกาศแล้ว');
    load();
  }

  return (
    <AdminShell
      title="ประกาศข่าวสาร"
      breadcrumb="ประกาศและเนื้อหา"
      actions={
        isAdmin ? (
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="btn-primary btn-sm"
          >
            <Icon.Plus size={16} /> สร้างประกาศ
          </button>
        ) : null
      }
    >
      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Icon.Megaphone}
          title="ยังไม่มีประกาศ"
          hint={isAdmin ? 'กดสร้างประกาศเพื่อแจ้งข่าวถึงพนักงานทุกคน' : 'รอผู้ดูแลระบบสร้างประกาศ'}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const badge = STATUS[item.status] || STATUS.published;
            const rate = item.audience > 0 ? item.acknowledged / item.audience : 0;

            return (
              <li key={item.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-ink">{item.title}</h2>
                    <p className="mt-0.5 text-2xs text-muted">{dateTime(item.created_at)}</p>
                  </div>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </div>

                <p className="mt-2 line-clamp-2 text-sm text-muted">{item.body}</p>

                <div className="mt-3">
                  <div className="flex items-baseline justify-between text-2xs text-muted">
                    <span>ต้องกดรับทราบ</span>
                    <span>
                      รับทราบแล้ว {num(item.acknowledged)} / {num(item.audience)} คน
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-pill bg-[#D9D9D9]">
                    <div
                      className={`h-full rounded-pill ${rate >= 1 ? 'bg-success' : 'bg-gold'}`}
                      style={{ width: `${Math.round(rate * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                        className="text-slate"
                      >
                        แก้ไข
                      </button>
                      <button onClick={() => setRemoving(item)} className="text-danger">
                        ลบ
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <NewsForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />

      <ConfirmDialog
        open={!!removing}
        title="ลบประกาศนี้"
        confirmLabel="ลบ"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </AdminShell>
  );
}
