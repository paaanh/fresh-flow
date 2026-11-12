'use client';

import { useEffect, useMemo, useState } from 'react';
import { freshflow } from '@/lib/api';

/** Common phrasings; the delivery slots configured in the system are added below them. */
const PRESETS = [
  'Giao trong ngày',
  'Giao nhanh trong ngày (11:30 - 18:30)',
  'Giao sáng mai (7:30 - 9:30)',
  'Đặt trước 1 ngày, giao hôm sau',
  'Nhận tại điểm giao tập trung',
];
const CUSTOM = '__custom__';

/** "Thời gian giao hàng" of a post: pick from a list, or type something else. */
export default function DeliveryTimeSelect({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [slots, setSlots] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    let alive = true;
    freshflow
      .deliverySlots<{ name: string; is_active?: boolean; start_time?: string | null; end_time?: string | null }>()
      .then(list => {
        if (!alive) return;
        setSlots(list.filter(s => s.is_active !== false).map(s => (s.start_time && !s.name.includes(s.start_time) ? `${s.name} (${s.start_time} - ${s.end_time || ''})` : s.name)));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const options = useMemo(() => Array.from(new Set([...PRESETS, ...slots])), [slots]);
  // A saved value that is not in the list is shown as "Khác" with its text
  const isCustom = custom || (value.trim() !== '' && !options.includes(value));

  return (
    <div className="space-y-2">
      <select
        aria-label="Thời gian giao hàng"
        value={isCustom ? CUSTOM : value}
        onChange={e => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
            if (options.includes(value)) onChange('');
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className={`${className} cursor-pointer`}
      >
        <optgroup label="Thông dụng">
          {PRESETS.map(o => <option key={o} value={o}>{o}</option>)}
        </optgroup>
        {slots.filter(s => !PRESETS.includes(s)).length > 0 && (
          <optgroup label="Khung giờ giao của hệ thống">
            {slots.filter(s => !PRESETS.includes(s)).map(o => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        )}
        <option value={CUSTOM}>Khác (tự nhập)…</option>
      </select>
      {isCustom && (
        <input
          autoFocus={custom}
          value={value}
          onChange={e => onChange(e.target.value)}
          maxLength={100}
          placeholder="VD: Giao 11h30 và 17h30 hôm nay"
          aria-label="Thời gian giao hàng khác"
          className={className}
        />
      )}
    </div>
  );
}
