'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faMinus, faPlus, faShoppingCart, faStar } from '@fortawesome/free-solid-svg-icons';
import ProductPhoto from '@/components/product-photo';
import QtyInput from '@/components/qty-input';
import { formatQty, isDecimalUnit } from '@/lib/quantity';
import ProductSearch from '@/components/product-search';
import { isOnSale, getProductPricing, groupDiscountPercent } from '@/features/customer/page-model';
import { Badge, Button } from './shared-ui';
import type { Product } from '@/types/domain';

const dateShort = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '';

/** Price block: sale price with the list price struck through when a Sale is active. */
export function PriceTag({ product, money, size = 'md' }: { product: Product; money: (n: number) => string; size?: 'sm' | 'md' | 'lg' }) {
  const { isSale, originalPrice, effectivePrice, discountPercent } = getProductPricing(product);
  const main = size === 'lg' ? 'text-2xl sm:text-3xl' : size === 'md' ? 'text-base sm:text-lg' : 'text-sm';
  const strike = size === 'lg' ? 'text-base sm:text-lg' : size === 'md' ? 'text-xs' : 'text-[11px]';

  // Original price struck through ABOVE the price paid (Sale or the customer's group price)
  const reduced = effectivePrice > 0 && originalPrice > effectivePrice;
  const off = isSale ? discountPercent : groupDiscountPercent(product);
  return (
    <span className="inline-flex flex-col">
      {reduced && (
        <span className={`${strike} leading-tight text-slate-400 line-through decoration-slate-400/80`}>
          {money(originalPrice)}
        </span>
      )}
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        <span className={`${main} font-extrabold leading-tight ${reduced ? 'text-rose-600' : 'text-[#176b52]'}`}>
          {money(effectivePrice)}
        </span>
        {size === 'lg' && reduced && off > 0 && (
          <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600">
            Tiết kiệm {off}%
          </span>
        )}
      </span>
    </span>
  );
}

export function SaleBadge({ product }: { product: Product }) {
  const { isSale, discountPercent } = getProductPricing(product);
  if (isSale) {
    return <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">SALE -{discountPercent}%</span>;
  }
  if (product.sale_status === 'SCHEDULED') return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Sale từ {dateShort(product.sale_start_at)}</span>;
  return null;
}

export function ProductDetail({ product, addCart, money, go }: { product: Product; addCart: (id: number, qty?: number) => void; money: (n: number) => string; go: (path: string) => void }) {
  const [quantity, setQuantity] = useState(1);
  const soldOut = product.available <= 0;
  return (
    <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1fr_420px]">
      <div className="panel relative flex h-56 items-center justify-center overflow-hidden sm:h-auto sm:min-h-[360px]">
        <ProductPhoto product={product} />
        <span className="absolute left-3 top-3"><SaleBadge product={product} /></span>
      </div>
      <div className="panel p-4 sm:p-6">
        <button onClick={() => go('/products')} className="-ml-2 mb-3 rounded-lg px-2 py-2 text-xs font-bold text-[#176b52] hover:bg-emerald-50">← Quay lại cửa hàng</button>
        <Badge tone="green">{product.category} · {product.unit}</Badge>
        <h2 className="mt-3 break-words text-xl font-extrabold sm:text-2xl">{product.name}</h2>
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
          {[0, 1, 2, 3, 4].map(i => <FontAwesomeIcon key={i} icon={faStar} />)} <span className="ml-1 text-slate-400">(Đánh giá cửa hàng)</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">{product.description || 'Sản phẩm được tuyển chọn từ nguồn cung địa phương. Tình trạng còn hàng được cập nhật theo đợt bán trong ngày.'}</p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-2 border-b pb-4">
          <PriceTag product={product} money={money} size="lg" />
          <span className={`text-xs ${soldOut ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{soldOut ? 'Tạm hết hàng' : `Còn ${product.available} ${product.unit}`}</span>
        </div>
        {isOnSale(product) && product.sale_end_at && <p className="mt-2 text-[11px] font-semibold text-rose-600">Giá Sale áp dụng đến {dateShort(product.sale_end_at)}</p>}
        <div className="mt-4 text-xs font-bold">
          Số lượng{isDecimalUnit(product.unit) ? <span className="ml-1 font-normal text-slate-400">(mua lẻ được, VD 1,5 {product.unit})</span> : null}
          <div className="mt-2">
            <QtyInput value={quantity} unit={product.unit} max={product.available} disabled={soldOut} showUnit label="số lượng mua" onChange={setQuantity} />
          </div>
        </div>
        <Button className="mt-5 w-full" disabled={soldOut} onClick={() => { addCart(product.id, quantity); go('/cart'); }}>
          <FontAwesomeIcon icon={faShoppingCart} /> Thêm {formatQty(quantity)} {product.unit} vào giỏ · {money(Math.round(product.price * quantity))}
        </Button>
        <div className="mt-4 rounded-xl bg-[#f7faf8] p-3 text-[10px] leading-relaxed text-slate-500">Giá và số lượng cuối cùng được máy chủ xác nhận khi gửi đơn. Hàng được giữ cho bạn khi cửa hàng xác nhận đơn.</div>
      </div>
    </div>
  );
}

export function ProductGrid({
  products,
  addCart,
  money,
  cart,
  setQty,
  groupName,
  go,
}: {
  products: Product[];
  addCart: (id: number) => void;
  money: (n: number) => string;
  /** Shop-bought quantities, keyed by product id. */
  cart: Record<string, number>;
  /** Change the quantity of a product already in the cart (0 removes it). */
  setQty?: (id: number, qty: number) => void;
  /** Customer's group name, to explain a group price. */
  groupName?: string;
  go?: (path: string) => void;
}) {
  const router = useRouter();
  const open = (path: string) => (go ? go(path) : router.push(path));
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {products.map(p => {
        const soldOut = p.available <= 0;
        const inCart = cart[String(p.id)] || 0;
        const groupPct = groupDiscountPercent(p);
        return (
          <article key={p.id} className="panel flex min-w-0 flex-col overflow-hidden !rounded-2xl">
            <button aria-label={`Xem ${p.name}`} onClick={() => open(`/products/${p.id}`)} className="relative flex h-24 w-full items-center justify-center bg-white min-[400px]:h-28 sm:h-[145px]">
              <ProductPhoto product={p} />
              <span className="absolute left-2 top-2"><SaleBadge product={p} /></span>
              {soldOut && <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-bold text-white">Hết hàng</span>}
            </button>
            <div className="flex flex-1 flex-col p-2.5 sm:p-4">
              <div className="truncate text-[10px] font-bold uppercase tracking-wide text-[#8e9a91]">{p.category} · {p.unit}</div>
              <button onClick={() => open(`/products/${p.id}`)} className="-my-1 mt-0 line-clamp-2 py-1 text-left text-xs font-bold leading-snug sm:text-sm">{p.name}</button>
              <div className="mt-auto pt-1.5">
                <PriceTag product={p} money={money} size="sm" />
                {groupPct > 0 && (
                  <div className="truncate text-[10px] font-semibold text-[#176b52]" title={`Giá chuẩn ${money(getProductPricing(p).originalPrice)}`}>
                    Giá nhóm{groupName ? ` ${groupName}` : ''} −{groupPct}%
                  </div>
                )}
                <div className="text-[10px] text-[#8b968f]">Còn {p.available} {p.unit}</div>
              </div>
              {inCart > 0 && setQty ? (
                <div className="mt-2 flex justify-center [&>span]:w-full [&>span]:justify-between [&>span]:border-[#cfe5d7] [&>span]:bg-[#f4faf6]" aria-label={`${p.name} trong giỏ`}>
                  <QtyInput value={inCart} unit={p.unit} max={p.available} allowZero size="sm" showUnit label={`số lượng ${p.name}`} onChange={q => setQty(p.id, q)} />
                </div>
              ) : (
                <button
                  onClick={() => addCart(p.id)}
                  disabled={soldOut}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#dcebe1] bg-[#f4faf6] py-1.5 text-[11px] font-bold text-[#286947] hover:bg-emerald-50 disabled:opacity-40 sm:py-2 sm:text-xs"
                >
                  <FontAwesomeIcon icon={faPlus} />
                  {soldOut ? 'Hết hàng' : 'Thêm vào giỏ'}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ProductsPanel({
  query,
  setQuery,
  admin,
  products,
  categories = [],
  category,
  setCategory,
  addCart,
  money,
  create,
  createCategory,
  bulk,
  go,
  edit,
  remove,
  cart = {},
  setQty,
  groupName,
}: {
  cart?: Record<string, number>;
  setQty?: (id: number, qty: number) => void;
  groupName?: string;
  query: string;
  setQuery: (value: string) => void;
  admin: boolean;
  products: Product[];
  categories?: string[];
  category: string;
  setCategory: (value: string) => void;
  addCart: (id: number) => void;
  money: (value: number) => string;
  create: () => void;
  createCategory?: () => void;
  /** Opens "Nhập hàng loạt". */
  bulk?: () => void;
  go: (path: string) => void;
  /** Opens the shared product editor (name, price, Sale programme, image). */
  edit: (product: Product) => void;
  remove: (id: number) => void;
}) {
  const categoryOptions = categories.length > 0 ? categories : Array.from(new Set(['Trái cây', 'Rau củ', 'Thực phẩm', ...products.map(p => p.category).filter(Boolean)]));
  const filterTabs = ['Tất cả', ...categoryOptions];
  const status = (p: Product) =>
    p.available <= 0 ? { label: 'Hết hàng', tone: 'red' } : p.available < 10 ? { label: 'Sắp hết', tone: 'orange' } : { label: 'Đang bán', tone: 'green' };
  const [sort, setSort] = useState<'default' | 'price-asc' | 'price-desc' | 'deals' | 'newest'>('default');
  const filtered = query.trim() !== '' || category !== 'Tất cả';
  const shown = useMemo(() => {
    const list = [...products];
    if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
    else if (sort === 'newest') list.sort((a, b) => b.id - a.id);
    else if (sort === 'deals') {
      const off = (p: Product) => getProductPricing(p).discountPercent || groupDiscountPercent(p);
      list.sort((a, b) => off(b) - off(a));
    }
    // sold-out items go last in every order
    return list.sort((a, b) => Number(a.available <= 0) - Number(b.available <= 0));
  }, [products, sort]);

  return (
    <>
      <ProductSearch value={query} onChange={setQuery} count={products.length} />
      <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 scrollbar-hide sm:mx-0 sm:flex-wrap sm:px-0">
          {filterTabs.map(value => (
            <button key={value} onClick={() => setCategory(value)} className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-semibold ${category === value ? 'bg-[#176b52] text-white' : 'border border-[#e5eae5] bg-white text-[#6f7c73]'}`}>
              {value}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!admin && (
            <label className="flex items-center gap-1.5 text-xs text-[#6f7c73]">
              <span className="whitespace-nowrap font-semibold">Sắp xếp</span>
              <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="rounded-xl border border-[#e5eae5] bg-white px-2.5 py-2 text-xs font-semibold text-[#3d5045] focus:border-[#176b52] focus:outline-none">
                <option value="default">Phổ biến</option>
                <option value="deals">Đang giảm giá</option>
                <option value="price-asc">Giá thấp → cao</option>
                <option value="price-desc">Giá cao → thấp</option>
                <option value="newest">Mới lên kệ</option>
              </select>
            </label>
          )}
          {filtered && <Button kind="secondary" className="!px-3 !py-2 text-xs" onClick={() => { setQuery(''); setCategory('Tất cả'); }}><FontAwesomeIcon icon={faFilter} /> Xóa lọc</Button>}
          {admin && createCategory && <Button kind="secondary" className="!px-3 !py-2 text-xs" onClick={createCategory}>Danh mục</Button>}
          {admin && bulk && <Button kind="secondary" className="!px-3 !py-2 text-xs" onClick={bulk}>Nhập hàng loạt</Button>}
          {admin && <Button className="!px-3 !py-2 text-xs" onClick={create}><FontAwesomeIcon icon={faPlus} /> Sản phẩm</Button>}
        </div>
      </div>

      {!admin ? (
        shown.length ? (
          <ProductGrid products={shown} addCart={addCart} money={money} cart={cart} setQty={setQty} groupName={groupName} go={go} />
        ) : (
          <div className="panel p-10 text-center">
            <h3 className="text-sm font-bold">Không tìm thấy sản phẩm phù hợp</h3>
            <p className="mt-1 text-xs text-slate-500">Thử từ khóa khác, hoặc gửi yêu cầu để cửa hàng tìm nguồn cho bạn.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {filtered && <Button kind="secondary" className="!px-3 !py-2 text-xs" onClick={() => { setQuery(''); setCategory('Tất cả'); }}>Xem tất cả sản phẩm</Button>}
              <Button className="!px-3 !py-2 text-xs" onClick={() => go('/requests')}>Yêu cầu mặt hàng</Button>
            </div>
          </div>
        )
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap justify-between gap-2 border-b p-4">
            <div><b className="text-sm">Danh sách mặt hàng</b><span className="ml-2 text-xs text-slate-400">{products.length} mặt hàng</span></div>
            <span className="text-[10px] text-slate-400">Giá gốc, giá Sale và tồn kho đồng bộ với Kho hàng và đơn mới.</span>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-[#f0f2ef] md:hidden">
            {products.map(product => {
              const st = status(product);
              return (
                <li key={product.id} className="flex gap-3 p-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl"><ProductPhoto product={product} /></div>
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <b className="line-clamp-2 break-words">{product.name}</b>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{product.category} · {product.unit}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2"><PriceTag product={product} money={money} size="sm" /><SaleBadge product={product} /></div>
                    <div className="mt-1 text-[10px] text-slate-500">Khả dụng <b>{product.available}</b>{product.reserved ? ` · Đang giữ ${product.reserved}` : ''}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => edit(product)} className="rounded-lg border border-[#d6e7dc] px-3 py-1.5 font-bold text-[#176b52] hover:bg-emerald-50">Sửa giá / Sale</button>
                      <button onClick={() => { if (window.confirm(`Ngừng bán “${product.name}”?`)) remove(product.id); }} className="rounded-lg border border-rose-200 px-3 py-1.5 font-semibold text-rose-600 hover:bg-rose-50">Xóa</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-[#fafcfa] text-[10px] uppercase tracking-wide text-slate-400">
                <tr>{['Sản phẩm', 'Danh mục', 'Giá bán', 'Khả dụng', 'Đang giữ', 'Trạng thái', 'Tác vụ'].map(value => <th key={value} className="px-4 py-3 font-bold">{value}</th>)}</tr>
              </thead>
              <tbody>
                {products.map(product => {
                  const st = status(product);
                  return (
                    <tr key={product.id} className="border-t border-[#f0f2ef]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl"><ProductPhoto product={product} /></div>
                          <div className="min-w-0"><b className="break-words">{product.name}</b><div className="mt-0.5 text-[10px] text-slate-400">SKU-{String(product.id).padStart(4, '0')} · {product.unit}</div></div>
                        </div>
                      </td>
                      <td className="px-4 text-slate-500">{product.category}</td>
                      <td className="px-4">
                        <PriceTag product={product} money={money} size="sm" />
                        <div className="mt-0.5"><SaleBadge product={product} /></div>
                      </td>
                      <td className="px-4"><b className={product.available < 10 ? 'text-rose-600' : 'text-[#40564a]'}>{product.available}</b> {product.unit}</td>
                      <td className="px-4 text-slate-500">{product.reserved ?? 0} {product.unit}</td>
                      <td className="px-4"><Badge tone={st.tone}>{st.label}</Badge></td>
                      <td className="px-4">
                        <div className="flex gap-3">
                          <button onClick={() => edit(product)} className="font-bold text-[#176b52]">Sửa giá / Sale</button>
                          <button onClick={() => { if (window.confirm(`Ngừng bán “${product.name}”?`)) remove(product.id); }} className="font-semibold text-rose-600">Xóa</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {products.length === 0 && <div className="p-10 text-center text-xs text-slate-500">Không có sản phẩm khớp bộ lọc.</div>}
        </div>
      )}
    </>
  );
}
