import { ProgressBar } from './ui';
import { num } from '../lib/format';
import { useT } from '../lib/i18n';

/**
 * แถบความคืบหน้าสู่ระดับถัดไป
 *
 * ระดับสูงสุดไม่มีเกณฑ์ถัดไป จึงแสดงเป็น "ไม่จำกัด" และเติมแถบเต็ม
 * ระดับอื่นเติมแถบตามสัดส่วนคะแนนต่อเกณฑ์ของระดับถัดไป
 */
export default function TierProgress({ points, target, nextTier, theme }) {
  const t = useT();
  const isTop = !target;
  const remaining = isTop ? 0 : Math.max(target - points, 0);

  return (
    <div>
      <p className={`mb-1 text-right text-2xs ${theme.muted}`}>
        {num(points)} / {isTop ? t('common.unlimited') : `${num(target)} P`}
      </p>

      <ProgressBar value={isTop ? 1 : points} max={isTop ? 1 : target} track={theme.track} />

      <p className={`mt-1.5 text-2xs ${theme.muted}`}>
        {isTop
          ? t('profile.highestTier')
          : t('home.toNextTier', { points: num(remaining), tier: nextTier })}
      </p>
    </div>
  );
}
