'use client';

import React, { useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faChevronDown, faMagnifyingGlass, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import { freshflow } from '@/lib/api';
import { productImage } from '@/components/product-photo';
import { Button } from './shared-ui';
import { normalizeSearch } from '@/lib/search';
import type { Product, ProductRequest } from '@/types/domain';

/** Extra data sent when a request is completed and goes on the shelf. */
export type RequestFulfillment = {
  product_id?: number | null;
  stock_quantity?: number | null;
  unit?: string;
  category_id?: number | null;
  /** Photo of the new product (path returned by the image upload). */
  image_url?: string | null;
};

/** "2 kg" / "3,5 kg" / "10 bó" → { qty, unit } to pre-fill the stock form. */
export function parseQuantity(text: string): { qty: number; unit: string } {
  const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*([^\d\s.,;]+)?/);
  if (!m) return { qty: 0, unit: '' };
  return { qty: Number(m[1].replace(',', '.')) || 0, unit: (m[2] || '').trim() };
}

/** Resolves true when saved, or the error message when the server refused it. */
export type UpdateRequest = (
  id: number,
  status: string,
  quotedPrice?: number,
  responseNote?: string,
  fulfillment?: RequestFulfillment
) => Promise<true | string | void> | void;

// Internal status labels come from normalizeRequest(); this is the business workflow order.
const WORKFLOW = ['Mới', 'Đã báo giá', 'Đang xử lý', 'Hoàn tất', 'Từ chối'] as const;
const DISPLAY: Record<string, string> = {
  'Mới': 'Mới',
  'Đã báo giá': 'Đã báo giá',
  'Đang xử lý': 'Đang chuẩn bị',
  'Hoàn tất': 'Hoàn tất',
  'Từ chối': 'Từ chối',
};
const REQUEST_STEPS = ['Đã gửi', 'Báo giá', 'Chuẩn bị', 'Hoàn tất'];

/** The three things a shop does with a request — each gets its own short form. */
type Mode = 'quote' | 'shelf' | 'reject';

const QUOTE_NOTES = ['Hàng tươi trong ngày.', 'Dự kiến hàng về sáng mai.', 'Cần đặt trước 1 ngày để vườn thu hoạch.'];
const REJECT_NOTES = ['Hiện chưa có nguồn hàng phù hợp.', 'Nguồn hàng đang hết mùa.', 'Số lượng yêu cầu vượt khả năng cung ứng.'];

const vnd = (n: number) => `${new Intl.NumberFormat('vi-VN').format(n)}₫`;

/** One colour per status, used for the badge, the row accent and the progress steps. */
const STATUS_STYLE: Record<string, { badge: string; bar: string; row: string; solid: string; soft: string; text: string; line: string }> = {
  'Mới': { badge: 'bg-amber-100 text-amber-800 ring-amber-200', bar: 'border-l-amber-400', row: 'bg-amber-50/40', solid: 'bg-amber-500 text-white', soft: 'bg-amber-100 text-amber-700', text: 'text-amber-700', line: 'bg-amber-400' },
  'Đã báo giá': { badge: 'bg-sky-100 text-sky-800 ring-sky-200', bar: 'border-l-sky-400', row: 'bg-sky-50/40', solid: 'bg-sky-600 text-white', soft: 'bg-sky-100 text-sky-700', text: 'text-sky-700', line: 'bg-sky-400' },
  'Đang xử lý': { badge: 'bg-indigo-100 text-indigo-800 ring-indigo-200', bar: 'border-l-indigo-400', row: 'bg-indigo-50/30', solid: 'bg-indigo-600 text-white', soft: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-700', line: 'bg-indigo-400' },
  'Hoàn tất': { badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200', bar: 'border-l-emerald-500', row: '', solid: 'bg-emerald-600 text-white', soft: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700', line: 'bg-emerald-500' },
  'Từ chối': { badge: 'bg-rose-100 text-rose-700 ring-rose-200', bar: 'border-l-rose-300', row: 'bg-slate-50/70', solid: 'bg-rose-500 text-white', soft: 'bg-rose-100 text-rose-700', text: 'text-rose-700', line: 'bg-rose-300' },
};
const styleOf = (status: string) => STATUS_STYLE[status] || STATUS_STYLE['Đang xử lý'];

function StatusBadge({ status }: { status: string }) {
  const st = styleOf(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${st.badge}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${st.line}`} />
      {DISPLAY[status] || status}
    </span>
  );
}

function stepIndex(status: string) {
  return ({ 'Mới': 0, 'Đã báo giá': 1, 'Đang xử lý': 2, 'Hoàn tất': 3 } as Record<string, number>)[status] ?? -1;
}

function RequestProgress({ status, note }: { status: string; note?: string }) {
  if (status === 'Từ chối') {
    const byCustomer = /^Khách hàng (hủy|từ chối)/.test(note || '');
    return <div className="mt-1.5 inline-flex rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">✕ {byCustomer ? 'Khách đã hủy yêu cầu' : 'Từ chối / chưa có nguồn hàng'}</div>;
  }
  const active = stepIndex(status);
  const st = styleOf(status);
  return (
    <ol className="mt-2 flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap" aria-label="Tiến trình xử lý">
      {REQUEST_STEPS.map((label, idx) => (
        <li key={label} className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
              idx === active ? st.solid : idx < active ? st.soft : 'bg-slate-100 text-slate-400'
            }`}
          >
            {idx < active ? '✓' : idx + 1}
          </span>
          <span className={`whitespace-nowrap text-[10px] font-semibold ${idx <= active ? st.text : 'text-slate-400'}`}>{label}</span>
          {idx < REQUEST_STEPS.length - 1 && <span className={`mx-0.5 h-0.5 w-2 shrink-0 rounded-full ${idx < active ? st.line : 'bg-slate-200'}`} />}
        </li>
      ))}
    </ol>
  );
}

function ResponseCell({
  request,
  canManage,
  update,
}: {
  request: ProductRequest;
  canManage?: boolean;
  update?: UpdateRequest;
}) {
  return (
    <div className="min-w-0">
      {request.quoted_price ? <div className="font-extrabold text-[#176b52]">{vnd(request.quoted_price)}</div> : null}
      {request.admin_response ? (
        <p className="mt-0.5 break-words text-[11px] leading-relaxed text-slate-600">{request.admin_response}</p>
      ) : !request.quoted_price ? (
        <span className="text-[11px] text-slate-400">Đang chờ Shop/Admin phản hồi</span>
      ) : null}
      {request.linked_product_name && (
        <div className="mt-1 inline-flex rounded-lg bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800">
          Trên kệ: {request.linked_product_name}
          {request.linked_product_available != null ? ` · còn ${request.linked_product_available}` : ''}
        </div>
      )}
    </div>
  );
}

/** What the customer can do with a request; shown in the last column (or at the bottom of a card). */
function CustomerActions({ request, update, empty = null }: { request: ProductRequest; update?: UpdateRequest; empty?: React.ReactNode }) {
  const has = Boolean((update && (request.status === 'Mới' || request.status === 'Đã báo giá')) || (request.status === 'Hoàn tất' && request.product_id));
  if (!has) return <>{empty}</>;
  return (
    <div className="flex flex-wrap items-center gap-1.5 [&>div]:mt-0">
      {update && request.status === 'Mới' && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => { if (window.confirm(`Hủy yêu cầu “${request.name}”?`)) void update(request.id, 'Từ chối', undefined, 'Khách hàng hủy yêu cầu'); }}
            className="whitespace-nowrap rounded-xl border border-[#d2ddd5] bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            Hủy yêu cầu
          </button>
        </div>
      )}
      {update && request.status === 'Đã báo giá' && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void update(request.id, 'Đang xử lý', undefined, 'Khách hàng đồng ý mức báo giá')}
            className="whitespace-nowrap rounded-xl bg-[#176b52] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition hover:bg-[#125340]"
          >
            ✓ Đồng ý mua
          </button>
          <button
            type="button"
            onClick={() => { if (window.confirm('Từ chối báo giá và hủy yêu cầu này?')) void update(request.id, 'Từ chối', undefined, 'Khách hàng từ chối báo giá'); }}
            className="whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
          >
            Từ chối
          </button>
        </div>
      )}
      {request.status === 'Hoàn tất' && request.product_id && (
        <div className="mt-2">
          <a
            href={`/products/${request.product_id}`}
            className="inline-flex whitespace-nowrap rounded-xl bg-[#176b52] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-[#125340]"
          >
            Đặt mua ngay →
          </a>
        </div>
      )}
    </div>
  );
}

function RequestActions({
  request,
  onOpen,
  update,
}: {
  request: ProductRequest;
  onOpen: (req: ProductRequest, mode: Mode) => void;
  update: UpdateRequest;
}) {
  const primary = 'whitespace-nowrap rounded-xl px-3 py-1.5 text-[11px] font-bold text-white shadow-xs transition';
  const secondary = 'whitespace-nowrap rounded-xl border border-[#d2ddd5] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#3d5045] hover:bg-slate-50';
  const quiet = 'whitespace-nowrap rounded-xl px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50';
  const { status } = request;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === 'Mới' && (
        <button type="button" onClick={() => onOpen(request, 'quote')} className={`${primary} bg-[#176b52] hover:bg-[#125340]`}>Báo giá</button>
      )}
      {status === 'Đã báo giá' && (
        <>
          <button
            type="button"
            onClick={() => void update(request.id, 'Đang xử lý', request.quoted_price || undefined, request.admin_response || 'Đang chuẩn bị nguồn hàng cho khách')}
            className={`${primary} bg-indigo-600 hover:bg-indigo-700`}
          >
            → Chuẩn bị hàng
          </button>
          <button type="button" onClick={() => onOpen(request, 'quote')} className={secondary}>Sửa báo giá</button>
        </>
      )}
      {status === 'Đang xử lý' && (
        <button type="button" onClick={() => onOpen(request, 'shelf')} className={`${primary} bg-emerald-600 hover:bg-emerald-700`}>✓ Lên kệ</button>
      )}
      {status === 'Hoàn tất' && (
        <button type="button" onClick={() => onOpen(request, 'shelf')} className={secondary}>+ Nhập thêm hàng</button>
      )}
      {status === 'Từ chối' && (
        <button type="button" onClick={() => onOpen(request, 'quote')} className={secondary}>Báo giá lại</button>
      )}
      {(status === 'Mới' || status === 'Đang xử lý') && (
        <button type="button" onClick={() => onOpen(request, 'reject')} className={quiet}>Không có nguồn</button>
      )}
    </div>
  );
}

export function RequestsView({
  admin,
  shop = false,
  requests,
  products = [],
  categories = [],
  currentUserId,
  open,
  update,
}: {
  admin: boolean;
  shop?: boolean;
  requests: ProductRequest[];
  products?: Product[];
  categories?: { id: number; name: string }[];
  currentUserId?: number;
  notify?: (s: string) => void;
  open: () => void;
  update: UpdateRequest;
}) {
  const canManage = admin || shop;
  const [tab, setTab] = useState<string>('Tất cả');
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const out: Record<string, number> = { 'Tất cả': requests.length };
    WORKFLOW.forEach(s => (out[s] = requests.filter(r => r.status === s).length));
    return out;
  }, [requests]);

  const shown = useMemo(() => {
    const q = normalizeSearch(search.trim());
    return requests
      .filter(r => tab === 'Tất cả' || r.status === tab)
      .filter(r => !q || normalizeSearch(`${r.name} ${r.customer} ${r.category} ${r.description || ''}`).includes(q))
      .sort((a, b) => {
        const pa = WORKFLOW.indexOf(a.status as any);
        const pb = WORKFLOW.indexOf(b.status as any);
        if (pa !== pb) return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb);
        return b.id - a.id;
      });
  }, [requests, tab, search]);

  // Response dialog (one per action)
  const [active, setActive] = useState<{ req: ProductRequest; mode: Mode } | null>(null);
  const [price, setPrice] = useState<number>(0);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [stockQty, setStockQty] = useState<number>(0);
  const [stockUnit, setStockUnit] = useState('kg');
  const [linkProductId, setLinkProductId] = useState<number | ''>('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [showMore, setShowMore] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [badField, setBadField] = useState<'' | 'price' | 'qty'>('');
  const priceRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  // A shop can only put its own products on the shelf; the admin can use any
  const linkable = useMemo(
    () => (admin ? products : products.filter(p => currentUserId != null && p.shop_id === currentUserId)),
    [products, admin, currentUserId]
  );
  const suggestion = useMemo(() => {
    if (!active) return undefined;
    const words = (text: string) => normalizeSearch(text).split(/[^a-z0-9]+/).filter(w => w.length > 1);
    const wanted = words(active.req.name);
    if (!wanted.length) return undefined;
    // Same product = every word of the shorter name appears as a whole word in the other one
    return linkable.find(p => {
      const name = words(p.name);
      if (!name.length) return false;
      const [short, long] = name.length <= wanted.length ? [name, wanted] : [wanted, name];
      // ...and covers at least half of it ("Cà phê" is not "Mật ong hoa cà phê")
      return short.every(w => long.includes(w)) && short.length * 2 >= long.length && short.join('').length >= 3;
    });
  }, [linkable, active]);

  const openModal = (req: ProductRequest, mode: Mode) => {
    const wanted = parseQuantity(req.quantity);
    setActive({ req, mode });
    setPrice(req.quoted_price || 0);
    setNote(mode === 'quote' && req.status === 'Đã báo giá' ? req.admin_response || '' : '');
    setShowNote(mode === 'reject');
    // Pre-fill what the customer asked for; a restock starts empty
    setStockQty(req.status === 'Hoàn tất' ? 0 : wanted.qty);
    setStockUnit(wanted.unit || 'kg');
    setLinkProductId(req.product_id || '');
    setCategoryId(categories.find(c => c.name === req.category)?.id || '');
    setShowMore(false);
    setImageUrl('');
    setFormError('');
    setBadField('');
  };
  const close = () => setActive(null);

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return fail('Ảnh tối đa 5 MB.');
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    setFormError('');
    try {
      const result = await freshflow.uploadImage<{ image_url: string }>(form);
      setImageUrl(result.image_url);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Không tải được ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const fail = (message: string, field: '' | 'price' | 'qty' = '') => {
    setFormError(message);
    setBadField(field);
    const el = field === 'price' ? priceRef.current : field === 'qty' ? qtyRef.current : null;
    el?.focus();
  };
  const clearError = (field: 'price' | 'qty') => { if (badField === field) { setBadField(''); setFormError(''); } };

  const linked = products.find(p => p.id === linkProductId);
  const restock = active?.req.status === 'Hoàn tất';
  const unit = linked ? linked.unit : stockUnit || 'đơn vị';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active) return;
    const { req, mode } = active;
    if (mode === 'quote' && !(price > 0)) return fail('Nhập giá để gửi báo giá cho khách.', 'price');
    if (mode === 'shelf' && !linked && !(stockQty > 0)) return fail('Nhập số lượng nhập kho.', 'qty');
    if (mode === 'shelf' && !linked && !(price > 0)) return fail('Nhập giá bán.', 'price');
    if (mode === 'shelf' && restock && !(stockQty > 0)) return fail('Nhập số lượng nhập thêm.', 'qty');
    if (uploading) return fail('Ảnh đang tải lên, chờ một chút nhé.');
    setSubmitting(true);
    setFormError('');
    try {
      const status = mode === 'quote' ? 'Đã báo giá' : mode === 'shelf' ? 'Hoàn tất' : 'Từ chối';
      const message = note.trim() || (mode === 'reject' ? 'Hiện chưa có nguồn hàng phù hợp.' : undefined);
      const result = await update(
        req.id,
        status,
        price > 0 ? price : undefined,
        message,
        mode === 'shelf'
          ? { product_id: linkProductId || null, stock_quantity: stockQty > 0 ? stockQty : null, unit: stockUnit.trim() || 'kg', category_id: categoryId || null, image_url: linkProductId ? null : imageUrl || null }
          : undefined
      );
      // Keep the form (and what was typed) open when the server refused it
      if (typeof result === 'string') fail(result);
      else close();
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<Mode, string> = { quote: 'Báo giá cho khách', shelf: restock ? 'Nhập thêm hàng' : 'Đưa hàng lên kệ', reject: 'Báo khách chưa có nguồn' };
  const submitLabel: Record<Mode, string> = { quote: 'Gửi báo giá', shelf: restock ? 'Nhập kho' : 'Lên kệ & báo khách', reject: 'Gửi cho khách' };

  return (
    <>
      {/* Status tabs – same pattern as the Orders page */}
      <div className="-mx-3 mb-4 flex gap-1.5 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
        {['Tất cả', ...WORKFLOW].map(value => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              tab === value ? 'bg-[#176b52] text-white' : 'border border-[#e6ece7] bg-white text-[#5f6f66] hover:bg-slate-50'
            }`}
          >
            {value !== 'Tất cả' && <span aria-hidden className={`mr-1.5 inline-block h-2 w-2 rounded-full ${styleOf(value).line}`} />}
            {value === 'Tất cả' ? value : DISPLAY[value]}
            <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${tab === value ? 'bg-white/20' : 'bg-slate-100'}`}>{counts[value] || 0}</span>
          </button>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <b className="text-sm">{canManage ? 'Yêu cầu tìm nguồn mặt hàng' : 'Yêu cầu tìm nguồn nông sản của bạn'}</b>
            <p className="mt-1 text-[11px] text-slate-400">
              {canManage
                ? 'Quy trình: Mới → Báo giá → Chuẩn bị hàng → Nhập kho & lên kệ.'
                : 'Cửa hàng sẽ tìm nguồn, báo giá và đưa mặt hàng lên kệ cho bạn đặt mua.'}
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <label className="relative min-w-0 flex-1 sm:w-64">
              <span className="sr-only">Tìm yêu cầu</span>
              <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm mặt hàng, khách hàng…"
                className="w-full rounded-xl border border-[#dfe7e1] py-2 pl-8 pr-3 text-xs focus:border-[#176b52] focus:outline-none"
              />
            </label>
            {!canManage && (
              <Button onClick={open} aria-label="Tạo yêu cầu mặt hàng" className="shrink-0 !px-3 !py-2 text-xs">
                <FontAwesomeIcon icon={faPlus} /> <span className="hidden sm:inline">Tạo yêu cầu</span>
              </Button>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="text-sm font-bold">{requests.length ? 'Không có yêu cầu phù hợp bộ lọc' : 'Chưa có yêu cầu mặt hàng'}</h3>
            {!canManage && !requests.length && (
              <div className="mt-4">
                <Button onClick={open}><FontAwesomeIcon icon={faPlus} /> Gửi yêu cầu đầu tiên</Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-[#eef2ee] lg:hidden">
              {shown.map(request => (
                <li id={`request-${request.id}`} key={`m-${request.id}`} className={`space-y-2 border-l-4 p-4 text-xs ${styleOf(request.status).bar} ${styleOf(request.status).row}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="break-words font-bold text-[#1e2d25]">{request.name}</div>
                      <div className="mt-0.5 break-words text-[10px] text-slate-400">
                        {request.category} · {request.quantity} · {request.date}
                      </div>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  {canManage && <div className="text-[11px] text-slate-500">Khách: <b>{request.customer}</b></div>}
                  <div className="rounded-xl bg-[#f6faf7] p-2.5"><ResponseCell request={request} canManage={canManage} update={update} /></div>
                  <RequestProgress status={request.status} note={request.admin_response} />
                  {canManage ? <RequestActions request={request} onOpen={openModal} update={update} /> : <CustomerActions request={request} update={update} />}
                </li>
              ))}
            </ul>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full table-fixed text-left text-xs">
                <thead className="bg-[#fafcfa] text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className={`border-l-4 border-l-transparent px-4 py-3 ${canManage ? 'w-[20%]' : 'w-[24%]'}`}>Mặt hàng</th>
                    {canManage && <th className="w-[13%] px-4 py-3">Khách hàng</th>}
                    <th className={canManage ? 'w-[22%] px-4 py-3' : 'w-[26%] px-4 py-3'}>Báo giá &amp; phản hồi</th>
                    <th className={canManage ? 'w-[31%] px-4 py-3' : 'w-[34%] px-4 py-3'}>Trạng thái</th>
                    <th className={canManage ? 'w-[14%] px-4 py-3' : 'w-[16%] px-4 py-3'}>Tác vụ</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(request => (
                    <tr id={`request-${request.id}`} key={request.id} className={`scroll-mt-24 border-t align-top transition hover:brightness-[0.98] ${styleOf(request.status).row}`}>
                      <td className={`border-l-4 px-4 py-3.5 ${styleOf(request.status).bar}`}>
                        <div className="break-words font-bold text-[#1e2d25]">{request.name}</div>
                        <div className="mt-0.5 break-words text-[10px] text-slate-400">{request.category} · {request.quantity}</div>
                        <div className="text-[10px] text-slate-400">{request.date}</div>
                      </td>
                      {canManage && (
                        <td className="px-4 py-3.5">
                          <div className="break-words font-medium">{request.customer}</div>
                          {request.customer_phone && <div className="text-[10px] text-slate-400">{request.customer_phone}</div>}
                        </td>
                      )}
                      <td className="px-4 py-3.5"><ResponseCell request={request} canManage={canManage} update={update} /></td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={request.status} />
                        <RequestProgress status={request.status} note={request.admin_response} />
                        {request.handled_by_name && <div className="mt-1 text-[10px] text-slate-400">Phụ trách: {request.handled_by_name}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        {canManage ? <RequestActions request={request} onOpen={openModal} update={update} /> : <CustomerActions request={request} update={update} empty={<span className="text-[11px] text-slate-300">—</span>} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="border-t px-4 py-3 text-[11px] text-slate-400">Hiển thị {shown.length} / {requests.length} yêu cầu</div>
      </div>

      {/* Response dialog: bottom sheet on phones, small centred dialog on larger screens */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="quote-title" onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <form onSubmit={handleSubmit} className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white text-xs shadow-2xl sm:rounded-2xl">
            {/* Header: what is being done, for whom */}
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h3 id="quote-title" className="text-base font-extrabold text-[#1a2e24]">{titles[active.mode]}</h3>
                <p className="mt-1 text-[12px] text-slate-600">
                  <b className="text-[#176b52]">{active.req.name}</b> · {active.req.quantity} · {active.req.customer}
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Đóng" className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
              {/* ---------- QUOTE ---------- */}
              {active.mode === 'quote' && (
                <label className="block">
                  <span className="mb-1.5 block font-bold text-[#33463c]">Giá báo khách</span>
                  <span className={`flex items-center rounded-xl border bg-white focus-within:border-[#176b52] ${badField === 'price' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-[#d2ddd5]'}`}>
                    <input
                      ref={priceRef}
                      autoFocus
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="any"
                      value={price || ''}
                      onChange={e => { setPrice(Number(e.target.value)); clearError('price'); }}
                      placeholder="45000"
                      aria-invalid={badField === 'price'}
                      className="min-w-0 flex-1 rounded-xl bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none px-3.5 py-3 text-lg font-extrabold text-[#176b52] focus:outline-none"
                    />
                    <span className="shrink-0 pr-3.5 text-xs font-semibold text-slate-400">₫ / {unit}</span>
                  </span>
                </label>
              )}

              {/* ---------- SHELF ---------- */}
              {active.mode === 'shelf' && (
                <>
                  {linked ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate font-bold text-[#1f2d25]">{linked.name}</div>
                        <div className="text-[11px] text-slate-500">{vnd(linked.base_price ?? linked.price)}/{linked.unit} · đang còn {linked.available} {linked.unit}</div>
                      </div>
                      {!restock && <button type="button" onClick={() => setLinkProductId('')} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold text-[#176b52] hover:bg-white">Tạo mới</button>}
                    </div>
                  ) : suggestion ? (
                    <button type="button" onClick={() => setLinkProductId(suggestion.id)} className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5 text-left hover:bg-amber-50">
                      <span className="min-w-0">
                        <span className="block font-semibold text-amber-900">Kho đã có “{suggestion.name}”</span>
                        <span className="block text-[11px] text-amber-800/80">Dùng mặt hàng này thay vì tạo mới?</span>
                      </span>
                      <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-amber-900 shadow-xs">Dùng</span>
                    </button>
                  ) : null}

                  {!linked && (
                    <div className="flex items-center gap-3">
                      <label
                        className={`relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition ${imageUrl ? 'border-transparent' : 'border-[#cfdcd3] bg-[#f6faf7] hover:border-[#176b52]'}`}
                        aria-label={imageUrl ? 'Đổi ảnh mặt hàng' : 'Thêm ảnh mặt hàng'}
                      >
                        {imageUrl ? (
                          <img src={productImage({ name: active.req.name, image: imageUrl })} alt={`Ảnh ${active.req.name}`} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex flex-col items-center gap-1 text-[10px] font-bold text-[#176b52]">
                            <FontAwesomeIcon icon={faCamera} className="text-lg" />
                            {uploading ? 'Đang tải…' : 'Thêm ảnh'}
                          </span>
                        )}
                        {uploading && imageUrl && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-bold text-[#176b52]">Đang tải…</span>}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={e => { void uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                      </label>
                      <div className="min-w-0 text-[11px] leading-relaxed text-slate-500">
                        <div className="font-bold text-[#33463c]">Ảnh mặt hàng</div>
                        {imageUrl ? (
                          <>Bấm vào ảnh để đổi. <button type="button" onClick={() => setImageUrl('')} className="font-semibold text-rose-600 hover:underline">Bỏ ảnh</button></>
                        ) : (
                          'Ảnh thật giúp khách yên tâm đặt mua. JPG, PNG, WebP · tối đa 5 MB.'
                        )}
                      </div>
                    </div>
                  )}

                  <div className={`grid gap-3 ${linked ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <label className="block">
                      <span className="mb-1.5 block font-bold text-[#33463c]">{linked ? 'Nhập thêm' : 'Số lượng nhập kho'}</span>
                      <span className={`flex items-center rounded-xl border bg-white focus-within:border-[#176b52] ${badField === 'qty' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-[#d2ddd5]'}`}>
                        <input
                          ref={qtyRef}
                          autoFocus
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={stockQty || ''}
                          onChange={e => { setStockQty(Number(e.target.value)); clearError('qty'); }}
                          placeholder="0"
                          aria-invalid={badField === 'qty'}
                          className="min-w-0 flex-1 rounded-xl bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none px-3 py-2.5 text-base font-extrabold text-[#1f2d25] focus:outline-none"
                        />
                        <span className="shrink-0 pr-3 text-xs font-semibold text-slate-400">{unit}</span>
                      </span>
                    </label>
                    {!linked && (
                      <label className="block">
                        <span className="mb-1.5 block font-bold text-[#33463c]">Giá bán</span>
                        <span className={`flex items-center rounded-xl border bg-white focus-within:border-[#176b52] ${badField === 'price' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-[#d2ddd5]'}`}>
                          <input
                            ref={priceRef}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step="any"
                            value={price || ''}
                            onChange={e => { setPrice(Number(e.target.value)); clearError('price'); }}
                            placeholder="45000"
                            aria-invalid={badField === 'price'}
                            className="min-w-0 flex-1 rounded-xl bg-transparent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none px-3 py-2.5 text-base font-extrabold text-[#176b52] focus:outline-none"
                          />
                          <span className="shrink-0 pr-3 text-xs font-semibold text-slate-400">₫/{unit}</span>
                        </span>
                      </label>
                    )}
                  </div>
                  {!linked && active.req.quoted_price ? <p className="-mt-2 text-[11px] text-slate-500">Đã báo khách {vnd(active.req.quoted_price)}/{unit}.</p> : null}

                  {/* Rarely needed settings stay folded away */}
                  {!restock && (
                    <div className="rounded-xl border border-[#e6ece7]">
                      <button type="button" onClick={() => setShowMore(v => !v)} aria-expanded={showMore} className="flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold text-slate-600">
                        <span>
                          {linked ? 'Mặt hàng có sẵn' : 'Mặt hàng mới'} · {linked ? linked.category : categories.find(c => c.id === categoryId)?.name || 'Nông sản theo yêu cầu'} · {unit}
                        </span>
                        <span className="flex items-center gap-1 text-[#176b52]">Tùy chọn <FontAwesomeIcon icon={faChevronDown} className={`text-[9px] transition ${showMore ? 'rotate-180' : ''}`} /></span>
                      </button>
                      {showMore && (
                        <div className="space-y-2.5 border-t border-[#eef2ef] p-3">
                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-slate-600">Mặt hàng</span>
                            <select value={linkProductId} onChange={e => setLinkProductId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-lg border border-[#d2ddd5] bg-white px-2.5 py-2 focus:border-[#176b52] focus:outline-none">
                              <option value="">+ Tạo mặt hàng mới “{active.req.name}”</option>
                              {linkable.map(p => <option key={p.id} value={p.id}>{p.name} · còn {p.available} {p.unit}</option>)}
                            </select>
                          </label>
                          {!linked && (
                            <div className="grid grid-cols-[1fr_96px] gap-2">
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Danh mục</span>
                                <select value={categoryId} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-lg border border-[#d2ddd5] bg-white px-2.5 py-2 focus:border-[#176b52] focus:outline-none">
                                  <option value="">Nông sản theo yêu cầu</option>
                                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Đơn vị</span>
                                <input value={stockUnit} onChange={e => setStockUnit(e.target.value)} className="w-full rounded-lg border border-[#d2ddd5] bg-white px-2.5 py-2 focus:border-[#176b52] focus:outline-none" />
                              </label>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ---------- NOTE (all modes; optional except when refusing) ---------- */}
              {showNote || active.mode !== 'shelf' ? (
                <div>
                  <span className="mb-1.5 block font-bold text-[#33463c]">
                    {active.mode === 'reject' ? 'Lý do' : 'Lời nhắn'} <span className="font-normal text-slate-400">(tùy chọn)</span>
                  </span>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {(active.mode === 'reject' ? REJECT_NOTES : QUOTE_NOTES).map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setNote(preset)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${note === preset ? 'border-[#176b52] bg-emerald-50 text-[#176b52]' : 'border-[#dde6e0] bg-white text-[#4a5f53] hover:border-[#176b52]'}`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={active.mode === 'reject' ? 'Hoặc viết lý do khác…' : 'Nguồn gốc, thời gian hàng về…'}
                    className="w-full rounded-xl border border-[#d2ddd5] px-3 py-2 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setShowNote(true)} className="text-[11px] font-semibold text-[#176b52] hover:underline">+ Thêm lời nhắn cho khách</button>
              )}
            </div>

            <div className="shrink-0 border-t border-[#edf2ee] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {formError && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{formError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={close} className="rounded-xl border border-[#d2ddd5] px-4 py-2.5 font-semibold text-slate-600 hover:bg-slate-50">Hủy</button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 rounded-xl px-5 py-2.5 font-bold text-white shadow disabled:opacity-60 ${active.mode === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : active.mode === 'quote' ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {submitting ? 'Đang lưu…' : submitLabel[active.mode]}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
