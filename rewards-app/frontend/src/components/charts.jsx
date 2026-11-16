import { useEffect, useRef, useState } from 'react';
import { num } from '../lib/format';
import { useT } from '../lib/i18n';
import { Icon } from './icons';

/**
 * กราฟที่ใช้ในหน้าการวิเคราะห์
 *
 * วาดด้วย SVG เองทั้งหมด ไม่ได้ใช้ไลบรารีกราฟ เพราะต้องการแค่ไม่กี่แบบ
 * และคุมหน้าตาให้ตรงกับไฟล์ออกแบบได้ง่ายกว่า
 */

export const CHART_COLORS = ['#8B5CF6', '#3B82F6', '#9AA3A3', '#00ADB0', '#FFA101'];

/*
โครงร่วมของกราฟที่เลื่อนดูตามแกนเวลาได้

แยกเป็นสองส่วนที่วางชิดกัน
  แกนตั้ง  อยู่นอกกรอบเลื่อน จึงติดอยู่กับที่เสมอ
  พื้นกราฟ อยู่ในกรอบเลื่อน เลื่อนไปดูเดือนอื่นได้

ที่ต้องแยกเพราะถ้าวาดแกนไว้ใน SVG เดียวกับพื้นกราฟ พอเลื่อนไปทางขวา
ตัวเลขบนแกนจะเลื่อนหายไปด้วย เหลือแต่แท่งลอย ๆ ที่อ่านไม่ออกว่าสูงเท่าไหร่
*/

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];

// ขีดสั้นคั่นกลางระหว่างตัวเลข ช่วยกะระดับโดยไม่ต้องมีเส้นตารางพาดทั้งกราฟ
const MINOR_TICKS = [0.1, 0.3, 0.5, 0.7, 0.9];

const AXIS_WIDTH = 62;

/*
MIN_PLOT ความกว้างขั้นต่ำของพื้นกราฟ

SVG ใช้ viewBox คู่กับ minWidth 100% ถ้า viewBox แคบกว่ากรอบที่วาดจริงมาก
เนื้อหาทั้งหมดจะถูกขยายตามสัดส่วน เลือกเดือนเดียวแล้ว viewBox เหลือ 76
แต่กรอบจริงกว้างราว 600 ทุกอย่างเลยใหญ่ขึ้นแปดเท่า จุดกลายเป็นวงกลมยักษ์
และชื่อเดือนใหญ่เต็มการ์ด

ตรึงขั้นต่ำไว้แล้วจัดเนื้อหาไว้กลาง ช่วงสั้นจึงยังวาดด้วยขนาดปกติ
*/
const MIN_PLOT = 520;


/**
 * niceMax ปัดเพดานของแกนขึ้นเป็นตัวเลขกลม ๆ
 *
 * ถ้าใช้ค่าสูงสุดจริงเป็นเพดาน แท่งที่สูงที่สุดจะชนขอบบนพอดีและดูอึดอัด
 * อีกทั้งตัวเลขบนแกนจะเป็นเศษอย่าง 8,137 ซึ่งอ่านยาก
 */
function niceMax(value) {
  /*
    ขั้นต่ำ 5 เพราะแกนแบ่งเป็น 5 ช่วง

    ถ้าเพดานน้อยกว่านี้ ตัวเลขแต่ละขีดจะเป็นเศษแล้วถูกปัดซ้ำกัน
    เช่นเพดาน 1.5 จะได้ "0 0 1 1 1 2" ซึ่งอ่านไม่รู้เรื่อง
    ตั้งขั้นต่ำไว้ 5 แล้วได้ "0 1 2 3 4 5" ทุกขีดเป็นจำนวนเต็มที่ต่างกัน
  */
  if (!Number.isFinite(value) || value <= 0) return 5;

  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (step * pow >= value) return Math.max(5, step * pow);
  }
  return Math.max(5, 10 * pow);
}

/**
 * แกนตั้ง วาดแยกไว้นอกกรอบเลื่อน จึงอยู่กับที่ตลอด
 *
 * ขีดยาวอยู่ตรงตัวเลข ขีดสั้นคั่นระหว่างตัวเลข
 * ช่วยกะระดับของแท่งที่อยู่ระหว่างสองตัวเลขได้โดยไม่ต้องมีเส้นตารางพาดทั้งกราฟ
 */
function YAxis({ height, padding, innerH, format }) {
  return (
    <svg
      width={AXIS_WIDTH}
      height={height}
      viewBox={`0 0 ${AXIS_WIDTH} ${height}`}
      className="block shrink-0"
      aria-hidden="true"
    >
      {MINOR_TICKS.map((t) => {
        const y = padding.top + innerH * (1 - t);
        return (
          <line key={t} x1={AXIS_WIDTH - 5} y1={y} x2={AXIS_WIDTH} y2={y} stroke="#1F3A4D" />
        );
      })}

      {TICKS.map((t) => {
        const y = padding.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line x1={AXIS_WIDTH - 9} y1={y} x2={AXIS_WIDTH} y2={y} stroke="#1F3A4D" />
            <text
              x={AXIS_WIDTH - 14}
              y={y + 4}
              textAnchor="end"
              className="fill-slate text-[11px]"
            >
              {format(t)}
            </text>
          </g>
        );
      })}

      <line
        x1={AXIS_WIDTH}
        y1={padding.top - 6}
        x2={AXIS_WIDTH}
        y2={padding.top + innerH}
        stroke="#1F3A4D"
        strokeWidth="2"
      />
    </svg>
  );
}

/**
 * เส้นฐานของพื้นกราฟ
 *
 * ไม่มีเส้นตารางแนวนอนพาดทั้งกราฟตามแบบที่ออกแบบไว้
 * ปล่อยให้พื้นโล่งแล้วใช้ขีดที่แกนแทน แท่งกับเส้นจึงเด่นขึ้นและดูสะอาดกว่า
 */
function PlotGrid({ width, padding, innerH }) {
  return (
    <line
      x1={0}
      y1={padding.top + innerH}
      x2={width}
      y2={padding.top + innerH}
      stroke="#1F3A4D"
      strokeWidth="2"
    />
  );
}

/**
 * roundedTopBar สร้างเส้นทางของแท่งที่มนเฉพาะมุมบน
 *
 * ใช้ rx ของ rect ไม่ได้เพราะจะมนทั้งสี่มุม แท่งเตี้ย ๆ จะกลายเป็นแคปซูล
 * และฐานแท่งจะลอยไม่ติดเส้นแกน
 */
function roundedTopBar(x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  const bottom = y + height;
  return `M ${x} ${bottom} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + width - r} ${y} Q ${
    x + width
  } ${y} ${x + width} ${y + r} L ${x + width} ${bottom} Z`;
}

/**
 * กล่องคำอธิบายตอนเอาเมาส์ชี้
 *
 * วาดเป็น SVG ไม่ใช่ div ลอยด้านบน เพราะกราฟเลื่อนแนวนอนได้
 * ถ้าใช้ div จะต้องคอยคำนวณตำแหน่งใหม่ทุกครั้งที่เลื่อน แล้วมักหลุดตำแหน่ง
 * วาดใน SVG เดียวกันแล้วกล่องเลื่อนไปพร้อมกราฟเอง
 *
 * lines  [{ label, value, color }] — color ใส่เมื่ออยากมีจุดสีนำหน้า
 */
function ChartTooltip({ x, y, title, lines, plotWidth }) {
  const lineHeight = 18;
  const padX = 10;
  const padY = 8;

  // กะความกว้างจากจำนวนตัวอักษร ตัวไทยกับตัวเลขกว้างไม่เท่ากัน จึงเผื่อไว้
  const longest = Math.max(
    title.length,
    ...lines.map((l) => l.label.length + String(l.value).length + 2)
  );
  const boxW = Math.max(118, longest * 7.4 + padX * 2 + 10);
  const boxH = padY * 2 + lineHeight * (lines.length + 1);

  // ไม่ให้กล่องล้นขอบซ้ายขวาของพื้นกราฟ
  const left = Math.min(Math.max(x - boxW / 2, 4), Math.max(4, plotWidth - boxW - 4));
  const top = Math.max(4, y - boxH - 14);

  return (
    <g pointerEvents="none">
      <rect
        x={left}
        y={top}
        width={boxW}
        height={boxH}
        rx="8"
        fill="#1F3A4D"
        opacity="0.96"
      />
      <text
        x={left + padX}
        y={top + padY + 13}
        className="fill-white text-[11px] font-semibold"
      >
        {title}
      </text>

      {lines.map((line, i) => {
        const ty = top + padY + 13 + lineHeight * (i + 1);
        return (
          <g key={line.label}>
            {line.color && <circle cx={left + padX + 4} cy={ty - 4} r="3.5" fill={line.color} />}
            <text
              x={left + padX + (line.color ? 14 : 0)}
              y={ty}
              className="fill-white/80 text-[11px]"
            >
              {line.label}
            </text>
            <text
              x={left + boxW - padX}
              y={ty}
              textAnchor="end"
              className="fill-white text-[11px] font-semibold"
            >
              {line.value}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * ChartFrame ประกอบแกนตั้งที่อยู่กับที่ เข้ากับพื้นกราฟที่เลื่อนได้
 *
 * children รับฟังก์ชันที่คืน SVG ของพื้นกราฟ โดยรับความกว้างจริงไปใช้
 */
function ChartFrame({ height, padding, innerH, plotWidth, format, children }) {
  const boxRef = useRef(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;

    const check = () => setScrollable(node.scrollWidth > node.clientWidth + 1);
    check();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, [plotWidth]);

  return (
    <div className="flex items-start">
      <YAxis height={height} padding={padding} innerH={innerH} format={format} />

      <div
        ref={boxRef}
        className={`chart-scroll min-w-0 flex-1 ${scrollable ? 'is-scrollable' : ''}`}
      >
        <svg
          viewBox={`0 0 ${plotWidth} ${height}`}
          style={{ width: plotWidth, minWidth: '100%' }}
          className="block"
          role="img"
        >
          <PlotGrid width={plotWidth} padding={padding} innerH={innerH} />
          {children}
        </svg>
      </div>
    </div>
  );
}

/**
 * กราฟเส้น ใช้กับแนวโน้มอัตราการเข้าร่วม
 *
 * เดือนที่ไม่มีข้อมูล (hasData เป็นเท็จ) จะเว้นว่างไว้ ไม่ลากเส้นผ่าน
 * เพราะการลากผ่านจุดศูนย์ทำให้ดูเหมือนเดือนนั้นมีกิจกรรมแต่ไม่มีคนมา
 * ทั้งที่จริงคือไม่ได้จัดกิจกรรมเลย เป็นคนละเรื่องกัน
 */
export function LineChart({ data, max = 100, suffix = '%', height = 240 }) {
  const [hover, setHover] = useState(null);
  const padding = { top: 18, right: 0, bottom: 34, left: 0 };
  const innerH = height - padding.top - padding.bottom;

  if (!data.length) return <EmptyChart height={height} />;

  // แต่ละเดือนกินที่เท่ากันเสมอ กราฟจึงกว้างตามช่วงที่เลือกแล้วเลื่อนดูเอา
  const slot = 76;
  const plotWidth = Math.max(MIN_PLOT, slot * data.length);
  // จัดกลุ่มไว้กลางพื้นกราฟเมื่อมีไม่กี่เดือน ไม่ให้ไปกองอยู่ชิดซ้าย
  const offset = (plotWidth - slot * data.length) / 2;
  const centerOf = (i) => offset + slot * i + slot / 2;

  /*
    ตัดเส้นเป็นช่วง ๆ ตามเดือนที่มีข้อมูลติดกัน
    เดือนที่ขาดไปตรงกลางจะทำให้เส้นขาดตรงนั้น ไม่ลากข้ามไปเอง
    เพราะ "ไม่ได้จัดกิจกรรม" กับ "จัดแล้วไม่มีคนมา" เป็นคนละเรื่องกัน
  */
  const segments = [];
  let current = [];
  data.forEach((d, i) => {
    if (d.hasData === false) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({
      x: centerOf(i),
      y: padding.top + innerH - (Math.min(d.value, max) / max) * innerH,
      index: i,
    });
  });
  if (current.length) segments.push(current);

  const hovered = hover !== null ? data[hover] : null;

  return (
    <ChartFrame
      height={height}
      padding={padding}
      innerH={innerH}
      plotWidth={plotWidth}
      format={(t) => `${Math.round(max * t)} ${suffix}`}
    >
      {segments.map((points, index) => (
        <path
          key={index}
          d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
          fill="none"
          stroke="#00ADB0"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {segments.flat().map((p) => (
        <circle key={p.index} cx={p.x} cy={p.y} r="5" fill="#00ADB0" />
      ))}

      {data.map((d, i) => (
        <text
          key={d.label}
          x={centerOf(i)}
          y={height - 10}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          {d.label}
        </text>
      ))}

      {/* แถบรับเมาส์เต็มความสูงของแต่ละเดือน ชี้ตรงไหนของคอลัมน์ก็ติด
          ไม่ต้องเล็งให้โดนจุดเล็ก ๆ ซึ่งบนจอสัมผัสแทบเป็นไปไม่ได้ */}
      {data.map((d, i) => (
        <rect
          key={`hit-${d.label}`}
          x={offset + slot * i}
          y={padding.top}
          width={slot}
          height={innerH}
          fill={hover === i ? '#00ADB0' : 'transparent'}
          opacity={hover === i ? 0.06 : 0}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onTouchStart={() => setHover(i)}
        />
      ))}

      {hovered && (
        <ChartTooltip
          x={centerOf(hover)}
          y={
            hovered.hasData === false
              ? padding.top + innerH / 2
              : padding.top + innerH - (Math.min(hovered.value, max) / max) * innerH
          }
          plotWidth={plotWidth}
          title={hovered.label}
          lines={[
            {
              label: 'อัตราการเข้าร่วม',
              value: hovered.hasData === false ? 'ไม่มีกิจกรรม' : `${hovered.value}%`,
              color: '#00ADB0',
            },
          ]}
        />
      )}
    </ChartFrame>
  );
}

/**
 * กราฟแท่งคู่ ใช้กับการเคลื่อนไหวของคะแนน
 *
 * แท่งซ้ายคือคะแนนที่แจก แท่งขวาคือคะแนนที่ใช้ และเส้นคือยอดคงเหลือสะสม
 * เดือนที่ไม่มีรายการเลยจะเว้นว่างไว้ ไม่วาดแท่งเป็นศูนย์
 */
export function PointsChart({ data, height = 260 }) {
  const [hover, setHover] = useState(null);
  const padding = { top: 18, right: 0, bottom: 34, left: 0 };
  const innerH = height - padding.top - padding.bottom;

  if (!data.length) return <EmptyChart height={height} />;

  const slot = 76;
  const plotWidth = Math.max(MIN_PLOT, slot * data.length);
  const offset = (plotWidth - slot * data.length) / 2;
  // แท่งคู่วางชิดกันตรงกลางช่อง เว้นระหว่างกันแค่ 3 จึงอ่านเป็นคู่เดียวกัน
  const barW = 18;
  const barGap = 3;
  const centerOf = (i) => offset + slot * i + slot / 2;

  /*
    เส้นในกราฟคือคะแนนที่เคลื่อนไหวรวมของแต่ละเดือน = แจก + ใช้

    เลือกค่านี้เพราะต้องการเส้นที่บอก "เดือนนี้คึกคักขึ้นหรือซบลงกว่าเดือนก่อน"
    ยอดคงเหลือสะสมทำหน้าที่นั้นไม่ได้ เพราะมันขึ้นอย่างเดียวตามเวลา
    เดือนที่เงียบก็ยังเห็นเส้นสูงขึ้นเรื่อย ๆ อ่านแนวโน้มไม่ออก

    อีกข้อดีคือผลรวมย่อมมากกว่าหรือเท่ากับแท่งที่สูงที่สุดเสมอ
    เส้นจึงลอยอยู่เหนือแท่งเองตามธรรมชาติ ตรงกับแบบที่ออกแบบไว้
    โดยไม่ต้องใช้ตัวเลขจากนอกช่วงเวลามาดันให้สูง
  */
  const movement = data.map((d) => (d.given || 0) + (d.used || 0));

  /*
    ยกเส้นขึ้นจากยอดแท่งเล็กน้อย

    เดือนที่ยังไม่มีใครใช้คะแนน ผลรวมจะเท่ากับคะแนนที่แจกพอดี
    เส้นกับยอดแท่งจึงทับกันสนิทจนดูเหมือนเส้นหายไป
    ยกขึ้นไม่กี่พิกเซลแล้วอ่านออกทันทีว่าเป็นคนละเส้นกัน

    เป็นการขยับเพื่อการมองเห็นเท่านั้น ไม่ได้แก้ตัวเลข
    ตัวเลขจริงอยู่ในกล่องที่ขึ้นตอนเอาเมาส์ชี้
  */
  const LINE_LIFT = 9;

  const peak = Math.max(1, ...movement);
  const scaleMax = niceMax(peak * 1.15);

  const y = (value) => padding.top + innerH - (value / scaleMax) * innerH;

  // ตำแหน่งของเส้น ยกขึ้นจากค่าจริงเล็กน้อย และไม่ให้ล้นขอบบน
  const yLine = (value) => Math.max(padding.top, y(value) - LINE_LIFT);

  // เดือนที่ไม่มีรายการเว้นเส้นขาดตรงนั้น ไม่ลากข้ามไปเอง
  const segments = [];
  let current = [];
  data.forEach((d, i) => {
    if (d.hasData === false) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ x: centerOf(i), y: yLine(movement[i]), index: i });
  });
  if (current.length) segments.push(current);

  const floor = padding.top + innerH;
  const hovered = hover !== null ? data[hover] : null;

  return (
    <ChartFrame
      height={height}
      padding={padding}
      innerH={innerH}
      plotWidth={plotWidth}
      format={(t) => axisNumber(scaleMax * t)}
    >
      {data.map((d, i) => {
        if (d.hasData === false) return null;
        const base = centerOf(i);

        return (
          <g key={d.label}>
            <path
              d={roundedTopBar(
                base - barW - barGap / 2,
                y(d.given),
                barW,
                Math.max(0, floor - y(d.given)),
                4
              )}
              fill="#1FC2A0"
            />
            <path
              d={roundedTopBar(
                base + barGap / 2,
                y(d.used),
                barW,
                Math.max(0, floor - y(d.used)),
                4
              )}
              fill="#3B6DF5"
            />
          </g>
        );
      })}

      {segments.map((points, index) => {
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        return (
          <g key={index}>
            {/* เส้นขาวหนากว่าวางไว้ข้างล่าง เป็นขอบให้เส้นหลัก
                ช่วงที่เส้นเฉียดยอดแท่งจะยังแยกออกจากกันได้ด้วยตา */}
            <path
              d={d}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={d}
              fill="none"
              stroke="#00ADB0"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {segments.flat().map((p) => (
        <circle
          key={p.index}
          cx={p.x}
          cy={p.y}
          r="4.5"
          fill="#00ADB0"
          stroke="#FFFFFF"
          strokeWidth="1.5"
        />
      ))}

      {data.map((d, i) => (
        <text
          key={d.label}
          x={centerOf(i)}
          y={height - 10}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          {d.label}
        </text>
      ))}

      {/* แถบรับเมาส์เต็มความสูงของแต่ละเดือน ชี้ตรงไหนของคอลัมน์ก็ติด
          ไม่ต้องเล็งให้โดนแท่งซึ่งบางเดือนเตี้ยมากจนแทบจิ้มไม่โดน */}
      {data.map((d, i) => (
        <rect
          key={`hit-${d.label}`}
          x={offset + slot * i}
          y={padding.top}
          width={slot}
          height={innerH}
          fill={hover === i ? '#00ADB0' : 'transparent'}
          opacity={hover === i ? 0.06 : 0}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onTouchStart={() => setHover(i)}
        />
      ))}

      {hovered && (
        <ChartTooltip
          x={centerOf(hover)}
          y={hovered.hasData === false ? padding.top + innerH / 2 : yLine(movement[hover])}
          plotWidth={plotWidth}
          title={hovered.label}
          lines={
            hovered.hasData === false
              ? [{ label: 'ไม่มีรายการในเดือนนี้', value: '' }]
              : [
                  { label: 'คะแนนที่แจก', value: num(hovered.given), color: '#1FC2A0' },
                  { label: 'คะแนนที่ใช้', value: num(hovered.used), color: '#3B6DF5' },
                  {
                    label: 'เคลื่อนไหวรวม',
                    value: num(movement[hover]),
                    color: '#00ADB0',
                  },
                ]
          }
        />
      )}
    </ChartFrame>
  );
}

/**
 * กราฟแท่งค่าเดียวต่อเดือน ใช้กับคะแนนเฉลี่ยของแบบประเมิน
 *
 * เพดานตรึงไว้ตามที่ส่งมา (คะแนนเต็ม) ไม่ปรับตามข้อมูล
 * ถ้าปรับตามข้อมูล เดือนที่ได้ 3.2 จะเห็นแท่งเต็มกรอบ ซึ่งอ่านแล้วเข้าใจผิดว่าดีเยี่ยม
 *
 * เดือนที่ไม่มีใครตอบเว้นว่างไว้ ไม่วาดแท่งศูนย์
 * เพราะ "ไม่มีใครตอบ" กับ "ตอบแล้วได้ศูนย์" เป็นคนละเรื่องกัน
 */
/**
 * สีประจำกิจกรรมในกราฟแท่งแบบจัดกลุ่ม
 *
 * ไล่วนตามลำดับที่กิจกรรมปรากฏ ไม่สุ่ม กิจกรรมเดิมจึงได้สีเดิมทุกครั้งที่เปิดหน้า
 * ถ้าสุ่มสี ผู้ใช้จะจำไม่ได้ว่าแท่งสีไหนคืองานอะไร
 */
export const SERIES_COLORS = [
  '#1FC2A0',
  '#3B6DF5',
  '#F0994B',
  '#9B6BDF',
  '#E2607A',
  '#2FA8C9',
  '#6FA82E',
  '#D4A017',
];

/**
 * กราฟแท่งคะแนน รองรับหลายกิจกรรมในเดือนเดียวกัน
 *
 * months  [{ label, bars: [{ key, name, value, answers }] }]
 *         เดือนที่ไม่มีใครตอบส่ง bars เป็นอาเรย์ว่าง แล้วจะเว้นว่างไว้
 *
 * เพดานตรึงไว้ตามคะแนนเต็ม ไม่ปรับตามข้อมูล
 * ถ้าปรับตามข้อมูล เดือนที่ได้ 3.2 จะเห็นแท่งเต็มกรอบ ซึ่งอ่านแล้วเข้าใจผิดว่าดีเยี่ยม
 */
export function ScoreBarChart({ months, colorOf, max = 5, label = 'คะแนนเฉลี่ย', height = 240 }) {
  const [hover, setHover] = useState(null);
  const padding = { top: 18, right: 0, bottom: 34, left: 0 };
  const innerH = height - padding.top - padding.bottom;

  if (!months.length) return <EmptyChart height={height} />;

  /*
    ความกว้างของช่องเดือนโตตามจำนวนแท่งที่มากที่สุดในเดือนใดเดือนหนึ่ง
    ทุกเดือนใช้ความกว้างเท่ากัน แท่งจึงขนาดเท่ากันหมดและเทียบด้วยตาได้ตรง ๆ
  */
  const widest = Math.max(1, ...months.map((m) => m.bars.length));
  const barW = widest > 3 ? 16 : 24;
  const barGap = 4;
  const slot = Math.max(76, widest * (barW + barGap) + 28);

  const plotWidth = Math.max(MIN_PLOT, slot * months.length);
  const offset = (plotWidth - slot * months.length) / 2;
  const centerOf = (i) => offset + slot * i + slot / 2;

  const y = (value) => padding.top + innerH - (Math.min(value, max) / max) * innerH;
  const floor = padding.top + innerH;

  // ตำแหน่งซ้ายสุดของแท่งแรกในเดือนนั้น จัดกลุ่มให้อยู่กลางช่อง
  const groupLeft = (i, count) => centerOf(i) - (count * barW + (count - 1) * barGap) / 2;

  const hovered = hover ? months[hover.month]?.bars[hover.bar] : null;

  return (
    <ChartFrame
      height={height}
      padding={padding}
      innerH={innerH}
      plotWidth={plotWidth}
      format={(t) => String(Math.round(max * t * 10) / 10)}
    >
      {months.map((month, i) =>
        month.bars.map((bar, j) => (
          <path
            key={`${month.label}-${bar.key}`}
            d={roundedTopBar(
              groupLeft(i, month.bars.length) + j * (barW + barGap),
              y(bar.value),
              barW,
              floor - y(bar.value),
              5
            )}
            fill={colorOf(bar.key)}
            opacity={hover && (hover.month !== i || hover.bar !== j) ? 0.45 : 1}
            onMouseEnter={() => setHover({ month: i, bar: j })}
            onMouseLeave={() => setHover(null)}
            onTouchStart={() => setHover({ month: i, bar: j })}
          />
        ))
      )}

      {months.map((month, i) => (
        <text
          key={month.label}
          x={centerOf(i)}
          y={height - 10}
          textAnchor="middle"
          className="fill-muted text-[11px]"
        >
          {month.label}
        </text>
      ))}

      {hovered && (
        <ChartTooltip
          x={
            groupLeft(hover.month, months[hover.month].bars.length) +
            hover.bar * (barW + barGap) +
            barW / 2
          }
          y={y(hovered.value)}
          plotWidth={plotWidth}
          title={months[hover.month].label}
          lines={[
            {
              // ตัดชื่อยาวก่อนใส่กล่อง ไม่งั้นกล่องจะกว้างจนล้นพื้นกราฟ
              label:
                hovered.name.length > 26 ? `${hovered.name.slice(0, 26)}…` : hovered.name,
              value: '',
              color: colorOf(hovered.key),
            },
            { label, value: `${hovered.value} / ${max}` },
            { label: 'ผู้ตอบ', value: `${num(hovered.answers || 0)} คน` },
          ]}
        />
      )}
    </ChartFrame>
  );
}

/**
 * โดนัท ใช้กับความถี่การเข้าร่วมและสัดส่วนการแลกรางวัล
 *
 * ส่ง onPick มาจะกดเลือกช่วงได้ ทั้งที่วงกลมและที่รายการด้านข้าง
 * ให้กดได้สองที่เพราะชิ้นเล็ก ๆ บนวงกลมกดยาก โดยเฉพาะบนมือถือ
 */
export function DonutChart({ items, total, centerLabel, centerValue, centerUnit, onPick }) {
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
          arcs.map((a, index) => (
            <path
              key={a.label}
              d={a.arc}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              onClick={onPick ? () => onPick(index) : undefined}
              className={onPick ? 'cursor-pointer' : undefined}
            />
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

      <ul className="min-w-[180px] space-y-1 text-sm">
        {arcs.map((a, index) => {
          const row = (
            <>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="flex-1 truncate text-left text-slate">{a.label}</span>
              <span className="shrink-0 text-right">
                <b style={{ color: a.color }}>{(a.share * 100).toFixed(2)}%</b>
                <span className="ml-1 text-2xs text-muted">({num(a.value)})</span>
              </span>
            </>
          );

          return (
            <li key={a.label}>
              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(index)}
                  className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1 hover:bg-primary-wash"
                >
                  {row}
                  <Icon.Next size={14} />
                </button>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1">{row}</div>
              )}
            </li>
          );
        })}
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
  const t = useT();

  return (
    <div
      className="grid place-items-center rounded-[10px] bg-page text-sm text-muted"
      style={{ height }}
    >
      {t('common.noData')}
    </div>
  );
}

/**
 * ย่อตัวเลขบนแกน เช่น 500000 เป็น "500 K"
 *
 * เว้นวรรคหน้าหน่วยตามแบบที่ออกแบบไว้ อ่านง่ายกว่าติดกัน
 * และไม่ใส่ทศนิยมถ้าหารลงตัว แกนจะได้ไม่รก
 */
function axisNumber(value) {
  const abs = Math.abs(value);
  // รองรับถึงหลักพันล้าน ไม่งั้นเลขใหญ่จะกลายเป็น "1500 M" ซึ่งยาวและอ่านยาก
  if (abs >= 1e9) return `${trimZero(value / 1e9)} B`;
  if (abs >= 1e6) return `${trimZero(value / 1e6)} M`;
  if (abs >= 1000) return `${trimZero(value / 1000)} K`;
  return String(Math.round(value));
}

function trimZero(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
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
