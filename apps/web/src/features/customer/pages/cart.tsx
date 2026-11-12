'use client';

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faCartShopping, faMinus, faNewspaper, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import ProductPhoto from '@/components/product-photo';
import QtyInput from '@/components/qty-input';
import { roundQty } from '@/lib/quantity';
import { Button } from './shared-ui';
import { cartLines, cartTotal, type Cart as CartState } from '@/lib/cart';
import type { Post, Product } from '@/types/domain';

export function Cart({
  products,
  posts = [],
  cart,
  setCart,
  money,
  go,
}: {
  products: Product[];
  /** Newfeed posts: lines bought through a post use that post's price. */
  posts?: Post[];
  cart: CartState;
  setCart: (v: CartState) => void;
  money: (n: number) => string;
  go: (s: string) => void;
}) {
  const lines = cartLines(cart, products, posts);
  const total = cartTotal(lines);
  const blocked = lines.some(l => l.unavailable);

  const setQty = (key: string, next: number) => {
    const nextCart = { ...cart };
    if (next <= 0) delete nextCart[key];
    else nextCart[key] = roundQty(next);
    setCart(nextCart);
  };

  if (!lines.length) {
    return (
      <div className="panel mx-auto max-w-lg p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-xl text-[#176b52]">
          <FontAwesomeIcon icon={faCartShopping} />
        </div>
        <h3 className="mt-4 font-bold">Giỏ hàng đang trống</h3>
        <p className="mt-2 text-xs text-slate-500">Chọn nông sản ở cửa hàng, hoặc mua theo ưu đãi trên Bảng tin.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => go('/products')}>Xem sản phẩm</Button>
          <Button kind="secondary" onClick={() => go('/newfeed')}>Ưu đãi trên Bảng tin</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_350px]">
      <div className="panel overflow-hidden">
        {lines.length ? (
          lines.map(line => {
            const p = line.product;
            const sale = line.originalPrice > line.unitPrice;
            return (
              <div key={line.key} className={`flex flex-wrap items-center gap-3 border-b p-3 sm:flex-nowrap sm:gap-4 sm:p-5 ${line.unavailable ? 'bg-rose-50/40' : ''}`}>
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl sm:h-16 sm:w-16">
                  <ProductPhoto product={p} />
                  {sale && line.discountPercent > 0 && (
                    <span className="absolute left-1 top-1 rounded bg-rose-600 px-1 text-[10px] font-extrabold text-white">-{line.discountPercent}%</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="line-clamp-2 break-words text-sm">{p.name}</b>
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5 text-xs">
                    <span className={`font-bold ${sale ? 'text-rose-600' : 'text-slate-600'}`}>{money(line.unitPrice)}</span>
                    <span className="text-slate-400">/ {p.unit}</span>
                    {sale && <span className="text-[11px] text-slate-400 line-through">{money(line.originalPrice)}</span>}
                    {line.priceLabel && <span className="rounded bg-emerald-50 px-1.5 text-[10px] font-bold text-[#176b52]">{line.priceLabel}</span>}
                  </div>
                  {line.postId && (
                    <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500">
                      <FontAwesomeIcon icon={faNewspaper} className="shrink-0" /> Mua qua bài: {line.postTitle || `#${line.postId}`}
                    </div>
                  )}
                  {line.unavailable && <div role="alert" className="mt-0.5 text-[11px] font-semibold text-rose-600">{line.unavailable} — vui lòng xóa dòng này.</div>}
                </div>
                <button aria-label={`Xóa ${p.name}`} onClick={() => setQty(line.key, 0)} className="text-slate-300 hover:text-rose-500 sm:order-last">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
                <div className="flex w-full items-center justify-between gap-3 pl-[68px] sm:w-auto sm:pl-0">
                  <QtyInput
                    value={line.quantity}
                    unit={p.unit}
                    max={line.maxQuantity}
                    allowZero
                    disabled={Boolean(line.unavailable)}
                    label={`số lượng ${p.name}`}
                    showUnit
                    onChange={q => setQty(line.key, q)}
                  />
                  <div className="text-right sm:w-28">
                    <b className={`text-sm ${sale ? 'text-rose-600' : 'text-slate-800'}`}>{money(Math.round(line.unitPrice * line.quantity))}</b>
                    {sale && <div className="text-[10px] text-slate-400 line-through">{money(Math.round(line.originalPrice * line.quantity))}</div>}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center">
            <h3 className="mt-4 font-bold">Giỏ hàng đang trống</h3>
            <p className="mt-2 text-xs text-slate-500">Thêm sản phẩm tươi ngon để bắt đầu nhé.</p>
            <Button className="mt-4" onClick={() => go('/products')}>Khám phá sản phẩm</Button>
          </div>
        )}
      </div>
      <div className="panel h-fit p-5">
        <h3 className="font-bold">Tóm tắt đơn hàng</h3>
        <div className="mt-4 flex justify-between text-xs text-slate-500"><span>Tạm tính</span><span>{money(total)}</span></div>
        <div className="mt-3 flex justify-between text-xs text-slate-500"><span>Phí giao hàng</span><span>Được tính sau</span></div>
        <div className="my-4 border-t" />
        <div className="flex justify-between font-bold"><span>Tổng cộng</span><span className="text-[#176b52]">{money(total)}</span></div>
        <Button className="mt-5 w-full" disabled={blocked || !lines.length} onClick={() => go('/checkout')}>
          Tiếp tục đặt hàng <FontAwesomeIcon icon={faArrowRight} />
        </Button>
        <div className="mt-3 text-center text-[10px] text-slate-400">
          {blocked ? 'Có mặt hàng không còn bán theo bài đăng — xóa dòng đó để tiếp tục.' : 'Giá và phí giao hàng được xác nhận khi đặt đơn'}
        </div>
      </div>
    </div>
  );
}
