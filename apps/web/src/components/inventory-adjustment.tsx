'use client';

import { useState } from 'react';

export type AdjustStock = (id: number, delta: number) => void | boolean | Promise<void | boolean>;

export default function InventoryAdjustment({ id, name, unit, available, adjust }: { id: number; name: string; unit: string; available: number; adjust: AdjustStock }) {
  const [mode, setMode] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amount = Number(quantity);
  const valid = Number.isFinite(amount) && amount > 0;
  const exceedsStock = mode === 'remove' && valid && amount > available;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || exceedsStock || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await adjust(id, mode === 'add' ? amount : -amount);
      if (result !== false) setQuantity('');
    } catch {
      setError('Không lưu được điều chỉnh. Vui lòng thử lại.');
    } finally { setSaving(false); }
  }

  return <form onSubmit={submit} className="w-full max-w-[396px]">
    <div className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-2">
      <select aria-label={`Thao tác tồn kho ${name}`} value={mode} disabled={saving} onChange={event => setMode(event.target.value)} className="h-9 w-full rounded-lg border bg-white px-2 text-xs"><option value="add">Thêm</option><option value="remove">Bớt</option></select>
      <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border bg-white px-2">
        <input aria-label={`Số lượng điều chỉnh ${name}`} type="number" min="0" step="any" placeholder="Số lượng" value={quantity} disabled={saving} onChange={event => setQuantity(event.target.value)} className="w-full min-w-0 bg-transparent text-xs outline-none" />
        <span title={unit} className="max-w-[40%] shrink-0 truncate text-right text-xs text-slate-500">{unit}</span>
      </label>
      <button type="submit" disabled={!valid || exceedsStock || saving} className="h-9 w-full whitespace-nowrap rounded-lg bg-[#176b52] px-3 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Đang lưu…' : 'Áp dụng'}</button>
    </div>
    {exceedsStock && <p role="alert" className="mt-2 text-xs text-rose-600">Chỉ có thể bớt tối đa {available} {unit}.</p>}
    {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
  </form>;
}
