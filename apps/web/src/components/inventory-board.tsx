'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxesStacked, faTriangleExclamation, faWarehouse } from '@fortawesome/free-solid-svg-icons';
import ProductPhoto from '@/components/product-photo';
import ProductPicker from '@/components/product-picker';
import InventoryAdjustment, { type AdjustStock } from '@/components/inventory-adjustment';
import { freshflow, type InventoryRow } from '@/lib/api';
import { normalizeSearch } from '@/lib/search';
import type { Product } from '@/types/domain';

const n = (v: number | string | undefined) => Number(v || 0);
const fmt = (v: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(v);

type Row = {
  product: Product;
  stock: number;
  reserved: number;
  available: number;
  pending: number;
  shortage: number;
  pendingOrders: InventoryRow['pending_orders'];
  batches: InventoryRow['batches'];
};

function stateOf(r: Row) {
  if (r.stock <= 0 || r.available <= 0 && r.reserved <= 0) return { key: 'empty', label: 'Hết hàng', cls: 'bg-rose-100 text-rose-700', bar: 'bg-rose-400' };
  if (r.shortage > 0) return { key: 'short', label: `Thiếu ${fmt(r.shortage)} cho đơn chờ`, cls: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400' };
  if (r.available < 10) return { key: 'low', label: 'Sắp hết', cls: 'bg-orange-50 text-orange-700', bar: 'bg-orange-400' };
  return { key: 'ok', label: 'Đủ hàng', cls: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' };
}

/**
 * Warehouse shelf board. Physical stock, reserved quantity (confirmed orders not yet
 * shipped), available quantity and demand from orders waiting for confirmation all
 * come from the backend (/admin/inventory/overview), so it stays in sync with the
 * product list and orders.
 */
export default function InventoryBoard({ products, money, adjust }: { products: Product[]; money: (value: number) => string; adjust: AdjustStock }) {
  const [overview, setOverview] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'short' | 'low' | 'empty'>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickLog, setPickLog] = useState<string[]>([]);

  // Products are refreshed by realtime events / polling in the shell; reload the board with them.
  const version = products.map(p => `${p.id}:${p.available}:${p.reserved ?? ''}`).join('|');
  useEffect(() => {
    let alive = true;
    freshflow
      .inventoryOverview()
      .then(rows => alive && (setOverview(rows), setError('')))
      .catch(e => alive && setError(e instanceof Error ? e.message : 'Không tải được dữ liệu kho'));
    return () => {
      alive = false;
    };
  }, [version]);

  const rows: Row[] = useMemo(() => {
    const byId = new Map((overview || []).map(r => [r.product_id, r]));
    return products.map(product => {
      const r = byId.get(product.id);
      const stock = r ? n(r.stock_quantity) : product.stock ?? product.available;
      const reserved = r ? n(r.reserved_quantity) : product.reserved ?? 0;
      return {
        product,
        stock,
        reserved,
        available: r ? n(r.available_quantity) : product.available,
        pending: r ? n(r.pending_quantity) : 0,
        shortage: r ? n(r.shortage_quantity) : 0,
        pendingOrders: r?.pending_orders || [],
        batches: r?.batches || [],
      };
    });
  }, [products, overview]);

  const counts = useMemo(() => {
    const c = { all: rows.length, short: 0, low: 0, empty: 0 };
    rows.forEach(r => {
      const k = stateOf(r).key;
      if (k === 'short' || k === 'low' || k === 'empty') c[k] += 1;
    });
    return c;
  }, [rows]);

  const shelves = useMemo(() => {
    const q = normalizeSearch(query.trim());
    const visible = rows
      .filter(r => filter === 'all' || stateOf(r).key === filter)
      .filter(r => !q || normalizeSearch(`${r.product.name} ${r.product.category}`).includes(q));
    const groups = new Map<string, Row[]>();
    visible.forEach(r => groups.set(r.product.category || 'Khác', [...(groups.get(r.product.category || 'Khác') || []), r]));
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [rows, filter, query]);

  const totals = useMemo(
    () => rows.reduce((t, r) => ({ stock: t.stock + r.stock, reserved: t.reserved + r.reserved, value: t.value + r.available * r.product.price }), { stock: 0, reserved: 0, value: 0 }),
    [rows]
  );

  const pick = async ({ product, quantity }: { product: Product; quantity: number }) => {
    setPicking(true);
    try {
      const ok = await adjust(product.id, -quantity);
      if (ok !== false) setPickLog(log => [`Đã Pick ${fmt(quantity)} ${product.unit} ${product.name}`, ...log].slice(0, 5));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {[
          ['Mặt hàng trên kệ', String(rows.length), 'text-[#1e2e26]'],
          ['Đang giữ cho đơn', fmt(totals.reserved), 'text-indigo-700'],
          ['Thiếu cho đơn chờ', String(counts.short), counts.short ? 'text-amber-700' : 'text-[#1e2e26]'],
          ['Giá trị hàng khả dụng', money(totals.value), 'text-[#176b52]'],
        ].map(([label, value, cls]) => (
          <div key={label} className="panel p-3 sm:p-5">
            <div className="text-[11px] text-slate-500 sm:text-xs">{label}</div>
            <div className={`mt-1 break-words text-lg font-extrabold sm:text-2xl ${cls}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel min-w-0 overflow-hidden">
          <div className="space-y-3 border-b border-[#f1f5f2] p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#1f2d25]"><FontAwesomeIcon icon={faWarehouse} className="text-[#176b52]" /> Kệ hàng</h2>
              <p className="text-[10px] text-slate-400">Khả dụng = Tồn thực tế − Đang giữ cho đơn đã xác nhận</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Lọc mặt hàng trên kệ…"
                className="h-9 w-full min-w-0 shrink-0 rounded-xl border border-[#d2ddd5] px-3 text-xs focus:border-[#176b52] focus:outline-none sm:flex-1"
              />
              <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 scrollbar-hide sm:mx-0 sm:px-0">
                {([
                  ['all', 'Tất cả'],
                  ['short', 'Thiếu hàng'],
                  ['low', 'Sắp hết'],
                  ['empty', 'Hết hàng'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold ${filter === key ? 'bg-[#176b52] text-white' : 'border border-[#e3ece6] bg-white text-slate-600'}`}
                  >
                    {label} <span className="opacity-70">{counts[key]}</span>
                  </button>
                ))}
              </div>
            </div>
            {error && <p role="alert" className="text-[11px] text-rose-600">{error}</p>}
          </div>

          <div className="space-y-5 p-3 sm:p-4">
            {shelves.length === 0 && <p className="py-8 text-center text-xs text-slate-400">Không có mặt hàng phù hợp.</p>}
            {shelves.map(([shelf, items]) => (
              <div key={shelf}>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide text-[#6c7f73]">
                  <FontAwesomeIcon icon={faBoxesStacked} /> Kệ {shelf} <span className="font-semibold normal-case text-slate-400">· {items.length} mặt hàng</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map(r => {
                    const st = stateOf(r);
                    const total = Math.max(r.stock, r.reserved, 1);
                    const reservedPct = Math.min(100, (r.reserved / total) * 100);
                    const availPct = Math.min(100 - reservedPct, (r.available / total) * 100);
                    const open = openId === r.product.id;
                    return (
                      <article key={r.product.id} className={`rounded-2xl border p-3 ${st.key === 'short' ? 'border-amber-300' : st.key === 'empty' ? 'border-rose-200' : 'border-[#e3ece6]'} bg-white`}>
                        <div className="flex items-start gap-2.5">
                          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl"><ProductPhoto product={r.product} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-extrabold text-[#1e2d25]" title={r.product.name}>{r.product.name}</div>
                            <span className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                          </div>
                        </div>
                        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                          <span className="bg-indigo-400" style={{ width: `${reservedPct}%` }} />
                          <span className={st.bar} style={{ width: `${availPct}%` }} />
                        </div>
                        <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                          <div className="rounded-lg bg-[#f7faf8] py-1"><dt className="text-slate-400">Tồn</dt><dd className="font-extrabold">{fmt(r.stock)}</dd></div>
                          <div className="rounded-lg bg-indigo-50 py-1"><dt className="text-indigo-500">Đang giữ</dt><dd className="font-extrabold text-indigo-700">{fmt(r.reserved)}</dd></div>
                          <div className="rounded-lg bg-emerald-50 py-1"><dt className="text-emerald-600">Khả dụng</dt><dd className="font-extrabold text-[#176b52]">{fmt(r.available)}</dd></div>
                        </dl>
                        {r.pending > 0 && (
                          <div className={`mt-2 flex items-start gap-1.5 rounded-lg px-2 py-1 text-[10px] ${r.shortage > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-500'}`}>
                            {r.shortage > 0 && <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />}
                            <span>Đơn chờ xác nhận cần {fmt(r.pending)} {r.product.unit}: {r.pendingOrders.map(o => o.order_number).join(', ')}</span>
                          </div>
                        )}
                        <button type="button" onClick={() => setOpenId(open ? null : r.product.id)} aria-expanded={open} className="mt-2 text-[11px] font-bold text-[#176b52]">
                          {open ? 'Ẩn chi tiết' : `Lô hàng (${r.batches.length}) & điều chỉnh`}
                        </button>
                        {open && (
                          <div className="mt-2 space-y-2 border-t border-[#f0f4f1] pt-2">
                            {r.batches.length > 0 ? (
                              <ul className="space-y-1 text-[10px] text-slate-600">
                                {r.batches.map((b, i) => (
                                  <li key={b.id} className="flex justify-between gap-2 rounded-lg bg-[#f7faf8] px-2 py-1">
                                    <span>Vị trí L{i + 1} · {new Date(b.batch_date).toLocaleDateString('vi-VN')}</span>
                                    <span>Tồn {fmt(n(b.stock_quantity))} · Giữ {fmt(n(b.reserved_quantity))}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[10px] text-slate-400">Chưa có lô hàng đang mở.</p>
                            )}
                            <InventoryAdjustment id={r.product.id} name={r.product.name} unit={r.product.unit} available={r.available} adjust={adjust} />
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="panel h-fit space-y-3 p-3 sm:p-4 lg:sticky lg:top-24">
          <div>
            <h3 className="text-sm font-bold text-[#1f2d25]">Pick hàng có sẵn</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">Tìm mặt hàng, chọn số lượng để xuất khỏi kệ. Không thể Pick vượt số lượng khả dụng (phần đang giữ cho đơn được bảo vệ).</p>
          </div>
          <ProductPicker
            products={rows.map(r => ({ ...r.product, available: r.available, stock: r.stock, reserved: r.reserved }))}
            onPick={pick}
            busy={picking}
            actionLabel="Pick & xuất kho"
          />
          {pickLog.length > 0 && (
            <ul className="space-y-1 border-t border-[#f0f4f1] pt-2 text-[11px] text-slate-600">
              {pickLog.map((line, i) => <li key={i}>✓ {line}</li>)}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
