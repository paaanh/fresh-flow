'use client';

import { useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBoxesStacked, faDownload, faFileExcel, faMagnifyingGlass, faPaste, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { SHEET_ACCEPT, downloadCsv, findColumn, readSheet, toNumber as sheetNumber } from '@/lib/sheet-import';
import { freshflow } from '@/lib/api';
import { normalizeSearch } from '@/lib/search';
import ProductPhoto from '@/components/product-photo';
import { categoryTree, type CategoryNode } from '@/components/category-manager-modal';
import type { Product } from '@/types/domain';

type Row = { name: string; categoryId: number | ''; unit: string; price: string; stock: string };
const blank = (categoryId: number | ''): Row => ({ name: '', categoryId, unit: 'kg', price: '', stock: '' });
const noSpin = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
/** "45.000" / "45,000" / "45000đ" → 45000 */
const toNumber = (raw: string) => Number(String(raw).replace(/[^\d.,]/g, '').replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));

export default function BulkProductsModal({
  categories,
  products,
  initialTab = 'create',
  onClose,
  onCreated,
  onReceived,
}: {
  categories: CategoryNode[];
  /** Products this user may restock. */
  products: Product[];
  initialTab?: 'create' | 'receive';
  onClose: () => void;
  onCreated: (created: any[]) => void;
  onReceived: (lines: { product_id: number; quantity: number }[]) => void;
}) {
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const firstCat = tree[0]?.cat.id ?? '';
  const [tab, setTab] = useState<'create' | 'receive'>(initialTab);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 5 }, () => blank(firstCat)));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  /** Result of the last file import, shown above the list. */
  const [report, setReport] = useState<{ ok: string; problems: string[] } | null>(null);
  const skuOf = (p: Product) => `SKU-${String(p.id).padStart(4, '0')}`;

  /** Rows of a sheet → rows of the "new products" table (header optional). */
  const importCreate = (sheet: string[][]) => {
    const byName = new Map(categories.map(c => [normalizeSearch(c.name), c.id]));
    const header = sheet[0] || [];
    const col = {
      name: findColumn(header, ['tên sản phẩm', 'tên', 'sản phẩm', 'mặt hàng', 'name', 'product']),
      unit: findColumn(header, ['đơn vị', 'dvt', 'đvt', 'unit']),
      price: findColumn(header, ['giá bán', 'giá', 'đơn giá', 'price']),
      stock: findColumn(header, ['tồn đầu', 'tồn', 'số lượng', 'sl', 'stock', 'quantity']),
      cat: findColumn(header, ['danh mục', 'loại', 'nhóm hàng', 'category']),
    };
    const hasHeader = col.name >= 0 && (col.price >= 0 || col.unit >= 0);
    const pick = hasHeader ? col : { name: 0, unit: 1, price: 2, stock: 3, cat: 4 };
    const body = hasHeader ? sheet.slice(1) : sheet;
    const problems: string[] = [];
    const parsed: Row[] = [];
    body.forEach((cells, i) => {
      const line = i + (hasHeader ? 2 : 1);
      const name = (cells[pick.name] || '').trim();
      if (!name) return;
      const price = sheetNumber(cells[pick.price] || '');
      if (!(price > 0)) problems.push(`Dòng ${line} (${name}): thiếu giá — đã thêm vào bảng, hãy nhập giá.`);
      const catName = pick.cat >= 0 ? cells[pick.cat] || '' : '';
      const catId = catName ? byName.get(normalizeSearch(catName)) : undefined;
      if (catName && !catId) problems.push(`Dòng ${line} (${name}): chưa có danh mục "${catName}" — để trống danh mục.`);
      const stock = pick.stock >= 0 ? sheetNumber(cells[pick.stock] || '') : NaN;
      parsed.push({
        name,
        unit: (pick.unit >= 0 ? cells[pick.unit] : '') || 'kg',
        price: price > 0 ? String(price) : '',
        stock: stock >= 0 ? String(stock) : '',
        categoryId: catName ? catId ?? '' : firstCat,
      });
    });
    if (!parsed.length) throw new Error('Không tìm thấy sản phẩm nào trong file. Cột cần có: Tên sản phẩm, Đơn vị, Giá bán, Tồn đầu, Danh mục.');
    setRows([...rows.filter(r => r.name.trim() || r.price.trim()), ...parsed]);
    setReport({ ok: `Đã đọc ${parsed.length} sản phẩm từ file — kiểm tra lại rồi bấm Thêm.`, problems });
  };

  /** Rows of a sheet → quantities to receive for existing products (matched by SKU / id / name). */
  const importReceive = (sheet: string[][]) => {
    const header = sheet[0] || [];
    const col = {
      code: findColumn(header, ['mã', 'mã sp', 'mã hàng', 'sku', 'id']),
      name: findColumn(header, ['tên sản phẩm', 'tên', 'sản phẩm', 'mặt hàng', 'name', 'product']),
      qty: findColumn(header, ['số lượng nhập', 'nhập thêm', 'số lượng', 'sl', 'nhập', 'quantity', 'qty']),
    };
    const hasHeader = col.qty >= 0 && (col.code >= 0 || col.name >= 0);
    const pick = hasHeader ? col : { code: -1, name: 0, qty: 1 };
    const body = hasHeader ? sheet.slice(1) : sheet;
    const byName = new Map(products.map(p => [normalizeSearch(p.name), p]));
    const next: Record<number, string> = { ...qty };
    const problems: string[] = [];
    let matched = 0;
    body.forEach((cells, i) => {
      const line = i + (hasHeader ? 2 : 1);
      const amount = sheetNumber(cells[pick.qty] || '');
      if (!(amount > 0)) return; // empty / 0 = nothing to receive for this product
      const code = pick.code >= 0 ? (cells[pick.code] || '').trim() : '';
      const name = pick.name >= 0 ? (cells[pick.name] || '').trim() : '';
      const idFromCode = Number(code.replace(/^sku-?/i, ''));
      const product =
        (code && products.find(p => p.id === idFromCode)) ||
        (name && byName.get(normalizeSearch(name))) ||
        (name ? products.filter(p => normalizeSearch(p.name).includes(normalizeSearch(name))) : []).find((_, __, all) => all.length === 1);
      if (!product) {
        problems.push(`Dòng ${line}: không tìm thấy "${name || code}" trong hàng của Shop.`);
        return;
      }
      next[product.id] = String(Math.round(((Number(next[product.id]?.replace(',', '.')) || 0) + amount) * 1000) / 1000);
      matched++;
    });
    if (!matched && !problems.length) throw new Error('File không có dòng nào có số lượng nhập. Cột cần có: Mã (hoặc Tên sản phẩm) và Số lượng nhập.');
    setQty(next);
    setSearch('');
    setReport({ ok: `Đã điền số lượng cho ${matched} mặt hàng từ file — kiểm tra lại rồi bấm Nhập kho.`, problems });
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setReport(null);
    try {
      const sheet = await readSheet(file);
      if (tab === 'create') importCreate(sheet);
      else importReceive(sheet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được file.');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const downloadTemplate = () => {
    if (tab === 'create') {
      downloadCsv('mau-them-san-pham.csv', [
        ['Tên sản phẩm', 'Đơn vị', 'Giá bán', 'Tồn đầu', 'Danh mục'],
        ['Cải ngọt', 'kg', 20000, 50, categories[0]?.name || 'Rau củ'],
        ['Bí đỏ', 'kg', 22000, 30, categories[0]?.name || 'Rau củ'],
      ]);
    } else {
      downloadCsv('mau-nhap-kho.csv', [
        ['Mã', 'Tên sản phẩm', 'Đơn vị', 'Đang có', 'Số lượng nhập'],
        ...products.map(p => [skuOf(p), p.name, p.unit, p.available, '']),
      ]);
    }
  };

  /** Import / template buttons, shared by both tabs. */
  const fileTools = (
    <div className="flex flex-wrap gap-1.5">
      <input ref={fileInput} type="file" accept={SHEET_ACCEPT} className="hidden" onChange={e => void onFile(e.target.files?.[0])} />
      <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-[#1d6f42] px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#185c37]">
        <FontAwesomeIcon icon={faFileExcel} /> Nhập từ file Excel / CSV
      </button>
      <button type="button" onClick={downloadTemplate} className="flex items-center gap-1.5 rounded-lg border border-[#d2ddd5] px-2.5 py-1.5 text-[11px] font-bold text-[#176b52] hover:bg-emerald-50">
        <FontAwesomeIcon icon={faDownload} /> Tải file mẫu
      </button>
    </div>
  );
  const reportBox = report && (
    <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-[11px]">
      <div className="flex items-start justify-between gap-2">
        <b className="text-[#145c46]">{report.ok}</b>
        <button type="button" onClick={() => setReport(null)} aria-label="Đóng thông báo" className="text-slate-400 hover:text-slate-600"><FontAwesomeIcon icon={faXmark} /></button>
      </div>
      {report.problems.length > 0 && (
        <ul className="mt-1.5 max-h-28 list-disc space-y-0.5 overflow-y-auto pl-4 text-amber-800">
          {report.problems.slice(0, 30).map(p => <li key={p}>{p}</li>)}
          {report.problems.length > 30 && <li>…và {report.problems.length - 30} dòng khác</li>}
        </ul>
      )}
    </div>
  );

  // ------------------------------------------------------------ create many products
  const filled = rows.filter(r => r.name.trim() || r.price.trim() || r.stock.trim());
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const rowError = (r: Row) => {
    if (!(r.name.trim() || r.price.trim() || r.stock.trim())) return '';
    if (r.name.trim().length < 1) return 'Thiếu tên';
    if (!(toNumber(r.price) > 0)) return 'Thiếu giá';
    if (r.stock.trim() && !(toNumber(r.stock) >= 0)) return 'Tồn không hợp lệ';
    return '';
  };

  /** Rows pasted from Excel / Google Sheets: Tên | Đơn vị | Giá | Tồn | Danh mục (tab, ; or , separated). */
  const applyPaste = () => {
    const byName = new Map(categories.map(c => [normalizeSearch(c.name), c.id]));
    const parsed = paste
      .split(/\r?\n/)
      .map(line => line.split(/\t|;|\|/).map(c => c.trim()))
      .filter(cells => cells[0] && !/^t[eê]n/i.test(cells[0])) // skip a header row
      .map<Row>(cells => ({
        name: cells[0],
        unit: cells[1] || 'kg',
        price: cells[2] ? String(toNumber(cells[2]) || '') : '',
        stock: cells[3] ? String(toNumber(cells[3]) || '') : '',
        categoryId: (cells[4] && byName.get(normalizeSearch(cells[4]))) || firstCat,
      }));
    if (!parsed.length) {
      setError('Không đọc được dòng nào. Mỗi dòng: Tên, Đơn vị, Giá, Tồn, Danh mục — cách nhau bằng Tab (dán từ Excel).');
      return;
    }
    setRows([...rows.filter(r => r.name.trim()), ...parsed]);
    setPaste('');
    setPasteOpen(false);
    setError('');
  };

  const submitCreate = async () => {
    const bad = filled.map((r, i) => [i, rowError(r)] as const).find(([, e]) => e);
    if (!filled.length) return setError('Nhập ít nhất một sản phẩm.');
    if (bad) return setError(`Dòng ${rows.indexOf(filled[bad[0]]) + 1}: ${bad[1]}.`);
    setBusy(true);
    setError('');
    try {
      const created = await freshflow.createProductsBulk<any>(
        filled.map(r => ({
          name: r.name.trim(),
          category_id: r.categoryId || null,
          unit: r.unit.trim() || 'kg',
          base_price: toNumber(r.price),
          initial_stock: r.stock.trim() ? toNumber(r.stock) : 0,
        }))
      );
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thêm được sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------ receive stock for many products
  const shown = products.filter(p => !search.trim() || normalizeSearch(`${p.name} ${p.category}`).includes(normalizeSearch(search.trim())));
  const lines = Object.entries(qty)
    .map(([id, v]) => ({ product_id: Number(id), quantity: toNumber(v) }))
    .filter(l => l.quantity > 0);
  const submitReceive = async () => {
    if (!lines.length) return setError('Nhập số lượng cho ít nhất một mặt hàng.');
    setBusy(true);
    setError('');
    try {
      await freshflow.receiveStock(lines);
      onReceived(lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không nhập kho được.');
    } finally {
      setBusy(false);
    }
  };

  const cell = `h-9 w-full min-w-0 rounded-lg border border-[#d2ddd5] bg-white px-2 text-xs focus:border-[#176b52] focus:outline-none ${noSpin}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="bulk-title" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-4">
          <div>
            <h3 id="bulk-title" className="flex items-center gap-2 text-base font-extrabold text-[#1a2d24]"><FontAwesomeIcon icon={faBoxesStacked} className="text-[#176b52]" /> Thêm nhiều mặt hàng</h3>
            <p className="mt-0.5 text-xs text-slate-500">Thêm nhiều sản phẩm mới, hoặc nhập kho nhiều mặt hàng cùng lúc.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <div className="flex shrink-0 gap-1.5 px-5 pb-3" role="tablist">
          {[
            { id: 'create' as const, label: 'Thêm nhiều sản phẩm mới' },
            { id: 'receive' as const, label: 'Nhập kho nhiều mặt hàng' },
          ].map(t => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setError(''); setReport(null); }} className={`rounded-xl px-3 py-2 text-xs font-bold ${tab === t.id ? 'bg-[#176b52] text-white' : 'border border-[#dce4de] bg-white text-[#526359] hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'create' ? (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#edf2ee] px-5 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">Dòng để trống sẽ được bỏ qua. <b>{filled.length}</b> sản phẩm sẽ được tạo.</span>
              <div className="flex flex-wrap gap-1.5">
                {fileTools}
                <button type="button" onClick={() => setPasteOpen(v => !v)} className="flex items-center gap-1.5 rounded-lg border border-[#d2ddd5] px-2.5 py-1.5 text-[11px] font-bold text-[#176b52] hover:bg-emerald-50">
                  <FontAwesomeIcon icon={faPaste} /> Dán từ Excel
                </button>
              </div>
            </div>
            {reportBox}
            {pasteOpen && (
              <div className="mb-3 space-y-2 rounded-xl border border-dashed border-[#176b52] bg-emerald-50/40 p-3">
                <p className="text-[11px] text-slate-600">Sao chép các cột <b>Tên · Đơn vị · Giá · Tồn · Danh mục</b> từ Excel / Google Sheets rồi dán vào đây.</p>
                <textarea rows={4} value={paste} onChange={e => setPaste(e.target.value)} placeholder={'Cải ngọt\tkg\t20000\t50\tRau củ\nBí đỏ\tkg\t22000\t30\tRau củ'} className="w-full rounded-lg border border-[#d2ddd5] bg-white p-2 font-mono text-[11px] focus:border-[#176b52] focus:outline-none" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setPasteOpen(false)} className="rounded-lg border bg-white px-3 py-1.5 text-[11px]">Đóng</button>
                  <button type="button" onClick={applyPaste} disabled={!paste.trim()} className="rounded-lg bg-[#176b52] px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">Thêm vào bảng</button>
                </div>
              </div>
            )}
            <div className="hidden grid-cols-[1.6rem_minmax(0,2fr)_minmax(0,1.4fr)_4.5rem_6.5rem_5.5rem_2rem] gap-1.5 px-0.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 md:grid">
              <span>#</span><span>Tên sản phẩm *</span><span>Danh mục</span><span>Đơn vị</span><span>Giá bán (₫) *</span><span>Tồn đầu</span><span />
            </div>
            <ul className="space-y-2 md:space-y-1.5">
              {rows.map((r, i) => {
                const err = rowError(r);
                return (
                  <li key={i} className={`grid grid-cols-2 gap-1.5 rounded-xl border p-2 md:grid-cols-[1.6rem_minmax(0,2fr)_minmax(0,1.4fr)_4.5rem_6.5rem_5.5rem_2rem] md:items-center md:rounded-none md:border-0 md:p-0 ${err ? 'border-rose-300 bg-rose-50/40' : 'border-[#e3ece6]'}`}>
                    <span className="hidden text-center text-[11px] font-bold text-slate-400 md:block">{i + 1}</span>
                    <input value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="Tên sản phẩm" aria-label={`Tên sản phẩm dòng ${i + 1}`} className={`${cell} col-span-2 md:col-span-1 ${err === 'Thiếu tên' ? 'border-rose-400' : ''}`} />
                    <select value={r.categoryId} onChange={e => setRow(i, { categoryId: e.target.value ? Number(e.target.value) : '' })} aria-label={`Danh mục dòng ${i + 1}`} className={`${cell} col-span-2 md:col-span-1`}>
                      <option value="">— Không danh mục —</option>
                      {tree.map(({ cat, depth }) => <option key={cat.id} value={cat.id}>{'— '.repeat(depth)}{cat.name}</option>)}
                    </select>
                    <input value={r.unit} onChange={e => setRow(i, { unit: e.target.value })} placeholder="kg" aria-label={`Đơn vị dòng ${i + 1}`} className={cell} />
                    <input value={r.price} onChange={e => setRow(i, { price: e.target.value })} inputMode="numeric" placeholder="Giá" aria-label={`Giá dòng ${i + 1}`} className={`${cell} font-bold ${err === 'Thiếu giá' ? 'border-rose-400' : ''}`} />
                    <input value={r.stock} onChange={e => setRow(i, { stock: e.target.value })} inputMode="decimal" placeholder="0" aria-label={`Tồn đầu dòng ${i + 1}`} className={cell} />
                    <button type="button" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank(firstCat)])} aria-label={`Xóa dòng ${i + 1}`} className="flex h-9 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-50 hover:text-rose-600">
                      <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setRows([...rows, ...Array.from({ length: 5 }, () => blank(rows[rows.length - 1]?.categoryId ?? firstCat))])} className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[#176b52] hover:bg-emerald-50">
              <FontAwesomeIcon icon={faPlus} /> Thêm 5 dòng
            </button>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#edf2ee] px-5 py-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500">Nhập số lượng từng món, hoặc nhập cả danh sách từ file (cột <b>Mã</b> hoặc <b>Tên sản phẩm</b> + <b>Số lượng nhập</b>).</span>
              {fileTools}
            </div>
            {reportBox}
            <label className="relative mb-2 block">
              <span className="sr-only">Tìm mặt hàng</span>
              <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mặt hàng…" className="w-full rounded-xl border border-[#dfe7e1] py-2.5 pl-8 pr-3 text-xs focus:border-[#176b52] focus:outline-none" />
            </label>
            <ul className="divide-y divide-[#f0f3f0]">
              {shown.map(p => (
                <li key={p.id} className="flex items-center gap-2.5 py-2">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg"><ProductPhoto product={p} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[#1e2d25]">{p.name}</span>
                    <span className={`block text-[10px] ${p.available <= 10 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{skuOf(p)} · Đang có {p.available} {p.unit}</span>
                  </span>
                  <span className="flex h-9 w-32 shrink-0 items-center rounded-lg border border-[#d2ddd5] bg-white pr-2 focus-within:border-[#176b52]">
                    <span className="pl-2 text-xs font-bold text-[#176b52]">+</span>
                    <input
                      value={qty[p.id] ?? ''}
                      onChange={e => setQty({ ...qty, [p.id]: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Số lượng nhập thêm ${p.name}`}
                      className="w-full min-w-0 bg-transparent px-1.5 text-right text-sm font-extrabold text-[#1e2d25] outline-none"
                    />
                    <span className="text-[10px] text-slate-400">{p.unit}</span>
                  </span>
                </li>
              ))}
              {shown.length === 0 && <li className="p-6 text-center text-xs text-slate-400">Không có mặt hàng phù hợp.</li>}
            </ul>
          </div>
        )}

        <div className="shrink-0 border-t border-[#edf2ee] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{error}</p>}
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[11px] text-slate-500">
              {tab === 'create' ? `${filled.length} sản phẩm mới` : `${lines.length} mặt hàng · tổng ${lines.reduce((s, l) => s + l.quantity, 0)} đơn vị`}
            </span>
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d2ddd5] px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void (tab === 'create' ? submitCreate() : submitReceive())}
              className="rounded-xl bg-[#176b52] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50"
            >
              {busy ? 'Đang lưu…' : tab === 'create' ? `Thêm ${filled.length || ''} sản phẩm` : `Nhập kho ${lines.length || ''} mặt hàng`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
