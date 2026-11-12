'use client';

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown, faTags, faTrash, faUserGroup } from '@fortawesome/free-solid-svg-icons';
import ProductPhoto from '@/components/product-photo';
import ProductPicker from '@/components/product-picker';
import type { Post, Product } from '@/types/domain';
import { toLocalInput } from '@/lib/dates';

/* ============================================================================
 * Mặt hàng & giá bán của MỘT bài đăng (giá theo bài).
 * Order on screen (what the seller decides, top to bottom):
 *   1. Đối tượng áp dụng — one or several customer groups (or everybody)
 *   2. Thời gian chương trình
 *   3. Danh sách sản phẩm — original price + the price (or % off) each chosen group pays
 * Nothing is written onto the products: two posts can sell the same product at different prices.
 * Backend: price for a group = the price typed for that group, otherwise base × (1 − %);
 *          the customer pays MIN(that, product-wide Sale running now).
 * ========================================================================== */

export type PricingItem = {
  productId: number;
  /** Quantity sold through this post ('' = no limit, only stock). */
  quantity: string;
  /** Already sold through this post (a limit cannot go below it). */
  sold: number;
  /** group code -> price typed for that group ('' / missing = group's default %). */
  groupPrices: Record<string, string>;
  /** Original price inside this post ('' = the product's standard price). Struck through for customers. */
  listPrice: string;
};

export type PostPricing = {
  items: PricingItem[];
  /** Programme window (datetime-local, '' = no limit) → posts.order_start_at / order_end_at. */
  programStart: string;
  programEnd: string;
  /** "Giảm tất cả theo %": one discount for every product and group. */
  percentOn: boolean;
  percent: string;
};

export type PricingGroup = { code: string; label: string; defaultDiscount: number };

/** Who the post is for: every group, or the chosen groups. */
export type PricingAudience = { mode: 'ALL' | 'GROUP'; groups: string[] };

export type PricingErrors = {
  items: Record<number, string>;
  window: string;
  audience: string;
  percent: string;
  /** First message, for a summary near the save button. */
  first: string;
};

export const MAX_GROUP_DISCOUNT = 90;

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const qtyString = (v: number | string | null | undefined) => (v == null || v === '' ? '' : String(Number(v)));

export const isoToLocal = toLocalInput;

const basePriceOf = (product?: Product) => Number(product?.base_price ?? product?.price ?? 0);
/** Original price of a product in this post: its own list price, else the product's standard price. */
export const itemBase = (item: Pick<PricingItem, 'listPrice'>, product?: Product) => {
  const own = num(item.listPrice ?? '');
  return own > 0 ? own : basePriceOf(product);
};

/** Product-wide Sale that is running now (applies everywhere, also inside posts). */
function productSale(product?: Product): number | null {
  if (!product || product.sale_status !== 'ACTIVE' || product.sale_price == null) return null;
  return Number(product.sale_price);
}

/** Giá = Giá gốc × (1 − %/100), làm tròn đến đồng. */
export function discountedPrice(base: number, percent: number) {
  const pct = Math.min(Math.max(percent || 0, 0), MAX_GROUP_DISCOUNT);
  return Math.round((base * (100 - pct)) / 100);
}

export function emptyPricing(): PostPricing {
  return { items: [], programStart: '', programEnd: '', percentOn: false, percent: '10' };
}

/** Audience of an existing post (several groups, one group, or everybody). */
export function audienceFromPost(post: Post | null | undefined, groups: PricingGroup[]): PricingAudience {
  if (!post) return { mode: 'ALL', groups: [] };
  if (post.target_audience === 'ALL') return { mode: 'ALL', groups: [] };
  const list = (post.target_groups && post.target_groups.length ? post.target_groups : [post.target_customer_group || (post.target_audience === 'COLLECTIVE' ? 'COLLECTIVE' : '')]).filter(Boolean) as string[];
  return { mode: 'GROUP', groups: list.length ? list : groups.slice(0, 1).map(g => g.code) };
}

/** Groups whose prices this post defines. */
export function relevantGroups(groups: PricingGroup[], audience: PricingAudience): PricingGroup[] {
  return audience.mode === 'GROUP' ? groups.filter(g => audience.groups.includes(g.code)) : groups;
}

/** State for editing an existing post. */
export function pricingFromPost(post: Post, groups: PricingGroup[]): PostPricing {
  const targets = relevantGroups(groups, audienceFromPost(post, groups));
  const anyOwnPrices = (post.products_info || []).some(i => Object.keys(i.item_group_prices || {}).length > 0);
  const items: PricingItem[] = (post.products_info || []).map(info => {
    const own = info.item_group_prices || {};
    const groupPrices: Record<string, string> = {};
    targets.forEach(g => {
      if (own[g.code] != null) groupPrices[g.code] = String(Math.round(Number(own[g.code])));
      // older posts (Sale in post / one % for every group): keep what customers were paying, as prices per group
      else if (!anyOwnPrices && info.group_prices?.[g.code] != null && Number(info.group_prices[g.code]) < Number(info.base_price)) {
        groupPrices[g.code] = String(Math.round(Number(info.group_prices[g.code])));
      }
    });
    return {
      productId: info.id,
      quantity: qtyString(info.quantity_limit),
      sold: Number(info.sold_quantity || 0),
      groupPrices,
      listPrice: info.item_list_price ? String(Math.round(Number(info.item_list_price))) : '',
    };
  });
  return {
    items,
    programStart: isoToLocal(post.order_start_at),
    programEnd: isoToLocal(post.order_end_at),
    // "Giảm tất cả theo %" is no longer offered: prices are set per product and group
    percentOn: false,
    percent: '10',
  };
}

/** Price a group pays for one product of the post (before a product-wide Sale). */
export function groupPriceFor(pricing: PostPricing, item: PricingItem, product: Product | undefined, group: PricingGroup): number {
  const base = itemBase(item, product);
  if (!(base > 0)) return NaN;
  if (pricing.percentOn) return discountedPrice(base, num(pricing.percent) || 0);
  const typed = num(item.groupPrices[group.code] ?? '');
  return typed > 0 ? typed : discountedPrice(base, group.defaultDiscount);
}

/** What the customer finally pays (the lower of the group price and a running product Sale). */
export function finalPriceFor(pricing: PostPricing, item: PricingItem, product: Product | undefined, group: PricingGroup) {
  const price = groupPriceFor(pricing, item, product, group);
  const sale = productSale(product);
  return sale != null && Number.isFinite(price) ? Math.min(price, sale) : price;
}

export function programState(pricing: Pick<PostPricing, 'programStart' | 'programEnd'>, now = new Date()) {
  if (pricing.programStart && new Date(pricing.programStart) > now) return { key: 'UPCOMING', label: 'Sắp diễn ra', cls: 'bg-amber-100 text-amber-800' } as const;
  if (pricing.programEnd && new Date(pricing.programEnd) < now) return { key: 'ENDED', label: 'Đã kết thúc', cls: 'bg-slate-200 text-slate-600' } as const;
  return { key: 'ACTIVE', label: 'Đang diễn ra', cls: 'bg-emerald-100 text-emerald-800' } as const;
}

export function validatePricing(pricing: PostPricing, products: Product[], groups: PricingGroup[], audience: PricingAudience): PricingErrors {
  const errors: PricingErrors = { items: {}, window: '', audience: '', percent: '', first: '' };
  const targets = relevantGroups(groups, audience);
  if (audience.mode === 'GROUP' && targets.length === 0) errors.audience = 'Chọn ít nhất một nhóm khách hàng cho bài đăng.';
  if (pricing.percentOn) {
    const pct = num(pricing.percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > MAX_GROUP_DISCOUNT) errors.percent = `% giảm phải từ 0 đến ${MAX_GROUP_DISCOUNT}.`;
  }
  pricing.items.forEach(item => {
    const product = products.find(p => p.id === item.productId);
    const name = product?.name || `Mặt hàng #${item.productId}`;
    const base = itemBase(item, product);
    const qty = num(item.quantity);
    const stock = product?.available ?? 0;
    let message = '';
    if (item.quantity.trim() !== '') {
      if (!(qty > 0)) message = 'Số lượng mở bán phải lớn hơn 0 (để trống = theo tồn kho).';
      else if (qty < item.sold) message = `Không thể thấp hơn số đã bán qua bài (${item.sold}).`;
      else if (qty - item.sold > stock) message = `Mở bán thêm vượt tồn kho khả dụng (${stock} ${product?.unit || ''}).`;
    }
    if (!message && item.listPrice.trim() !== '' && !(num(item.listPrice) > 0)) message = 'Giá gốc trong bài phải lớn hơn 0 (để trống = giá chuẩn của mặt hàng).';
    if (!message && !pricing.percentOn) {
      for (const g of targets) {
        const raw = (item.groupPrices[g.code] ?? '').trim();
        if (raw === '') continue;
        const price = Number(raw);
        if (!(price > 0)) { message = `Giá cho ${g.label} phải lớn hơn 0.`; break; }
        if (price > base) { message = `Giá cho ${g.label} không được cao hơn giá gốc.`; break; }
      }
    }
    if (message) errors.items[item.productId] = `${name}: ${message}`;
  });
  if (pricing.programStart && pricing.programEnd && new Date(pricing.programEnd) <= new Date(pricing.programStart)) {
    errors.window = 'Thời gian kết thúc chương trình phải sau thời gian bắt đầu.';
  }
  errors.first = errors.audience || errors.window || errors.percent || Object.values(errors.items)[0] || '';
  return errors;
}

/** Fields of the posts API built from the pricing state (create and update use the same shape). */
export function pricingPayload(pricing: PostPricing, groups: PricingGroup[], audience: PricingAudience) {
  const targets = relevantGroups(groups, audience);
  const pct = num(pricing.percent);
  return {
    target_audience: audience.mode,
    target_groups: audience.mode === 'GROUP' ? targets.map(g => g.code) : [],
    target_customer_group: audience.mode === 'GROUP' ? targets[0]?.code ?? null : null,
    group_discounts: pricing.percentOn ? Object.fromEntries(targets.map(g => [g.code, pct])) : {},
    items: pricing.items.map(i => ({
      product_id: i.productId,
      quantity_limit: i.quantity.trim() !== '' ? Number(i.quantity) : null,
      sale_price: null,
      list_price: num(i.listPrice) > 0 ? Number(i.listPrice) : null,
      group_prices: pricing.percentOn
        ? {}
        : Object.fromEntries(targets.filter(g => (i.groupPrices[g.code] ?? '').trim() !== '').map(g => [g.code, Number(i.groupPrices[g.code])])),
    })),
    order_start_at: pricing.programStart ? new Date(pricing.programStart).toISOString() : null,
    order_end_at: pricing.programEnd ? new Date(pricing.programEnd).toISOString() : null,
  };
}

/* ------------------------------------------------------------------ UI --- */

const noSpin = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

export default function PostPricingManager({
  products,
  pickable,
  value,
  onChange,
  groups,
  audience,
  onAudienceChange,
  onCreateGroup,
  money,
  errors,
  onCreateProduct,
  title = 'Mặt hàng và giá bán',
  children,
}: {
  /** Optional extra content shown after the product pricing controls. */
  children?: React.ReactNode;
  /** All products (names, stock, standard prices). */
  products: Product[];
  /** Products this user may add to the post. */
  pickable: Product[];
  value: PostPricing;
  onChange: (next: PostPricing) => void;
  groups: PricingGroup[];
  audience: PricingAudience;
  onAudienceChange: (next: PricingAudience) => void;
  /** Creates a customer group and returns its code. */
  onCreateGroup?: (name: string, percent: number) => Promise<string | undefined>;
  money: (n: number) => string;
  /** Validation result of the last save attempt (null = none yet). */
  errors?: PricingErrors | null;
  /** Opens the product form; the created product is added to the post. */
  onCreateProduct?: () => void;
  title?: string;
}) {
  const [newGroup, setNewGroup] = useState<{ name: string; pct: string } | null>(null);
  /** Products whose price editor is open (tap a product to open it). */
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  /** % being typed (kept as text so "12." survives while typing). */
  const [pctDraft, setPctDraft] = useState<Record<string, string>>({});
  const toggleOpen = (id: number) =>
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const byId = new Map(products.map(p => [p.id, p]));
  const targets = relevantGroups(groups, audience);
  const state = programState(value);
  const all = audience.mode === 'ALL';

  const updateItem = (productId: number, patch: Partial<PricingItem>) =>
    onChange({ ...value, items: value.items.map(i => (i.productId === productId ? { ...i, ...patch } : i)) });
  const removeItem = (productId: number) => onChange({ ...value, items: value.items.filter(i => i.productId !== productId) });
  /** Set one group's price. With "Giảm tất cả theo %" on, today's prices become individual prices first. */
  const setGroupPrice = (productId: number, groupCode: string, price: string) => {
    if (!value.percentOn) {
      const item = value.items.find(i => i.productId === productId);
      if (item) updateItem(productId, { groupPrices: { ...item.groupPrices, [groupCode]: price } });
      return;
    }
    const items = value.items.map(i => {
      const p = byId.get(i.productId);
      const frozen: Record<string, string> = Object.fromEntries(targets.map(g => [g.code, String(groupPriceFor(value, i, p, g))]));
      if (i.productId === productId) frozen[groupCode] = price;
      return { ...i, groupPrices: frozen };
    });
    onChange({ ...value, percentOn: false, items });
  };
  const toggleGroup = (code: string) => {
    const current = all ? groups.map(g => g.code) : audience.groups;
    const next = current.includes(code) ? current.filter(c => c !== code) : [...current, code];
    onAudienceChange({ mode: 'GROUP', groups: next });
  };
  const saveGroup = async () => {
    if (!newGroup || !onCreateGroup || !newGroup.name.trim()) return;
    const code = await onCreateGroup(newGroup.name.trim(), Number(newGroup.pct) || 0);
    if (code) {
      onAudienceChange({ mode: 'GROUP', groups: [...(all ? [] : audience.groups), code] });
      setNewGroup(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[#e3ece6] bg-white p-3 sm:p-4" aria-labelledby="pricing-manager-title">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="pricing-manager-title" className="flex items-center gap-2 text-sm font-extrabold text-[#1a2e24]">
            <FontAwesomeIcon icon={faTags} className="text-[#176b52]" /> {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-500">Giá ở đây chỉ áp dụng khi khách mua qua bài này — không đổi giá mặt hàng ở nơi khác.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${state.cls}`}>{state.label}</span>
      </header>

      {/* 1. Đối tượng áp dụng — chọn nhiều */}
      <div className={`rounded-xl border p-3 ${errors?.audience ? 'border-rose-300 bg-rose-50/40' : 'border-[#cfe3d6] bg-[#f4faf6]'}`}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs font-extrabold text-[#145c46]"><FontAwesomeIcon icon={faUserGroup} /> Đối tượng áp dụng</span>
          <span className="text-[11px] font-semibold text-slate-500">{all ? 'Mọi khách hàng' : `${targets.length} nhóm đã chọn`}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Nhóm khách hàng được xem và mua bài">
          <button
            type="button"
            aria-pressed={all}
            onClick={() => onAudienceChange(all ? { mode: 'GROUP', groups: [] } : { mode: 'ALL', groups: [] })}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${all ? 'border-[#176b52] bg-[#176b52] text-white' : 'border-[#cfe3d6] bg-white text-[#2f5a46] hover:border-[#176b52]'}`}
          >
            {all && <FontAwesomeIcon icon={faCheck} className="mr-1 text-[10px]" />}Tất cả khách hàng
          </button>
          {groups.map(g => {
            const on = all || audience.groups.includes(g.code);
            return (
              <button
                key={g.code}
                type="button"
                aria-pressed={on}
                onClick={() => toggleGroup(g.code)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${on ? (all ? 'border-emerald-200 bg-emerald-50 text-[#176b52]' : 'border-[#176b52] bg-[#e5f3eb] text-[#145c46]') : 'border-[#dbe5de] bg-white text-slate-500 hover:border-[#176b52]'}`}
              >
                {on && <FontAwesomeIcon icon={faCheck} className="mr-1 text-[10px]" />}
                {g.label}
              </button>
            );
          })}
          {onCreateGroup && !newGroup && (
            <button type="button" onClick={() => setNewGroup({ name: '', pct: '10' })} className="rounded-full border border-dashed border-[#176b52] px-3 py-1.5 text-xs font-bold text-[#176b52] hover:bg-white">
              + Nhóm mới
            </button>
          )}
        </div>
        {newGroup && (
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2">
            <input value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })} placeholder="Tên nhóm mới" aria-label="Tên nhóm mới" className="min-w-0 rounded-lg border border-[#d2ddd5] bg-white px-2 py-1.5 text-xs" />
            <span className="flex items-center rounded-lg border border-[#d2ddd5] bg-white pr-2">
              <input type="number" min={0} max={90} value={newGroup.pct} onChange={e => setNewGroup({ ...newGroup, pct: e.target.value })} aria-label="% giảm mặc định của nhóm" className={`w-full min-w-0 bg-transparent px-2 py-1.5 text-xs outline-none ${noSpin}`} />
              <span className="text-[11px] text-slate-400">%</span>
            </span>
            <span className="flex gap-1">
              <button type="button" onClick={() => void saveGroup()} disabled={!newGroup.name.trim()} className="rounded-lg bg-[#176b52] px-2.5 text-[11px] font-bold text-white disabled:opacity-40">Lưu</button>
              <button type="button" onClick={() => setNewGroup(null)} className="rounded-lg border bg-white px-2 text-[11px]">Hủy</button>
            </span>
          </div>
        )}
        <p className={`mt-2 text-[11px] ${errors?.audience ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
          {errors?.audience || (all ? 'Mọi khách hàng đều thấy và mua được bài này.' : 'Chỉ các nhóm đã chọn thấy và mua được bài này. Bấm vào nhóm để chọn / bỏ chọn.')}
        </p>
      </div>

      {/* 2. Thời gian chương trình */}
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#e3ece6] bg-[#fafcfa] p-2.5 min-[420px]:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-600">
          Bắt đầu chương trình
          <input type="datetime-local" value={value.programStart} onChange={e => onChange({ ...value, programStart: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-[#d2ddd5] bg-white px-2 text-xs" />
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          Kết thúc chương trình
          <input type="datetime-local" value={value.programEnd} onChange={e => onChange({ ...value, programEnd: e.target.value })} className={`mt-1 h-9 w-full rounded-lg border bg-white px-2 text-xs ${errors?.window ? 'border-rose-500' : 'border-[#d2ddd5]'}`} />
        </label>
        <p className={`text-[10px] min-[420px]:col-span-2 ${errors?.window ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{errors?.window || 'Trống = mở bán ngay, không giới hạn. Ngoài thời gian này khách không mua được qua bài.'}</p>
      </div>

      {/* 3. Danh sách sản phẩm áp dụng */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <ProductPicker
            products={pickable}
            excludeIds={value.items.map(i => i.productId)}
            actionLabel="Thêm vào bài"
            onPick={({ product, quantity }) => {
              onChange({ ...value, items: [...value.items, { productId: product.id, quantity: String(quantity), sold: 0, groupPrices: {}, listPrice: '' }] });
              setOpenIds(prev => new Set(prev).add(product.id));
            }}
          />
        </div>
        {onCreateProduct && (
          <button type="button" onClick={onCreateProduct} className="h-10 shrink-0 rounded-xl border border-dashed border-[#176b52] px-3 text-xs font-bold text-[#176b52] hover:bg-emerald-50">
            + Tạo mặt hàng mới
          </button>
        )}
      </div>

      {value.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8e0d8] p-4 text-center text-[11px] text-slate-400">Chưa có sản phẩm áp dụng. Tìm mặt hàng có sẵn hoặc tạo mặt hàng mới.</p>
      ) : (
        <ul className="space-y-2">
          {value.items.map(item => {
            const product = byId.get(item.productId);
            const base = itemBase(item, product);
            const standard = basePriceOf(product);
            const sale = productSale(product);
            const error = errors?.items[item.productId];
            const isOpen = openIds.has(item.productId) || Boolean(error);
            const prices = targets.map(group => ({ group, price: finalPriceFor(value, item, product, group) }));
            const pctOf = (price: number) => (base > 0 && Number.isFinite(price) && price < base ? Math.round((1 - price / base) * 1000) / 10 : 0);
            return (
              <li key={item.productId} className={`overflow-hidden rounded-xl border ${error ? 'border-rose-300 bg-rose-50/40' : isOpen ? 'border-[#176b52]/40 bg-white' : 'border-[#e3ece6] bg-white'}`}>
                {/* Header: tap to edit this product's prices */}
                <div className="flex items-center gap-2.5 p-2.5">
                  <button type="button" onClick={() => toggleOpen(item.productId)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Thu gọn' : 'Chỉnh giá'} ${product?.name || ''}`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">{product && <ProductPhoto product={product} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-[#1e2d25]" title={product?.name}>{product?.name || `Mặt hàng #${item.productId}`}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        Giá gốc {money(base)}/{product?.unit || ''}{base !== standard ? ' (riêng bài)' : ''} · Tồn {product?.available ?? 0}{item.quantity ? ` · Mở bán ${item.quantity}` : ''}{item.sold > 0 ? ` · Đã bán ${item.sold}` : ''}
                      </span>
                      {!isOpen && (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {prices.slice(0, 4).map(({ group, price }) => (
                            <span key={group.code} className="rounded bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-700">
                              {group.label}: {Number.isFinite(price) ? money(price) : '—'}
                            </span>
                          ))}
                          {prices.length > 4 && <span className="text-[10px] text-slate-400">+{prices.length - 4} nhóm</span>}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#176b52]">
                      <span className="hidden min-[420px]:inline">{isOpen ? 'Thu gọn' : 'Chỉnh giá'}</span>
                      <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition ${isOpen ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  <button type="button" onClick={() => removeItem(item.productId)} aria-label={`Bỏ ${product?.name || 'mặt hàng'} khỏi bài`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50">
                    <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-2.5 border-t border-[#eef3ef] bg-[#f7fbf8] p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-[#e3ece6] focus-within:ring-[#176b52]">
                        <span className="block text-[10px] font-semibold text-slate-500">Giá gốc trong bài</span>
                        <span className="flex items-baseline gap-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step="any"
                            aria-label={`Giá gốc ${product?.name || ''} trong bài`}
                            placeholder={String(standard)}
                            value={item.listPrice}
                            onChange={e => updateItem(item.productId, { listPrice: e.target.value })}
                            className={`w-full min-w-0 bg-transparent text-sm font-extrabold text-slate-700 outline-none placeholder:text-slate-700 ${noSpin}`}
                          />
                          <span className="text-[10px] text-slate-400">₫/{product?.unit || ''}</span>
                        </span>
                        <span className="block text-[10px] text-slate-400">{item.listPrice.trim() && num(item.listPrice) !== standard ? `Giá chuẩn mặt hàng: ${money(standard)} (không đổi)` : 'Khách thấy giá này gạch ngang'}</span>
                      </label>
                      <label className="block rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-[#e3ece6] focus-within:ring-[#176b52]">
                        <span className="block text-[10px] font-semibold text-slate-500">Số lượng mở bán qua bài</span>
                        <span className="flex items-baseline gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            placeholder="Theo tồn kho"
                            aria-label={`Số lượng mở bán ${product?.name || ''}`}
                            value={item.quantity}
                            onChange={e => updateItem(item.productId, { quantity: e.target.value })}
                            className={`w-full min-w-0 bg-transparent text-sm font-extrabold text-[#1e2d25] outline-none placeholder:text-xs placeholder:font-medium placeholder:text-slate-300 ${noSpin}`}
                          />
                          <span className="text-[10px] text-slate-400">{product?.unit || ''}</span>
                        </span>
                      </label>
                    </div>

                    {/* Each chosen group: selling price and % off — type either one */}
                    <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
                      {prices.map(({ group, price }) => {
                        const key = `${item.productId}:${group.code}`;
                        const typed = item.groupPrices[group.code] ?? '';
                        const pctShown = pctDraft[key] ?? (value.percentOn ? String(num(value.percent) || 0) : typed ? String(pctOf(Number(typed))) : '');
                        const box = 'border-[#d2ddd5] bg-white focus-within:border-[#176b52]';
                        const shownPrice = value.percentOn ? String(groupPriceFor(value, item, product, group)) : typed;
                        return (
                          <div key={group.code} className="rounded-lg bg-white p-2 ring-1 ring-[#e3ece6]">
                            <div className="mb-1.5 truncate text-[11px] font-bold text-[#145c46]" title={group.label}>{group.label}</div>
                            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-1.5">
                              <label className="block min-w-0">
                                <span className="mb-0.5 block text-[10px] text-slate-500">Giá bán</span>
                                <span className={`flex h-9 items-center rounded-lg border px-2 ${box}`}>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step="any"
                                    aria-label={`Giá ${product?.name || ''} cho ${group.label}`}
                                    placeholder={String(discountedPrice(base, group.defaultDiscount))}
                                    value={shownPrice}
                                    onChange={e => setGroupPrice(item.productId, group.code, e.target.value)}
                                    className={`w-full min-w-0 bg-transparent text-sm font-extrabold text-rose-600 outline-none placeholder:font-semibold placeholder:text-slate-300 ${noSpin}`}
                                  />
                                  <span className="text-[10px] text-slate-400">₫</span>
                                </span>
                              </label>
                              <label className="block min-w-0">
                                <span className="mb-0.5 block text-[10px] text-slate-500">Giảm</span>
                                <span className={`flex h-9 items-center rounded-lg border px-2 ${box}`}>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    max={MAX_GROUP_DISCOUNT}
                                    step="any"
                                    aria-label={`Giảm (%) ${product?.name || ''} cho ${group.label}`}
                                    placeholder={String(group.defaultDiscount)}
                                    value={pctShown}
                                    onFocus={() => setPctDraft(d => ({ ...d, [key]: pctShown }))}
                                    onBlur={() => setPctDraft(d => { const n = { ...d }; delete n[key]; return n; })}
                                    onChange={e => {
                                      const text = e.target.value;
                                      setPctDraft(d => ({ ...d, [key]: text }));
                                      const pct = Number(text);
                                      const nextPrice = text.trim() === '' || !Number.isFinite(pct) ? '' : String(discountedPrice(base, pct));
                                      setGroupPrice(item.productId, group.code, nextPrice);
                                    }}
                                    className={`w-full min-w-0 bg-transparent text-right text-sm font-extrabold text-[#176b52] outline-none placeholder:font-semibold placeholder:text-slate-300 ${noSpin}`}
                                  />
                                  <span className="ml-0.5 text-[10px] font-bold text-slate-400">%</span>
                                </span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Nhập giá hoặc % — ô còn lại tự tính theo giá gốc trong bài. Giá bán làm tròn đến đồng. Để trống = theo % mặc định của nhóm (số mờ).
                    </p>
                    {sale != null && <p className="text-[10px] text-amber-700">Mặt hàng đang Sale chung {money(sale)} — khách trả mức thấp hơn.</p>}
                    {error && <p role="alert" className="text-[11px] font-semibold text-rose-600">{error}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </section>
  );
}
