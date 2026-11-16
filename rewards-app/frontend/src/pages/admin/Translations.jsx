import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import AdminShell from '../../components/AdminShell';
import { Badge, ConfirmDialog, Notice, Spinner, useToast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { num } from '../../lib/format';

/**
 * จัดการคำแปลอัตโนมัติ
 *
 * ผู้ดูแลกรอกข้อมูลเป็นภาษาไทยอย่างเดียว ระบบแปลเป็นอังกฤษและญี่ปุ่นให้เองเบื้องหลัง
 * หน้านี้มีไว้สองเรื่อง
 *   1. ดูว่าแปลครบหรือยัง และตอนนี้ระบบใช้บริการแปลตัวไหนอยู่
 *   2. แก้คำแปลที่ไม่ถูกใจด้วยมือ ซึ่งระบบจะไม่เขียนทับจนกว่าข้อความไทยจะถูกแก้
 */

const LANG_LABEL = { en: 'English', ja: '日本語' };

/** กล่องบอกสถานะของตัวแปล พร้อมคำแนะนำเมื่อออกเน็ตไม่ได้ */
function EngineCard({ engine, enabled }) {
  const offline = !engine.online;

  return (
    <section className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`grid h-10 w-10 place-items-center rounded-full ${
            offline ? 'bg-gold-wash text-gold-ink' : 'bg-success-wash text-success'
          }`}
        >
          <Icon.Globe size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">
            บริการแปล: {engine.provider}
            {!enabled && <span className="ml-2 text-danger">(ปิดอยู่)</span>}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {offline
              ? `ตอนนี้ใช้${engine.fallback}แทน แปลได้เฉพาะข้อความสั้น ๆ ที่มีอยู่ในคลัง`
              : 'เชื่อมต่อบริการแปลได้ตามปกติ'}
          </p>
        </div>
      </div>

      {offline && (
        <div className="mt-4 rounded-[10px] bg-page p-3 text-sm text-slate">
          <p className="font-semibold text-ink">ข้อความยาวจะยังเป็นภาษาไทย</p>
          <p className="mt-1 text-muted">
            ระบบตั้งใจไม่แปลประโยคที่คลังคำแปลได้ไม่ครบ เพราะผลลัพธ์จะออกมาปนกันจนอ่านไม่รู้เรื่อง
            แสดงภาษาไทยไว้ก่อนดีกว่า หากต้องการคำแปลที่สมบูรณ์
            ให้ตั้ง LibreTranslate ไว้ในวงแลนแล้วใส่ที่อยู่ใน TRANSLATE_URL ของไฟล์ backend/.env
          </p>
          {engine.lastError && (
            <p className="mt-2 text-2xs text-muted">ข้อผิดพลาดล่าสุด: {engine.lastError}</p>
          )}
        </div>
      )}
    </section>
  );
}

/** แถวหนึ่งรายการ กางออกมาแก้คำแปลได้ */
function ItemRow({ table, item, onSaved }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ en: {}, ja: {} });
  const [busy, setBusy] = useState(false);

  function expand() {
    if (!open) {
      const next = { en: {}, ja: {} };
      for (const field of item.fields) {
        next.en[field.name] = field.en || '';
        next.ja[field.name] = field.ja || '';
      }
      setDraft(next);
    }
    setOpen((value) => !value);
  }

  async function save(lang) {
    setBusy(true);
    try {
      await api.adminSaveTranslation(table, {
        id: String(item.id),
        lang,
        values: draft[lang],
      });
      toast(`บันทึกคำแปล ${LANG_LABEL[lang]} แล้ว`, 'primary');
      onSaved();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  const title = item.fields[0]?.th || `#${item.id}`;

  return (
    <li className="border-b border-line last:border-0">
      <button
        onClick={expand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-page"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{title}</span>
        {item.pending ? (
          <Badge className="bg-gold-wash text-gold-ink">ยังแปลไม่ครบ</Badge>
        ) : (
          <Badge className="bg-success-wash text-success">แปลแล้ว</Badge>
        )}
        <span className={open ? 'rotate-180 text-muted' : 'text-muted'}>
          <Icon.Chevron size={16} />
        </span>
      </button>

      {open && (
        <div className="space-y-4 bg-page px-4 py-4">
          {['en', 'ja'].map((lang) => (
            <div key={lang} className="rounded-[10px] border border-line bg-white p-4">
              <p className="mb-3 font-semibold text-ink">{LANG_LABEL[lang]}</p>

              <div className="space-y-3">
                {item.fields.map((field) => (
                  <div key={field.name}>
                    <label className="label" htmlFor={`${item.id}-${lang}-${field.name}`}>
                      {field.name}
                    </label>
                    {/* แสดงต้นฉบับภาษาไทยคู่กันเสมอ จะได้ตรวจทานได้โดยไม่ต้องสลับหน้า */}
                    <p className="mb-1 whitespace-pre-line rounded-[6px] bg-page px-2 py-1 text-2xs text-muted">
                      {field.th}
                    </p>
                    <textarea
                      id={`${item.id}-${lang}-${field.name}`}
                      rows={field.th.length > 120 ? 4 : 2}
                      className="field"
                      value={draft[lang][field.name] ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [lang]: { ...prev[lang], [field.name]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={() => save(lang)}
                disabled={busy}
                className="btn-primary btn-sm mt-3"
              >
                บันทึกคำแปล {LANG_LABEL[lang]}
              </button>
            </div>
          ))}

          <p className="text-2xs text-muted">
            คำแปลที่แก้เองจะคงอยู่จนกว่าข้อความภาษาไทยจะถูกแก้
            ถ้าแก้ภาษาไทยเมื่อไหร่ ระบบจะแปลช่องนั้นใหม่ให้เอง
          </p>
        </div>
      )}
    </li>
  );
}

export default function Translations() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [table, setTable] = useState(null);
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);

  const loadStatus = useCallback(
    () =>
      api.adminTranslations().then((data) => {
        setStatus(data);
        setTable((current) => current ?? data.tables[0]?.table ?? null);
      }),
    []
  );

  const loadItems = useCallback(() => {
    if (!table) return;
    setItems(null);
    api.adminTranslationItems(table).then(({ items }) => setItems(items));
  }, [table]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function runNow() {
    setBusy(true);
    try {
      const { result } = await api.adminRunTranslations();
      toast(
        result.updated > 0
          ? `แปลเพิ่มอีก ${num(result.updated)} รายการแล้ว`
          : 'ไม่มีรายการที่ต้องแปลเพิ่ม',
        'primary'
      );
      await loadStatus();
      loadItems();
    } finally {
      setBusy(false);
    }
  }

  async function rebuild() {
    setRebuildOpen(false);
    setBusy(true);
    try {
      const { result } = await api.adminRebuildTranslations(true);
      toast(`แปลใหม่ทั้งหมดแล้ว ${num(result.updated)} รายการ`, 'primary');
      await loadStatus();
      loadItems();
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <AdminShell title="คำแปลหลายภาษา" breadcrumb="ตั้งค่าระบบ">
        <Spinner />
      </AdminShell>
    );
  }

  const current = status.tables.find((item) => item.table === table);

  const actions = (
    <>
      <button onClick={runNow} disabled={busy} className="btn-primary btn-sm">
        <Icon.Refresh size={16} /> {busy ? 'กำลังแปล' : 'แปลรายการที่ค้าง'}
      </button>
      <button onClick={() => setRebuildOpen(true)} disabled={busy} className="btn-ghost btn-sm">
        แปลใหม่ทั้งหมด
      </button>
    </>
  );

  return (
    <AdminShell title="คำแปลหลายภาษา" breadcrumb="ตั้งค่าระบบ" actions={actions}>
      <div className="space-y-4">
        <EngineCard engine={status.engine} enabled={status.enabled} />

        {!status.enabled && (
          <Notice tone="warn">
            การแปลอัตโนมัติถูกปิดอยู่ เปิดได้ที่หน้า System Settings โดยตั้งค่า translate.auto เป็น true
          </Notice>
        )}

        {/* เลือกหมวดเนื้อหา พร้อมบอกว่าแต่ละหมวดค้างกี่รายการ */}
        <div className="flex flex-wrap gap-2">
          {status.tables.map((item) => (
            <button
              key={item.table}
              onClick={() => setTable(item.table)}
              className={`rounded-card border px-4 py-2.5 text-left text-sm transition-colors ${
                item.table === table
                  ? 'border-primary bg-primary-wash'
                  : 'border-line bg-white hover:bg-page'
              }`}
            >
              <span className="block font-semibold text-ink">{item.label}</span>
              <span className="text-2xs text-muted">
                แปลแล้ว {num(item.translated)} / {num(item.total)}
                {item.pending > 0 && (
                  <span className="ml-1 font-semibold text-gold-ink">
                    · ค้าง {num(item.pending)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-card border border-line bg-white">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-semibold text-ink">{current?.label}</h2>
            <p className="mt-0.5 text-2xs text-muted">
              กดที่รายการเพื่อดูและแก้คำแปลทั้งสองภาษา
            </p>
          </div>

          {!items ? (
            <div className="p-8">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              หมวดนี้ยังไม่มีเนื้อหาให้แปล
            </p>
          ) : (
            <ul>
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  table={table}
                  item={item}
                  onSaved={() => {
                    loadStatus();
                    loadItems();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={rebuildOpen}
        title="แปลใหม่ทั้งหมด"
        message="คำแปลเดิมทั้งหมดจะถูกลบแล้วแปลใหม่ รวมถึงคำแปลที่แก้ด้วยมือไว้ ดำเนินการต่อไหม"
        confirmLabel="แปลใหม่ทั้งหมด"
        onConfirm={rebuild}
        onCancel={() => setRebuildOpen(false)}
      />
    </AdminShell>
  );
}
