'use client';

import { useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxOpen,
  faChevronDown,
  faClock,
  faComment,
  faEdit,
  faHeart,
  faPlus,
  faShareNodes,
  faShoppingBasket,
  faStore,
  faTrash,
  faUserGroup,
} from '@fortawesome/free-solid-svg-icons';
import { productImage } from '@/components/product-photo';
import UserAvatar from '@/components/user-avatar';
import { resolvePostImage } from '@/components/newfeed-parts';
import { freshflow } from '@/lib/api';
import { RichTextView, toPlainText } from '@/components/rich-text';
import type { Post, PostProductInfo, User } from '@/types/domain';
import PostComments, { type PostCommentsHandle } from './post-comments';
import { buyable, fullDate, parseImageUrls, postTypeMeta, relativeTime, shortDateTime } from './utils';

export type PostCardProps = {
  post: Post;
  currentUser?: User;
  groupLabel: (code?: string | null) => string;
  /** Number of active customer groups (for "Ưu đãi cho N nhóm"). */
  groupCount: number;
  money: (n: number) => string;
  onOpenBuy: (post: Post, previewGroup: string) => void;
  onAddToCart: (productId: number, qty: number, postId: number) => void;
  onEdit?: (post: Post) => void;
  onDelete?: (post: Post) => void;
  onNotify?: (message: string) => void;
};

/** Price of a product of this post for the current viewer, or for a group a manager previews. */
export function viewerPrice(prod: PostProductInfo, previewGroup: string) {
  const preview = previewGroup && prod.group_prices?.[previewGroup] != null;
  const price = preview ? Number(prod.group_prices![previewGroup]) : Number(prod.effective_price ?? prod.base_price ?? 0);
  const base = Number(prod.base_price || price);
  const saleCandidates = [prod.post_sale_price, prod.sale_status === 'ACTIVE' ? prod.product_sale_price : null].filter((v): v is number => v != null);
  const onSale = preview ? saleCandidates.some(s => Number(s) === price && price < base) : Boolean(prod.on_sale);
  const saving = base > price ? Math.round((1 - price / base) * 100) : 0;
  return { price, base, onSale, saving };
}

export default function PostCard({ post, currentUser, groupLabel, groupCount, money, onOpenBuy, onAddToCart, onEdit, onDelete, onNotify }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [previewGroup, setPreviewGroup] = useState('');
  const [liked, setLiked] = useState(Boolean(post.liked_by_me));
  const [likes, setLikes] = useState(post.like_count || 0);
  const commentsRef = useRef<PostCommentsHandle>(null);
  const [comments, setComments] = useState(post.comment_count || 0);
  const [liking, setLiking] = useState(false);

  const isCustomer = currentUser?.role === 'CUSTOMER';
  const canBuy = !currentUser || isCustomer;
  const isAuthor = currentUser?.role === 'ADMIN' || (currentUser?.role === 'SHOP' && post.author_id === currentUser.id);
  // Groups the post is for ([] = everybody); a customer only receives their own group
  const postGroups = post.target_audience === 'ALL' ? [] : (post.target_groups?.length ? post.target_groups : post.target_customer_group ? [post.target_customer_group] : []);
  const single = postGroups.length === 1 ? postGroups[0] : '';
  const userGroup = currentUser?.customer_group || '';
  const products = post.products_info || [];
  const images = parseImageUrls(post.image_urls).map(resolvePostImage);
  const album = images.length ? images : [productImage({ name: post.title, image: products[0]?.image_url || '' })];
  const meta = postTypeMeta(post.post_type);
  const myDiscount = single ? post.group_discounts?.[single] : post.group_discounts?.[userGroup];
  // Groups a manager can preview prices for (every group the post prices)
  const policyGroups = Object.keys(products[0]?.group_prices || {});
  const plain = useMemo(() => toPlainText(post.content || ''), [post.content]);
  // long = many characters, or more than 5 paragraphs / list items / line breaks
  const blocks = /<[a-z]/i.test(post.content || '')
    ? ((post.content || '').match(/<(p|li|h[2-4]|br|blockquote)\b/gi) || []).length
    : plain.split('\n').filter(l => l.trim()).length;
  const longText = plain.length > 220 || blocks > 5;

  // Server state changes (polling) win over local optimistic state once they arrive
  const [seen, setSeen] = useState({ likes: post.like_count, liked: post.liked_by_me, comments: post.comment_count });
  if (seen.likes !== post.like_count || seen.liked !== post.liked_by_me || seen.comments !== post.comment_count) {
    setSeen({ likes: post.like_count, liked: post.liked_by_me, comments: post.comment_count });
    setLikes(post.like_count || 0);
    setLiked(Boolean(post.liked_by_me));
    setComments(post.comment_count || 0);
  }

  const toggleLike = async () => {
    if (!currentUser || liking) return;
    setLiking(true);
    setLiked(v => !v);
    setLikes(n => n + (liked ? -1 : 1));
    try {
      const res = await freshflow.togglePostLike(post.id);
      setLiked(res.liked);
      setLikes(res.like_count);
    } catch (e) {
      setLiked(liked);
      setLikes(likes);
      onNotify?.(e instanceof Error ? e.message : 'Không thể thích bài đăng');
    } finally {
      setLiking(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/newfeed#post-${post.id}`;
    // Phones/tablets: native share sheet. Desktop: copy the link.
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (navigator.share && touch) {
      try {
        await navigator.share({ title: post.title, text: plain.slice(0, 120), url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // người dùng tự hủy
        // không có giao diện chia sẻ (máy tính, trình duyệt cũ): sao chép liên kết thay thế
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      onNotify?.('Đã sao chép liên kết bài đăng');
    } catch {
      window.prompt('Sao chép liên kết bài đăng:', url);
    }
  };

  return (
    <article id={`post-${post.id}`} className="scroll-mt-24 overflow-hidden rounded-2xl border border-[#e2ebe5] bg-white shadow-sm">
      {/* Header */}
      <header className="flex items-start justify-between gap-2 p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          {post.author_avatar_url ? (
            <UserAvatar name={post.shop_name || post.author_name} avatarUrl={post.author_avatar_url} size="lg" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#176b52] to-[#289672] text-lg text-white">
              <FontAwesomeIcon icon={faStore} />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-extrabold text-[#1a2d23]">{post.shop_name || post.author_name || 'Cửa hàng FreshFlow'}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#7c8d83]">
              <time dateTime={post.created_at} title={fullDate(post.created_at)}>{relativeTime(post.created_at)}</time>
              <span aria-hidden>·</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
              {post.delivery_time_text && (
                <span className="inline-flex items-center gap-1"><FontAwesomeIcon icon={faClock} className="text-[10px]" />{post.delivery_time_text}</span>
              )}
            </div>
          </div>
        </div>
        {isAuthor && (onEdit || onDelete) && (
          <div className="flex shrink-0 gap-1.5">
            {onEdit && (
              <button type="button" onClick={() => onEdit(post)} aria-label="Sửa bài đăng" className="rounded-xl border border-[#d8e3dc] px-2.5 py-1.5 text-xs font-bold text-[#176b52] hover:bg-[#eef7f1]">
                <FontAwesomeIcon icon={faEdit} /><span className="ml-1 hidden sm:inline">Sửa</span>
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(post)} aria-label="Xóa bài đăng" className="rounded-xl border border-rose-200 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50">
                <FontAwesomeIcon icon={faTrash} /><span className="ml-1 hidden sm:inline">Xóa</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Content */}
      <div className="px-3 pb-3 sm:px-4">
        <h2 className="break-words text-base font-extrabold leading-snug text-[#182920]">{post.title}</h2>
        {post.content && (
          <RichTextView content={post.content} className={`mt-1.5 break-words text-[13px] leading-relaxed text-[#3f5247] ${!expanded && longText ? 'line-clamp-4' : ''}`} />
        )}
        {longText && (
          <button type="button" onClick={() => setExpanded(v => !v)} className="mt-1 text-xs font-bold text-[#176b52]">{expanded ? 'Thu gọn' : 'Xem thêm'}</button>
        )}
      </div>

      {/* Album: click opens the combined buy popup */}
      <button
        type="button"
        onClick={() => onOpenBuy(post, previewGroup)}
        aria-label={canBuy ? `Xem và mua mặt hàng của bài ${post.title}` : `Xem mặt hàng của bài ${post.title}`}
        className={`grid w-full gap-0.5 bg-[#e8eee9] ${album.length === 1 ? 'grid-cols-1' : album.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}
      >
        {album.slice(0, album.length === 1 ? 1 : 6).map((src, idx) => (
          <span key={idx} className={`relative block overflow-hidden bg-slate-100 ${album.length === 1 ? 'max-h-[300px] sm:max-h-[440px]' : 'aspect-[4/3]'}`}>
            <img src={src} alt={`${post.title} ${idx + 1}`} loading="lazy" className="h-full w-full object-cover" />
            {idx === 5 && album.length > 6 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-extrabold text-white">+{album.length - 6}</span>}
          </span>
        ))}
      </button>

      {/* Group & price policy (only when the post sells something) */}
      {products.length > 0 && (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pt-3 sm:px-4">
        {/* icon, label and discount stay together; only the label itself wraps */}
        <span className="flex min-w-0 items-start gap-2 text-xs font-bold leading-5 text-[#145c46]">
          <FontAwesomeIcon icon={faUserGroup} className="mt-[3px] shrink-0 text-xs text-[#176b52]" />
          <span className="min-w-0">
            {single ? (
              <>Dành riêng nhóm <b className="font-extrabold">{groupLabel(single)}</b></>
            ) : postGroups.length > 1 ? (
              <>Dành cho {postGroups.length} nhóm: <b className="font-extrabold">{postGroups.map(groupLabel).join(', ')}</b></>
            ) : isCustomer ? (
              <>Giá cho nhóm <b className="font-extrabold">{groupLabel(userGroup) || 'của bạn'}</b></>
            ) : (
              <>Ưu đãi cho {Object.keys(post.group_discounts || {}).length || groupCount} nhóm khách hàng</>
            )}
            {(single || isCustomer) && myDiscount ?<span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-rose-600 px-2 align-[1px] text-[10px] font-extrabold leading-4 text-white">-{myDiscount}%</span> : null}
          </span>
        </span>
        {post.program_status && post.program_status !== 'ACTIVE' && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${post.program_status === 'UPCOMING' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
            {post.program_status === 'UPCOMING' ? `Mở bán ${post.order_start_at ? shortDateTime(post.order_start_at) : 'sắp tới'}` : 'Chương trình đã kết thúc'}
          </span>
        )}
        {!isCustomer && policyGroups.length > 1 && (
          <button type="button" onClick={() => setPolicyOpen(v => !v)} aria-expanded={policyOpen} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-[#176b52] hover:bg-emerald-50">
            Xem giá {policyGroups.length} nhóm <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition ${policyOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      )}
      {policyOpen && products.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-2 sm:px-4" role="group" aria-label="Xem giá theo nhóm">
          {[{ code: '', label: 'Giá gốc' }, ...policyGroups.map(code => ({ code, label: groupLabel(code) }))].map(chip => {
            const active = previewGroup === chip.code;
            const pct = chip.code ? post.group_discounts?.[chip.code] : undefined;
            return (
              <button
                key={chip.code || 'base'}
                type="button"
                aria-pressed={active}
                onClick={() => setPreviewGroup(chip.code)}
                className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${active ? 'border-[#176b52] bg-[#176b52] text-white' : 'border-[#cfe3d6] bg-white text-[#2f5a46] hover:bg-emerald-50'}`}
              >
                {chip.label}{pct !== undefined ? ` · -${pct}%` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* Tagged products: horizontal carousel */}
      {products.length > 0 && (
        <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 py-3 scrollbar-hide sm:px-4" aria-label="Mặt hàng trong bài">
          {products.map(prod => {
            const { price, base, onSale, saving } = viewerPrice(prod, previewGroup);
            const state = buyable(post, prod);
            return (
              <li key={prod.id} className="w-[13.5rem] shrink-0 snap-start sm:w-[15rem]">
                <div className="flex h-full items-center gap-2.5 rounded-xl border border-[#dfeae3] bg-white p-2">
                  <button type="button" onClick={() => onOpenBuy(post, previewGroup)} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100" aria-label={`Xem ${prod.name}`}>
                    <img src={productImage({ name: prod.name, image: prod.image_url })} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                  <button type="button" onClick={() => onOpenBuy(post, previewGroup)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-xs font-bold text-[#1a2e24]">{prod.name}</span>
                    {price < base && <span className="block text-[10px] leading-tight text-slate-400 line-through decoration-slate-400">{money(base)}</span>}
                    <span className="flex flex-wrap items-baseline gap-x-1">
                      <span className={`text-sm font-extrabold leading-tight ${price < base ? 'text-rose-600' : 'text-[#176b52]'}`}>{money(price)}</span>
                      <span className="text-[10px] text-slate-400">/{prod.unit}</span>
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {onSale ? <b className="text-rose-600">SALE{saving ? ` -${saving}%` : ''}</b> : saving ? `Tiết kiệm ${saving}%` : null}
                      {state.ok ? (prod.remaining_quantity != null ? ` · còn ${prod.available_quantity}` : '') : <b className="text-slate-500"> {state.reason}</b>}
                    </span>
                  </button>
                  {canBuy && (
                    <button
                      type="button"
                      disabled={!state.ok}
                      onClick={() => onAddToCart(prod.id, 1, post.id)}
                      aria-label={`Thêm ${prod.name} vào giỏ`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#176b52] text-white hover:bg-[#125340] active:scale-95 disabled:bg-slate-300"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Interaction bar */}
      <div className="flex items-center justify-between gap-1 border-t border-[#edf2ee] px-1.5 py-1 sm:px-3">
        <div className="flex">
          <button
            type="button"
            onClick={() => void toggleLike()}
            disabled={!currentUser}
            aria-pressed={liked}
            aria-label={`Thích${likes ? ` (${likes})` : ''}`}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition hover:bg-slate-50 ${liked ? 'text-rose-600' : 'text-slate-500'}`}
          >
            <FontAwesomeIcon icon={faHeart} className={liked ? "" : "opacity-40"} /> {likes > 0 ? likes : ''} <span className="hidden min-[400px]:inline">Thích</span>
          </button>
          <button type="button" aria-label={`Bình luận${comments ? ` (${comments})` : ''}`} onClick={() => commentsRef.current?.focus()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">
            <FontAwesomeIcon icon={faComment} /> {comments > 0 ? comments : ''} <span className="hidden min-[400px]:inline">Bình luận</span>
          </button>
          <button type="button" aria-label="Chia sẻ" onClick={() => void share()} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">
            <FontAwesomeIcon icon={faShareNodes} /> <span className="hidden min-[400px]:inline">Chia sẻ</span>
          </button>
        </div>
        {products.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenBuy(post, previewGroup)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition active:scale-95 ${canBuy ? 'bg-[#176b52] text-white hover:bg-[#135843]' : 'text-[#176b52] hover:bg-[#eef7f1]'}`}
          >
            <FontAwesomeIcon icon={canBuy ? faShoppingBasket : faBoxOpen} />
            {canBuy ? 'Chọn mua' : `${products.length} mặt hàng`}
          </button>
        )}
      </div>

      <PostComments ref={commentsRef} post={post} currentUser={currentUser} groupLabel={groupLabel} onCountChange={setComments} />
    </article>
  );
}
