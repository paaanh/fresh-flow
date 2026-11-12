'use client';

import { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import ProductPhoto from '@/components/product-photo';
import { normalizeSearch } from '@/lib/search';
import type { Product } from '@/types/domain';

export type PickedItem = { product: Product; quantity: number };

/**
 * Search box over existing products. Results show physical stock and the quantity
 * still available (stock minus reservations). The chosen quantity can never exceed
 * what is available; the backend enforces the same rule.
 */
export default function ProductPicker({
  products,
  onPick,
  actionLabel = 'Pick',
  excludeIds = [],
  placeholder = 'Tìm mặt hàng có sẵn để Pick (tên, danh mục)…',
  busy = false,
}: {
  products: Product[];
  onPick: (item: PickedItem) => void | Promise<unknown>;
  actionLabel?: string;
  excludeIds?: number[];
  placeholder?: string;
  busy?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState<number>(1);

  const results = useMemo(() => {
    const q = normalizeSearch(query.trim());
    if (!q) return [];
    return products
      .filter(p => !excludeIds.includes(p.id))
      .filter(p => normalizeSearch(`${p.name} ${p.category}`).includes(q))
      .sort((a, b) => b.available - a.available)
      .slice(0, 8);
  }, [products, query, excludeIds]);

  const max = selected ? Math.max(0, selected.available) : 0;
  const over = selected ? qty > max : false;
  const invalid = !selected || !(qty > 0) || over;

  const choose = (p: Product) => {
    setSelected(p);
    setQty(p.available >= 1 ? 1 : p.available);
  };

  const submit = async () => {
    if (!selected || invalid) return;
    await onPick({ product: selected, quantity: qty });
    setSelected(null);
    setQuery('');
    setQty(1);
  };

  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">{placeholder}</span>
        <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border border-[#d2ddd5] bg-white pl-9 pr-3 text-xs focus:border-[#176b52] focus:outline-none"
        />
      </label>

      {query && !selected && (
        <ul className="max-h-72 divide-y divide-[#f0f4f1] overflow-y-auto rounded-xl border border-[#e3ece6] bg-white" role="listbox">
          {results.length === 0 && <li className="p-3 text-center text-[11px] text-slate-400">Không tìm thấy mặt hàng phù hợp.</li>}
          {results.map(p => {
            const empty = p.available <= 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={empty}
                  onClick={() => choose(p)}
                  className="flex w-full items-center gap-2.5 p-2.5 text-left hover:bg-[#f6faf7] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg"><ProductPhoto product={p} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[#1e2d25]">{p.name}</span>
                    <span className="block truncate text-[10px] text-slate-400">{p.category}</span>
                  </span>
                  <span className="shrink-0 text-right text-[10px]">
                    <span className={`block font-extrabold ${empty ? 'text-rose-600' : 'text-[#176b52]'}`}>{empty ? 'Hết hàng' : `Khả dụng ${p.available} ${p.unit}`}</span>
                    {p.stock != null && <span className="block text-slate-400">Tồn {p.stock} · Giữ {p.reserved ?? 0}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected && (
        <div className="rounded-xl border border-[#cfe3d6] bg-[#f6faf7] p-2.5">
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg"><ProductPhoto product={selected} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{selected.name}</div>
              <div className="text-[10px] text-slate-500">Khả dụng tối đa: <b>{max} {selected.unit}</b></div>
            </div>
            <button type="button" aria-label="Bỏ chọn" onClick={() => setSelected(null)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-lg border bg-white px-2">
              <span className="sr-only">Số lượng</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={max}
                step="any"
                value={qty || ''}
                onChange={e => setQty(Number(e.target.value))}
                className="w-full min-w-0 bg-transparent text-xs font-bold outline-none"
              />
              <span className="shrink-0 text-[11px] text-slate-400">{selected.unit}</span>
            </label>
            <button
              type="button"
              disabled={invalid || busy}
              onClick={() => void submit()}
              className="h-9 shrink-0 rounded-lg bg-[#176b52] px-4 text-xs font-bold text-white disabled:opacity-40"
            >
              {busy ? 'Đang xử lý…' : actionLabel}
            </button>
          </div>
          {over && <p role="alert" className="mt-1.5 text-[11px] font-semibold text-rose-600">Vượt quá số lượng khả dụng ({max} {selected.unit}).</p>}
        </div>
      )}
    </div>
  );
}
