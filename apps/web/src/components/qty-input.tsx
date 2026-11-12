'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import { formatQty, isDecimalUnit, minQty, normalizeQty, parseQty, qtyStep, roundQty } from '@/lib/quantity';

/**
 * − [quantity] + with typing: "1,5" works for goods sold by weight (kg, lạng…).
 * onChange(0) is only sent by the − button when allowZero is set (removes the line).
 */
export default function QtyInput({
  value,
  unit,
  max,
  onChange,
  allowZero = false,
  disabled = false,
  label = 'Số lượng',
  size = 'md',
  showUnit = false,
}: {
  value: number;
  unit?: string | null;
  max?: number;
  onChange: (next: number) => void;
  /** − below the minimum sends 0 (cart lines / product cards remove the item). */
  allowZero?: boolean;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md';
  showUnit?: boolean;
}) {
  const [text, setText] = useState(formatQty(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(formatQty(value)); }, [value, editing]);

  const step = qtyStep(unit);
  const min = minQty(unit);
  const atMax = max != null && Number.isFinite(max) && value >= max - 1e-9;
  const commit = (raw: string) => {
    setEditing(false);
    const q = parseQty(raw);
    if (!Number.isFinite(q) || q <= 0) {
      setText(formatQty(value));
      return;
    }
    const next = normalizeQty(q, unit, max);
    setText(formatQty(next));
    if (next !== value) onChange(next);
  };
  const down = () => {
    const next = roundQty(value - step);
    if (next < min - 1e-9) {
      if (allowZero) onChange(0);
      return;
    }
    onChange(normalizeQty(next, unit, max));
  };
  const up = () => onChange(normalizeQty(roundQty(value + step), unit, max));

  const h = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <span className={`inline-flex items-center rounded-lg border border-[#d2ddd5] bg-white ${disabled ? 'opacity-50' : ''}`}>
      <button type="button" aria-label={`Giảm ${label}`} disabled={disabled || (!allowZero && value <= min + 1e-9)} onClick={down} className={`flex ${h} w-8 items-center justify-center text-[#286947] disabled:opacity-30`}>
        <FontAwesomeIcon icon={faMinus} className="text-[10px]" />
      </button>
      <input
        type="text"
        inputMode={isDecimalUnit(unit) ? 'decimal' : 'numeric'}
        aria-label={label}
        disabled={disabled}
        value={text}
        onFocus={e => { setEditing(true); e.currentTarget.select(); }}
        onChange={e => setText(e.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={`${h} w-12 min-w-0 bg-transparent text-center text-sm font-extrabold text-[#1e3a2c] outline-none`}
      />
      {showUnit && unit && <span className="pr-1 text-[10px] font-semibold text-[#6f8a7a]">{unit}</span>}
      <button type="button" aria-label={`Tăng ${label}`} disabled={disabled || atMax} onClick={up} className={`flex ${h} w-8 items-center justify-center text-[#286947] disabled:opacity-30`}>
        <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
      </button>
    </span>
  );
}
