/**
 * กลุ่มช่องกรอกข้อความของฟอร์มฝั่งแอดมิน
 *
 * เดิมมีแท็บสลับภาษาไว้กรอกคำแปล แต่ตกลงกันว่าผู้ดูแลกรอกภาษาไทยอย่างเดียว
 * จึงเหลือเฉพาะช่องภาษาไทย ส่วนที่เก็บคำแปลในฐานข้อมูลยังอยู่
 * ถ้าภายหลังอยากกรอกคำแปลอีก เพิ่มแท็บกลับมาที่ไฟล์นี้ไฟล์เดียว
 *
 * fields   รายการช่อง [{ name, label, type: 'text' | 'textarea', rows, required, placeholder, full }]
 * value    ค่าปัจจุบันของฟอร์ม
 * onChange เรียกเมื่อค่าเปลี่ยน
 */
export default function TranslatedFields({ fields, value, onChange }) {
  const write = (name, next) => onChange({ ...value, [name]: next });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const full = field.type === 'textarea' || field.full;

        return (
          <div key={field.name} className={full ? 'sm:col-span-2' : ''}>
            <label className="label" htmlFor={field.name}>
              {field.label}
              {field.required ? ' *' : ''}
            </label>

            {field.type === 'textarea' ? (
              <textarea
                id={field.name}
                rows={field.rows || 3}
                className="field"
                value={value[field.name] ?? ''}
                onChange={(e) => write(field.name, e.target.value)}
                required={field.required}
                placeholder={field.placeholder}
              />
            ) : (
              <input
                id={field.name}
                className="field"
                value={value[field.name] ?? ''}
                onChange={(e) => write(field.name, e.target.value)}
                required={field.required}
                placeholder={field.placeholder}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
