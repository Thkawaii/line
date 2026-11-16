import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './icons';
import { Modal, Notice } from './ui';

/**
 * เลือกรูปจากเครื่อง ครอปให้ได้สัดส่วนที่ต้องการ แล้วอัปโหลด
 *
 * ครอปด้วย canvas ของเบราว์เซอร์แล้วส่งเฉพาะส่วนที่ครอปไปเก็บ
 * จึงไม่ต้องอัปไฟล์ต้นฉบับขนาดใหญ่ขึ้นเซิร์ฟเวอร์
 *
 * aspect      สัดส่วนกว้างต่อสูงของกรอบครอป
 * outputWidth ความกว้างของไฟล์ที่ได้ ความสูงคำนวณจากสัดส่วน
 */
const VIEW_WIDTH = 520; // ความกว้างของกรอบครอปบนหน้าจอ
const MAX_ZOOM = 4;

export default function ImageCropper({
  value,
  onChange,
  aspect = 2.8,
  outputWidth = 1120,
  label = 'อัปโหลดรูปภาพ',
  hint = 'รองรับ JPG, PNG และ WEBP ขนาดไม่เกิน 5 MB',
}) {
  const fileRef = useRef(null);
  const frameRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);

  const [source, setSource] = useState(null); // รูปต้นฉบับที่เพิ่งเลือก
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const viewHeight = Math.round(VIEW_WIDTH / aspect);

  // zoom = 1 คือขนาดที่รูปคลุมกรอบพอดี
  const baseScale =
    size.width && size.height ? Math.max(VIEW_WIDTH / size.width, viewHeight / size.height) : 1;

  // ซูมออกได้จนเห็นรูปทั้งใบ (ย่อลงอีกนิดเพื่อเว้นขอบให้เห็นว่าหมดรูปแล้ว)
  const containScale =
    size.width && size.height ? Math.min(VIEW_WIDTH / size.width, viewHeight / size.height) : 1;
  const minZoom = size.width ? (containScale / baseScale) * 0.9 : 1;

  const drawWidth = size.width * baseScale * zoom;
  const drawHeight = size.height * baseScale * zoom;

  // ด้านที่รูปใหญ่กว่ากรอบ ห้ามลากจนเห็นขอบว่าง
  // ด้านที่รูปเล็กกว่ากรอบ (ตอนซูมออกมาก) ให้วางไว้กึ่งกลางแทน
  const clamp = useCallback(
    (next, w = drawWidth, h = drawHeight) => ({
      x: w >= VIEW_WIDTH ? Math.min(0, Math.max(VIEW_WIDTH - w, next.x)) : (VIEW_WIDTH - w) / 2,
      y: h >= viewHeight ? Math.min(0, Math.max(viewHeight - h, next.y)) : (viewHeight - h) / 2,
    }),
    [drawWidth, drawHeight, viewHeight]
  );

  useEffect(() => {
    setOffset((current) => clamp(current));
  }, [clamp]);

  function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // เลือกไฟล์เดิมซ้ำได้
    if (!file) return;

    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError('รองรับเฉพาะไฟล์ JPG, PNG และ WEBP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('ไฟล์ต้นฉบับใหญ่เกิน 10 MB');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        setSize({ width: image.naturalWidth, height: image.naturalHeight });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        setSource(reader.result);
      };
      image.onerror = () => setError('เปิดไฟล์รูปไม่สำเร็จ');
      image.src = reader.result;
    };
    reader.onerror = () => setError('อ่านไฟล์ไม่สำเร็จ');
    reader.readAsDataURL(file);
  }

  function startDrag(event) {
    event.preventDefault();
    frameRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
  }

  function moveDrag(event) {
    if (!dragRef.current) return;
    setOffset(clamp({ x: event.clientX - dragRef.current.x, y: event.clientY - dragRef.current.y }));
  }

  function endDrag(event) {
    frameRef.current?.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }

  // ซูมโดยยึดจุดกึ่งกลางกรอบ ภาพจะได้ไม่กระโดด
  function changeZoom(next) {
    const value = Math.min(MAX_ZOOM, Math.max(minZoom, next));
    const ratio = value / zoom;
    const centerX = VIEW_WIDTH / 2;
    const centerY = viewHeight / 2;

    setOffset((current) =>
      clamp(
        {
          x: centerX - (centerX - current.x) * ratio,
          y: centerY - (centerY - current.y) * ratio,
        },
        size.width * baseScale * value,
        size.height * baseScale * value
      )
    );
    setZoom(value);
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const outputHeight = Math.round(outputWidth / aspect);
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      // แปลงพิกัดบนหน้าจอให้เป็นพิกัดในไฟล์ต้นฉบับ
      const scale = baseScale * zoom;
      const sx = -offset.x / scale;
      const sy = -offset.y / scale;
      const sw = VIEW_WIDTH / scale;
      const sh = viewHeight / scale;

      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      // ถ้าซูมออกจนรูปเล็กกว่ากรอบ ส่วนที่เหลือจะเป็นพื้นขาวแทนที่จะโปร่งใส
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(imageRef.current, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

      const data = canvas.toDataURL('image/jpeg', 0.85);
      const { url } = await api.uploadImage(data);
      onChange(url);
      setSource(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="label">{label}</p>

      {value ? (
        <div className="overflow-hidden rounded-[10px] border border-line">
          <img src={value} alt="" className="block w-full" style={{ aspectRatio: aspect }} />
          <div className="flex items-center justify-between gap-2 border-t border-line bg-white px-3 py-2">
            <span className="truncate text-2xs text-muted">{value}</span>
            <div className="flex shrink-0 gap-3 text-sm">
              <button type="button" onClick={() => fileRef.current?.click()} className="text-primary">
                เปลี่ยนรูป
              </button>
              <button type="button" onClick={() => onChange('')} className="text-danger">
                ลบรูป
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-line bg-white py-8 text-muted hover:border-primary hover:text-primary"
        >
          <Icon.Import size={26} />
          <span className="text-sm font-medium">เลือกรูปจากเครื่อง</span>
          <span className="text-2xs">{hint}</span>
        </button>
      )}

      {error && !source && (
        <div className="mt-2">
          <Notice>{error}</Notice>
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />

      <Modal open={!!source} onClose={() => setSource(null)} size="lg">
        <div className="p-6">
          <h2 className="text-lg font-bold text-ink">ครอปรูปภาพ</h2>
          <p className="mt-1 text-sm text-muted">
            ลากเพื่อเลื่อนรูป ใช้แถบด้านล่างเพื่อซูมเข้าออก ซูมออกสุดจะเห็นรูปทั้งใบ
          </p>

          {error && (
            <div className="mt-3">
              <Notice>{error}</Notice>
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <div
              ref={frameRef}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative max-w-full cursor-grab touch-none overflow-hidden rounded-[10px] bg-[#1C2A32] active:cursor-grabbing"
              style={{ width: VIEW_WIDTH, height: viewHeight }}
            >
              {source && (
                <img
                  ref={imageRef}
                  src={source}
                  alt=""
                  draggable={false}
                  className="absolute left-0 top-0 max-w-none select-none"
                  style={{
                    width: drawWidth,
                    height: drawHeight,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                />
              )}

              {/* เส้นกริดช่วยจัดองค์ประกอบ */}
              <div className="pointer-events-none absolute inset-0 border border-white/70">
                <span className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => changeZoom(zoom - 0.2)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-slate"
              aria-label="ซูมออก"
            >
              −
            </button>
            <input
              type="range"
              min={minZoom}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              className="h-1.5 flex-1 accent-primary"
              aria-label="ระดับการซูม"
            />
            <button
              type="button"
              onClick={() => changeZoom(zoom + 0.2)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-slate"
              aria-label="ซูมเข้า"
            >
              +
            </button>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={() => setSource(null)} className="btn-ghost">
              ยกเลิก
            </button>
            <button type="button" onClick={save} disabled={busy} className="btn-primary">
              {busy ? 'กำลังอัปโหลด' : 'ใช้รูปนี้'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
