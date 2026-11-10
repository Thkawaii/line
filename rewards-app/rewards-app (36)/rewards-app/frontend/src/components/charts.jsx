import { num } from '../lib/format';

/**
 * กราฟที่ใช้ในหน้าการวิเคราะห์
 *
 * วาดด้วย SVG เองทั้งหมด ไม่ได้ใช้ไลบรารีกราฟ เพราะต้องการแค่ไม่กี่แบบ
 * และคุมหน้าตาให้ตรงกับไฟล์ออกแบบได้ง่ายกว่า
 */

export const CHART_COLORS = ['#8B5CF6', '#3B82F6', '#9AA3A3', '#00ADB0', '#FFA101'];

/** กราฟเส้น ใช้กับแนวโน้มอัตราการเข้าร่วม */
export function LineChart({ data, max = 100, suffix = '%', height = 220 }) {
  const width = 560;
  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (!data.length) return <EmptyChart height={height} />;

  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pointAt = (index, value) => ({
    x: padding.left + stepX * index + (data.length === 1 ? innerW / 2 : 0),
    y: padding.top + innerH - (Math.min(value, max) / max) * innerH,
  });

  const points = data.map((d, i) => pointAt(i, d.value));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padding.top + innerH * t;
        return (
          <g key={t}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#EEEEEE" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-muted text-[10px]">
              {Math.round(max * (1 - t))}
              {suffix}
            </text>
          </g>
        );
      })}

      <path d={path} fill="none" stroke="#00ADB0" strokeWidth="2.5" strokeLinejoin="round" />

      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="#00ADB0" />
      ))}

      {data.map((d, i) => (
        <text
          key={d.label}
          x={points[i].x}
          y={height - 8}
          textAnchor="middle"
          className="fill-muted text-[10px]"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}

/** กราฟแท่งคู่พร้อมเส้นสะสม ใช้กับการเคลื่อนไหวของคะแนน */
export function PointsChart({ data, height = 220 }) {
  const width = 560;
  const padding = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  if (!data.length) return <EmptyChart height={height} />;

  const max = Math.max(1, ...data.map((d) => Math.max(d.given, d.used)));
  const slot = innerW / data.length;
  const barW = Math.min(16, slot / 3);

  // เส้นคะแนนคงเหลือสะสม คำนวณจากผลต่างของแต่ละเดือนบวกต่อกันไป
  let running = 0;
  const cumulative = data.map((d) => {
    running += d.given - d.used;
    return running;
  });
  const maxCumulative = Math.max(1, ...cumulative.map(Math.abs));

  const y = (value) => padding.top + innerH - (value / max) * innerH;
  const yLine = (value) => padding.top + innerH - (value / maxCumulative) * innerH;

  const linePath = cumulative
    .map((value, i) => {
      const x = padding.left + slot * i + slot / 2;
      return `${i === 0 ? 'M' : 'L'} ${x} ${yLine(value)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const gy = padding.top + innerH * t;
        return (
          <g key={t}>
            <line x1={padding.left} y1={gy} x2={width - padding.right} y2={gy} stroke="#EEEEEE" />
            <text x={padding.left - 8} y={gy + 4} textAnchor="end" className="fill-muted text-[10px]">
              {shortNumber(max * (1 - t))}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const base = padding.left + slot * i + slot / 2;
        return (
          <g key={d.label}>
            <rect
              x={base - barW - 2}
              y={y(d.given)}
              width={barW}
              height={padding.top + innerH - y(d.given)}
              rx="3"
              fill="#00ADB0"
            />
            <rect
              x={base + 2}
              y={y(d.used)}
              width={barW}
              height={padding.top + innerH - y(d.used)}
              rx="3"
              fill="#3B82F6"
            />
            <text x={base} y={height - 8} textAnchor="middle" className="fill-muted text-[10px]">
              {d.label}
            </text>
          </g>
        );
      })}

      <path d={linePath} fill="none" stroke="#193B44" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  );
}

/** โดนัท ใช้กับความถี่การเข้าร่วมและสัดส่วนการแลกรางวัล */
export function DonutChart({ items, total, centerLabel, centerValue, centerUnit }) {
  const size = 200;
  const radius = 76;
  const thickness = 26;
  const center = size / 2;

  const sum = total || items.reduce((acc, item) => acc + item.value, 0);

  let angle = -90;
  const arcs = items.map((item, index) => {
    const share = sum > 0 ? item.value / sum : 0;
    const sweep = share * 360;
    const arc = describeArc(center, center, radius, angle, angle + sweep);
    angle += sweep;
    return { arc, color: CHART_COLORS[index % CHART_COLORS.length], share, ...item };
  });

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 shrink-0" role="img">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#F1F3F4" strokeWidth={thickness} />
        {sum > 0 &&
          arcs.map((a) => (
            <path key={a.label} d={a.arc} fill="none" stroke={a.color} strokeWidth={thickness} />
          ))}
        <text x={center} y={center - 6} textAnchor="middle" className="fill-muted text-[10px]">
          {centerLabel}
        </text>
        <text x={center} y={center + 14} textAnchor="middle" className="fill-ink text-[20px] font-bold">
          {num(centerValue ?? sum)}
        </text>
        {centerUnit && (
          <text x={center} y={center + 28} textAnchor="middle" className="fill-muted text-[10px]">
            {centerUnit}
          </text>
        )}
      </svg>

      <ul className="min-w-[180px] space-y-2 text-sm">
        {arcs.map((a) => (
          <li key={a.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="flex-1 truncate text-slate">{a.label}</span>
            <span className="shrink-0 text-right">
              <b style={{ color: a.color }}>{(a.share * 100).toFixed(2)}%</b>
              <span className="ml-1 text-2xs text-muted">({num(a.value)})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** แถบความคืบหน้าพร้อมตัวเลขท้ายแถว ใช้กับอันดับกิจกรรมและแผนก */
export function RankBar({ value, max = 100, tone = 'bg-primary' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-pill bg-primary-wash">
      <div className={`h-full rounded-pill ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function EmptyChart({ height }) {
  return (
    <div
      className="grid place-items-center rounded-[10px] bg-page text-sm text-muted"
      style={{ height }}
    >
      ยังไม่มีข้อมูลในช่วงนี้
    </div>
  );
}

function shortNumber(value) {
  if (value >= 1000000) return `${Math.round(value / 100000) / 10}M`;
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`;
  return Math.round(value);
}

function polar(cx, cy, radius, degrees) {
  const rad = ((degrees - 0) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  // วงกลมเต็มวาดเป็นส่วนโค้งเดียวไม่ได้ ต้องแบ่งเป็นสองครึ่ง
  if (endAngle - startAngle >= 359.99) {
    const half = describeArc(cx, cy, radius, startAngle, startAngle + 180);
    const rest = describeArc(cx, cy, radius, startAngle + 180, startAngle + 359.99);
    return `${half} ${rest}`;
  }

  const start = polar(cx, cy, radius, endAngle);
  const end = polar(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
