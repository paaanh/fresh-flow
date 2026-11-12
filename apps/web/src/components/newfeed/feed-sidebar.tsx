'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFire, faMagnifyingGlass, faPlus, faStar, faStore, faTags } from '@fortawesome/free-solid-svg-icons';
import { productImage } from '@/components/product-photo';
import UserAvatar from '@/components/user-avatar';
import { freshflow } from '@/lib/api';
import type { FeedSidebar as SidebarData, User } from '@/types/domain';

function Widget({ icon, title, children }: { icon: typeof faFire; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e2ebe5] bg-white p-3.5 shadow-sm">
      <h3 className="mb-2.5 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#1e3328]">
        <FontAwesomeIcon icon={icon} className="text-[#176b52]" /> {title}
      </h3>
      {children}
    </section>
  );
}

/** Right column of the Newfeed: real data only (orders, posts' programmes, reviews). */
export default function FeedSidebar({
  currentUser,
  money,
  refreshKey,
  onAddToCart,
}: {
  currentUser?: User;
  money: (n: number) => string;
  /** Changes when posts change, so the widgets follow the feed. */
  refreshKey: string;
  onAddToCart: (productId: number, qty: number, postId: number) => void;
}) {
  const [data, setData] = useState<SidebarData | null>(null);
  const isCustomer = currentUser?.role === 'CUSTOMER';

  useEffect(() => {
    let alive = true;
    freshflow.feedSidebar<SidebarData>().then(d => alive && setData(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <div className="space-y-3">
      {isCustomer && (
        <Link href="/requests" className="flex items-center gap-3 rounded-2xl border border-dashed border-[#176b52]/50 bg-[#f4faf6] p-3.5 transition hover:bg-emerald-50">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#176b52] text-white"><FontAwesomeIcon icon={faMagnifyingGlass} /></span>
          <span className="min-w-0">
            <b className="block text-xs text-[#145c46]">Không thấy món bạn cần?</b>
            <span className="text-[11px] text-slate-500">Gửi yêu cầu tìm nguồn mặt hàng →</span>
          </span>
        </Link>
      )}

      <Widget icon={faTags} title={isCustomer ? 'Ưu đãi dành cho bạn' : 'Ưu đãi đang chạy'}>
        {!data ? (
          <p className="text-[11px] text-slate-400">Đang tải…</p>
        ) : data.deals_for_you.length === 0 ? (
          <p className="text-[11px] text-slate-400">Chưa có ưu đãi nào lúc này.</p>
        ) : (
          <ul className="space-y-2">
            {data.deals_for_you.map(d => (
              <li key={`${d.post_id}-${d.product_id}`} className="flex items-center gap-2.5">
                <Link href={`/newfeed#post-${d.post_id}`} aria-label={`Xem bài có ${d.name}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <img src={productImage({ name: d.name, image: d.image_url })} alt="" loading="lazy" className="h-full w-full object-cover" />
                </Link>
                <Link href={`/newfeed#post-${d.post_id}`} className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-[#1a2e24]">{d.name}</span>
                  <span className="flex items-baseline gap-1">
                    <span className={`text-xs font-extrabold ${d.on_sale ? 'text-rose-600' : 'text-[#176b52]'}`}>{money(d.price)}</span>
                    <span className="rounded bg-rose-50 px-1 text-[10px] font-bold text-rose-600">-{d.saving_percent}%</span>
                  </span>
                </Link>
                {isCustomer && (
                  <button type="button" onClick={() => onAddToCart(d.product_id, 1, d.post_id)} aria-label={`Thêm ${d.name} vào giỏ`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#176b52] text-white">
                    <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Widget>

      <Widget icon={faFire} title={data?.best_sellers_period === '7_DAYS' ? 'Bán chạy 7 ngày qua' : 'Bán chạy hôm nay'}>
        {!data ? (
          <p className="text-[11px] text-slate-400">Đang tải…</p>
        ) : data.best_sellers.length === 0 ? (
          <p className="text-[11px] text-slate-400">Chưa có đơn hàng.</p>
        ) : (
          <ol className="space-y-2">
            {data.best_sellers.map((b, idx) => (
              <li key={b.product_id}>
                <Link href={`/products/${b.product_id}`} className="flex items-center gap-2.5">
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${idx < 3 ? 'bg-amber-400 text-white' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</span>
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                    <img src={productImage({ name: b.name, image: b.image_url })} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[#1a2e24]">{b.name}</span>
                    <span className="text-[10px] text-slate-500">Đã bán {b.sold} {b.unit}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Widget>

      <Widget icon={faStore} title="Cửa hàng uy tín">
        {!data ? (
          <p className="text-[11px] text-slate-400">Đang tải…</p>
        ) : data.top_shops.length === 0 ? (
          <p className="text-[11px] text-slate-400">Chưa có cửa hàng.</p>
        ) : (
          <ul className="space-y-2">
            {data.top_shops.map(s => (
              <li key={s.shop_id} className="flex items-center gap-2.5">
                <UserAvatar name={s.name} avatarUrl={s.avatar_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-[#1a2e24]">{s.name}</span>
                  <span className="text-[10px] text-slate-500">
                    {s.completed_orders} đơn hoàn thành
                    {s.review_count > 0 && <> · <FontAwesomeIcon icon={faStar} className="text-amber-400" /> {s.rating} ({s.review_count})</>}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Widget>
    </div>
  );
}
