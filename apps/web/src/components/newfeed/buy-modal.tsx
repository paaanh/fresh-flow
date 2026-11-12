'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faMinus, faPlus, faShoppingBasket, faXmark } from '@fortawesome/free-solid-svg-icons';
import { productImage } from '@/components/product-photo';
import QtyInput from '@/components/qty-input';
import type { Post, User } from '@/types/domain';
import { viewerPrice } from './post-card';
import { buyable } from './utils';

/** Combined "choose & buy" popup for all products of a post (prices of this post's programme). */
export default function BuyModal({
  post,
  previewGroup,
  currentUser,
  groupLabel,
  money,
  onAddToCart,
  onClose,
}: {
  post: Post;
  previewGroup: string;
  currentUser?: User;
  groupLabel: (code?: string | null) => string;
  money: (n: number) => string;
  onAddToCart: (productId: number, qty: number, postId: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const items = post.products_info || [];
  const [qty, setQty] = useState<Record<number, number>>(() => Object.fromEntries(items.map(i => [i.id, 1])));
  const canBuy = !currentUser || currentUser.role === 'CUSTOMER';
  const single = post.target_audience !== 'ALL' && post.target_customer_group ? post.target_customer_group : '';
  const priceFor = single
    ? `Giá nhóm ${groupLabel(single)}`
    : canBuy
      ? `Giá nhóm ${groupLabel(currentUser?.customer_group) || 'của bạn'}`
      : previewGroup
        ? `Giá nhóm ${groupLabel(previewGroup)}`
        : 'Giá chuẩn trong bài';
  const addable = items.filter(i => buyable(post, i).ok);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="buy-title">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e8ede8] bg-[#f8fbf9] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-[#176b52]">{post.shop_name || post.author_name}</div>
            <h3 id="buy-title" className="truncate text-base font-extrabold text-[#182920]">{post.title}</h3>
            <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
              <span className="font-semibold text-[#176b52]">{priceFor}</span>
              {post.delivery_time_text && <span><FontAwesomeIcon icon={faClock} className="mr-1" />{post.delivery_time_text}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 sm:p-5">
          {items.map(prod => {
            const { price, base, onSale, saving } = viewerPrice(prod, previewGroup);
            const state = buyable(post, prod);
            const max = Number(prod.available_quantity || 0);
            const q = Math.min(qty[prod.id] ?? 1, max);
            return (
              <li key={prod.id} className="flex flex-col gap-3 rounded-2xl border border-[#dfeae3] bg-[#fbfdfb] p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <img src={productImage({ name: prod.name, image: prod.image_url })} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-[#e3ebe5] bg-white object-cover" />
                  <div className="min-w-0">
                    <div className="break-words text-sm font-extrabold text-[#1a2e24]">{prod.name}</div>
                    {price < base && <div className="mt-0.5 text-xs leading-tight text-slate-400 line-through decoration-slate-400">{money(base)}</div>}
                    <div className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className={`text-base font-extrabold ${price < base ? 'text-rose-600' : 'text-[#176b52]'}`}>{money(price)}</span>
                      <span className="text-xs text-slate-500">/ {prod.unit}</span>
                      {onSale ? (
                        <span className="rounded bg-rose-600 px-1.5 text-[10px] font-extrabold text-white">SALE{saving ? ` -${saving}%` : ''}</span>
                      ) : saving ? (
                        <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-bold text-[#176b52]">-{saving}%</span>
                      ) : null}
                    </div>
                    <div className={`text-[11px] font-semibold ${state.ok ? 'text-slate-500' : 'text-rose-600'}`}>
                      {state.ok ? `Còn ${prod.available_quantity} ${prod.unit}${prod.remaining_quantity != null ? ' (suất của bài)' : ''}` : state.reason}
                    </div>
                  </div>
                </div>
                {canBuy && (
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <QtyInput value={q} unit={prod.unit} max={max} disabled={!state.ok} showUnit label={`số lượng ${prod.name}`} onChange={next => setQty(v => ({ ...v, [prod.id]: next }))} />
                    <button type="button" disabled={!state.ok} onClick={() => onAddToCart(prod.id, q, post.id)} className="rounded-xl bg-[#176b52] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#125340] disabled:opacity-40">
                      <FontAwesomeIcon icon={faShoppingBasket} className="mr-1.5" />Thêm giỏ
                    </button>
                  </div>
                )}
              </li>
            );
          })}
          {items.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-xs text-slate-500">Bài viết chưa gắn mặt hàng.</li>}
        </ul>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#e8ede8] bg-[#f8fbf9] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {canBuy ? (
            <button
              type="button"
              disabled={!addable.length}
              onClick={() => addable.forEach(p => onAddToCart(p.id, Math.min(qty[p.id] ?? 1, Number(p.available_quantity || 0)), post.id))}
              className="rounded-xl border border-[#176b52] bg-white px-4 py-2 text-xs font-bold text-[#176b52] hover:bg-[#eef7f1] disabled:opacity-40"
            >
              + Thêm tất cả ({addable.length} món)
            </button>
          ) : (
            <span className="text-[11px] text-slate-500">Chế độ xem của quản lý</span>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64]">Đóng</button>
            {canBuy && (
              <button type="button" onClick={() => { onClose(); router.push('/cart'); }} className="rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white">
                Đi tới giỏ hàng →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
