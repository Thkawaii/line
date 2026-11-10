/**
 * เนื้อหานโยบายเก็บในฐานข้อมูลเป็นข้อความธรรมดา
 * รองรับหัวข้อที่ขึ้นต้นด้วย ## และรายการที่ขึ้นต้นด้วย -
 */
export default function PolicyBody({ content = '' }) {
  const blocks = content.split('\n');

  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-slate">
      {blocks.map((line, index) => {
        const text = line.trim();
        if (!text) return <div key={index} className="h-1" />;

        if (text.startsWith('## ')) {
          return (
            <h2 key={index} className="pt-2 text-base font-bold text-ink">
              {text.slice(3)}
            </h2>
          );
        }
        if (text.startsWith('- ') || text.startsWith('• ')) {
          return (
            <p key={index} className="flex gap-2 pl-1">
              <span aria-hidden="true">•</span>
              <span>{text.slice(2)}</span>
            </p>
          );
        }
        return <p key={index}>{text}</p>;
      })}
    </div>
  );
}
