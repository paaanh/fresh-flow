'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarAlt, faClock, faEdit, faFire, faLayerGroup, faPlus, faTag, faTags, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { ProductDraft } from '@/components/product-editor-modal';
import type { CustomerGroup, Post, Product, User } from '@/types/domain';
import BuyModal from './buy-modal';
import FeedSidebar from './feed-sidebar';
import PostCard from './post-card';
import PostComposer, { type ComposerFocus } from './post-composer';
import { pricingGroupsOf } from './utils';

interface NewfeedProps {
  posts: Post[];
  products: Product[];
  categories?: string[];
  customerGroups?: CustomerGroup[];
  currentUser?: User;
  /** postId: bought through that post (its programme price and quantity limit apply). */
  onAddToCart: (productId: number, qty?: number, postId?: number | null) => void;
  onCreatePost?: (postData: any) => Promise<boolean | void>;
  onUpdatePost?: (postId: number, postData: any) => Promise<boolean | void>;
  onDeletePost?: (postId: number) => Promise<void>;
  onCreateProduct?: (draft: ProductDraft) => Promise<Product | null>;
  onCreateCustomerGroup?: (data: { code: string; name: string; description?: string; discount_percent?: number }) => Promise<CustomerGroup | undefined>;
  hasMorePosts?: boolean;
  loadingMorePosts?: boolean;
  onLoadMorePosts?: () => void;
  onNotify?: (message: string) => void;
  money: (n: number) => string;
  /** /newfeed/create opens the composer directly. */
  forceCreateMode?: boolean;
}

const FILTERS = [
  { id: 'ALL', label: 'Tất cả', icon: faFire },
  { id: 'DEALS', label: 'Đang ưu đãi', icon: faTags },
  { id: 'DAILY_SPECIAL', label: 'Món ngon hôm nay', icon: faClock },
  { id: 'PROMOTION', label: 'Ưu đãi nhóm', icon: faTag },
  { id: 'PRODUCT_INTRO', label: 'Mới lên kệ', icon: faLayerGroup },
];

export default function Newfeed({
  posts,
  products,
  categories = [],
  customerGroups = [],
  currentUser,
  onAddToCart,
  onCreatePost,
  onUpdatePost,
  onDeletePost,
  onCreateProduct,
  onCreateCustomerGroup,
  hasMorePosts,
  loadingMorePosts,
  onLoadMorePosts,
  onNotify,
  money,
  forceCreateMode = false,
}: NewfeedProps) {
  const router = useRouter();
  const [filter, setFilter] = useState('ALL');
  // Editing an existing post opens a popup; creating a post is its own page (/newfeed/create)
  const [composer, setComposer] = useState<{ post: Post; focus: ComposerFocus } | null>(null);
  const [buying, setBuying] = useState<{ post: Post; previewGroup: string } | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const canPost = currentUser?.role === 'ADMIN' || currentUser?.role === 'SHOP';
  const pricingGroups = useMemo(() => pricingGroupsOf(customerGroups), [customerGroups]);
  const groupNames = useMemo(() => Object.fromEntries(customerGroups.map(g => [g.code, g.name || g.code])), [customerGroups]);
  const groupLabel = (code?: string | null) => (code ? groupNames[code] || code : '');
  const pickable = currentUser?.role === 'SHOP' ? products.filter(p => !p.shop_id || p.shop_id === currentUser.id) : products;


  // Shared links /newfeed#post-12 scroll to the post once it is loaded
  useEffect(() => {
    const id = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (id.startsWith('post-')) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [posts.length]);

  const shown = posts.filter(p => {
    if (filter === 'ALL') return true;
    if (filter === 'MINE') return p.author_id === currentUser?.id;
    if (filter === 'DEALS') return (p.products_info || []).some(i => (i.sale_percent || 0) > 0 || i.on_sale);
    return p.post_type === filter;
  });

  const submitEdit = async (payload: Record<string, unknown>) => {
    if (!composer) return false;
    return (await onUpdatePost?.(composer.post.id, payload)) !== false;
  };

  if (forceCreateMode) {
    if (!canPost) {
      return <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">Chỉ Cửa hàng và Quản trị viên được đăng bài.</div>;
    }
    return (
      <PostComposer
        variant="page"
        post={null}
        products={products}
        pickable={pickable}
        categories={categories}
        pricingGroups={pricingGroups}
        currentUser={currentUser}
        money={money}
        onSubmit={async payload => (await onCreatePost?.(payload)) !== false}
        onClose={() => router.push('/newfeed')}
        onCreateProduct={onCreateProduct}
        onCreateCustomerGroup={onCreateCustomerGroup}
      />
    );
  }

  const addToCart = (productId: number, qty: number, postId: number) => onAddToCart(productId, qty, postId);

  const confirmDelete = async () => {
    if (!deleting || !onDeletePost) return;
    setDeleteBusy(true);
    try {
      await onDeletePost(deleting.id);
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="min-w-0 space-y-4">
        {/* Filters + "Thêm bài viết" (opens /newfeed/create) */}
        <div className="flex items-center gap-2 rounded-2xl border border-[#e8ede8] bg-white p-2 shadow-sm">
          <div className="relative min-w-0 flex-1">
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pr-6 scrollbar-hide" role="tablist" aria-label="Lọc bài đăng">
            {[...FILTERS, ...(canPost ? [{ id: 'MINE', label: 'Bài của tôi', icon: faEdit }] : [])].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${filter === tab.id ? 'bg-[#176b52] text-white' : 'bg-[#f4f7f4] text-[#55695e] hover:bg-[#e9f0e9]'}`}
              >
                <FontAwesomeIcon icon={tab.icon} /> {tab.label}
              </button>
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
          </div>
          {canPost && (
            <button
              type="button"
              onClick={() => router.push('/newfeed/create')}
              aria-label="Thêm bài viết"
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#176b52] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#125340]"
            >
              <FontAwesomeIcon icon={faPlus} /> <span className="hidden min-[380px]:inline">Thêm bài viết</span>
            </button>
          )}
        </div>

        {shown.map(post => (
          <PostCard
            key={post.id}
            post={post}
            currentUser={currentUser}
            groupLabel={groupLabel}
            groupCount={pricingGroups.length}
            money={money}
            onOpenBuy={(p, previewGroup) => setBuying({ post: p, previewGroup })}
            onAddToCart={addToCart}
            onEdit={onUpdatePost ? p => setComposer({ post: p, focus: 'content' }) : undefined}
            onDelete={onDeletePost ? p => setDeleting(p) : undefined}
            onNotify={onNotify}
          />
        ))}

        {shown.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#d8e0d8] bg-white p-10 text-center">
            <FontAwesomeIcon icon={faCalendarAlt} className="text-2xl text-[#9aab9f]" />
            <h3 className="mt-3 text-sm font-bold text-[#1c2c23]">Chưa có bài đăng trong mục này</h3>
            <p className="mt-1 text-xs text-[#7e8f84]">{hasMorePosts ? 'Thử tải thêm bài cũ hơn.' : 'Hãy quay lại sau hoặc chọn mục khác.'}</p>
          </div>
        )}

        {hasMorePosts && onLoadMorePosts && (
          <div className="flex justify-center">
            <button type="button" onClick={onLoadMorePosts} disabled={loadingMorePosts} className="rounded-xl border border-[#d2ddd5] bg-white px-5 py-2.5 text-xs font-bold text-[#176b52] hover:bg-[#eef7f1] disabled:opacity-50">
              {loadingMorePosts ? 'Đang tải…' : 'Xem thêm bài đăng'}
            </button>
          </div>
        )}
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <FeedSidebar currentUser={currentUser} money={money} refreshKey={posts.map(p => `${p.id}:${p.like_count}`).join(',')} onAddToCart={addToCart} />
        </div>
      </aside>

      {composer && (
        <PostComposer
          key={composer.post.id}
          post={composer.post}
          products={products}
          pickable={pickable}
          categories={categories}
          pricingGroups={pricingGroups}
          currentUser={currentUser}
          money={money}
          initialFocus={composer.focus}
          onSubmit={submitEdit}
          onClose={() => setComposer(null)}
          onCreateProduct={onCreateProduct}
          onCreateCustomerGroup={onCreateCustomerGroup}
        />
      )}

      {buying && (
        <BuyModal
          post={posts.find(p => p.id === buying.post.id) || buying.post}
          previewGroup={buying.previewGroup}
          currentUser={currentUser}
          groupLabel={groupLabel}
          money={money}
          onAddToCart={addToCart}
          onClose={() => setBuying(null)}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50"><FontAwesomeIcon icon={faTrash} /></div>
              <div>
                <h3 id="delete-dialog-title" className="text-base font-extrabold text-[#1a2d23]">Xóa bài đăng?</h3>
                <p className="text-xs text-slate-500">Bài sẽ bị ẩn khỏi Newfeed; khách không mua qua bài được nữa.</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs text-[#2c3d33]">
              Xóa bài <b className="text-rose-700">“{deleting.title}”</b>? Mặt hàng, tồn kho và các đơn đã đặt qua bài không bị ảnh hưởng.
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <button type="button" disabled={deleteBusy} onClick={() => setDeleting(null)} className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64] disabled:opacity-50">Hủy</button>
              <button type="button" disabled={deleteBusy} onClick={() => void confirmDelete()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                {deleteBusy ? 'Đang xóa…' : 'Xác nhận xóa bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
