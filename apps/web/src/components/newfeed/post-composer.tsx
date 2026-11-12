'use client';

import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faPenToSquare, faXmark } from '@fortawesome/free-solid-svg-icons';
import PostPricingManager, {
  emptyPricing,
  pricingFromPost,
  pricingPayload,
  validatePricing,
  type PostPricing,
  audienceFromPost,
  type PricingAudience,
  type PricingErrors,
  type PricingGroup,
} from '@/components/post-pricing-manager';
import ProductEditorModal, { type ProductDraft } from '@/components/product-editor-modal';
import type { CustomerGroup, Post, Product, User } from '@/types/domain';
import { POST_TYPES } from './utils';
import RichTextEditor from '@/components/rich-text';
import DeliveryTimeSelect from './delivery-time-select';

export type ComposerFocus = 'content' | 'images' | 'products' | 'pricing';

export type ComposerProps = {
  /** null = new post */
  post: Post | null;
  products: Product[];
  pickable: Product[];
  categories: string[];
  pricingGroups: PricingGroup[];
  currentUser?: User;
  money: (n: number) => string;
  initialFocus?: ComposerFocus;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
  onClose: () => void;
  onCreateProduct?: (draft: ProductDraft) => Promise<Product | null>;
  onCreateCustomerGroup?: (data: { code: string; name: string; discount_percent?: number }) => Promise<CustomerGroup | undefined>;
  /** 'page': full page at /newfeed/create; 'modal': popup (editing a post from the feed). */
  variant?: 'modal' | 'page';
};

const slug = (name: string) =>
  name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();

/** Composer popup (create & edit): Nội dung (trình soạn thảo) → Mặt hàng, giá & ảnh (ảnh gắn với mặt hàng). */
export default function PostComposer({
  post,
  products,
  pickable,
  categories,
  pricingGroups,
  currentUser,
  money,
  initialFocus = 'content',
  variant = 'modal',
  onSubmit,
  onClose,
  onCreateProduct,
  onCreateCustomerGroup,
}: ComposerProps) {
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [postType, setPostType] = useState(post?.post_type || 'DAILY_SPECIAL');
  const [delivery, setDelivery] = useState(post?.delivery_time_text ?? 'Giao trong ngày');
  const [audience, setAudience] = useState<PricingAudience>(() => audienceFromPost(post, pricingGroups));
  const [pricing, setPricing] = useState<PostPricing>(() => (post ? pricingFromPost(post, pricingGroups) : emptyPricing()));
  const [errors, setErrors] = useState<PricingErrors | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const sections = useRef<Record<ComposerFocus, HTMLElement | null>>({ content: null, images: null, products: null, pricing: null });

  useEffect(() => {
    const target = sections.current[initialFocus];
    if (target && initialFocus !== 'content') setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [initialFocus]);

  const isPage = variant === 'page';

  // Popup only: Escape closes; body does not scroll behind the popup
  useEffect(() => {
    if (isPage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !creatingProduct && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, creatingProduct, isPage]);

  const revalidate = (next: PostPricing, nextAudience = audience) => {
    if (errors) setErrors(validatePricing(next, products, pricingGroups, nextAudience));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (title.trim().length < 2) {
      setFormError('Nhập tiêu đề bài đăng (ít nhất 2 ký tự).');
      sections.current.content?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const v = validatePricing(pricing, products, pricingGroups, audience);
    setErrors(v);
    if (v.first) {
      setFormError(v.first);
      return;
    }
    setBusy(true);
    try {
      const ok = await onSubmit({
        title: title.trim(),
        content: content.trim(),
        post_type: postType,
        image_urls: Array.from(new Set(pricing.items
          .map(item => products.find(product => product.id === item.productId)?.image)
          .filter((image): image is string => Boolean(image)))).slice(0, 10).join(','),
        delivery_time_text: delivery.trim(),
        ...pricingPayload(pricing, pricingGroups, audience),
      });
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  };

  /** "+ Nhóm mới" inside the audience list: returns the new group's code. */
  const createGroup = async (name: string, percent: number) => {
    if (!onCreateCustomerGroup) return undefined;
    const created = await onCreateCustomerGroup({ code: slug(name) || `GRP_${Date.now().toString().slice(-4)}`, name, discount_percent: percent });
    return created?.code;
  };

  const field = 'w-full rounded-xl border border-[#d2ddd5] bg-white px-3 py-2.5 text-base focus:border-[#176b52] focus:outline-none sm:text-xs';

  return (
    <div
      className={isPage ? 'mx-auto w-full max-w-3xl' : 'fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4'}
      {...(isPage ? {} : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'composer-title' })}
    >
      <form
        onSubmit={submit}
        className={isPage
          ? 'flex w-full flex-col rounded-2xl border border-[#e3ece6] bg-[#f6f8f6] shadow-sm'
          : 'flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[#f6f8f6] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-2xl'}
      >
        <header className={`flex shrink-0 items-center justify-between gap-3 border-b border-[#e3ece6] bg-white px-4 py-3 sm:px-5 ${isPage ? 'rounded-t-2xl' : 'pt-[max(0.75rem,env(safe-area-inset-top))]'}`}>
          <div className="min-w-0">
            <h2 id="composer-title" className="text-base font-extrabold text-[#1a2d23]">{post ? 'Sửa bài đăng' : 'Tạo bài đăng'}</h2>
            <p className="truncate text-[11px] text-slate-500">{currentUser?.shop_name || currentUser?.full_name} · Nội dung → Mặt hàng và giá</p>
          </div>
          {isPage ? (
            <button type="button" onClick={onClose} className="shrink-0 rounded-xl border border-[#d2ddd5] bg-white px-3 py-1.5 text-xs font-bold text-[#176b52] hover:bg-[#eef7f1]">
              <FontAwesomeIcon icon={faArrowLeft} className="mr-1.5" />Bảng tin
            </button>
          ) : (
            <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </header>

        <div className={isPage ? 'space-y-3 p-3 sm:p-5' : 'min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-5'}>
          {/* 1. Nội dung & đối tượng */}
          <section ref={el => { sections.current.content = el; }} className="scroll-mt-3 space-y-3 rounded-2xl border border-[#e3ece6] bg-white p-3 sm:p-4">
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#1a2e24]"><FontAwesomeIcon icon={faPenToSquare} className="text-[#176b52]" /> Nội dung</h3>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Tiêu đề — VD: Rau cải kale Đà Lạt vừa thu hoạch sáng nay" aria-label="Tiêu đề bài đăng" className={`${field} font-semibold`} />
            <RichTextEditor
              value={content}
              onChange={setContent}
              label="Nội dung bài đăng"
              placeholder="Hôm nay vườn của bạn có nông sản gì mới thu hoạch? Độ tươi, nguồn gốc, cách bảo quản…"
            />
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Loại tin">
              {POST_TYPES.map(t => (
                <button key={t.value} type="button" role="radio" aria-checked={postType === t.value} onClick={() => setPostType(t.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${postType === t.value ? 'border-[#176b52] bg-[#176b52] text-white' : 'border-[#d8e3dc] bg-white text-[#3c5045] hover:border-[#176b52]/50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">Thời gian giao hàng</span>
              <DeliveryTimeSelect value={delivery} onChange={setDelivery} className={field} />
            </div>

          </section>

          {/* 2. Mặt hàng, giá & ảnh (ảnh gắn với mặt hàng) */}
          <div ref={el => { sections.current.products = el; sections.current.pricing = el; sections.current.images = el; }} className="scroll-mt-3">
            <PostPricingManager
              products={products}
              pickable={pickable}
              value={pricing}
              onChange={next => { setPricing(next); revalidate(next); }}
              groups={pricingGroups}
              audience={audience}
              onAudienceChange={next => { setAudience(next); revalidate(pricing, next); }}
              onCreateGroup={onCreateCustomerGroup ? createGroup : undefined}
              money={money}
              errors={errors}
              onCreateProduct={onCreateProduct ? () => setCreatingProduct(true) : undefined}
            >
            </PostPricingManager>
          </div>
        </div>

        <footer className={`shrink-0 border-t border-[#e3ece6] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 ${isPage ? 'sticky bottom-0 z-10 rounded-b-2xl' : ''}`}>
          {formError && <p role="alert" className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="submit" disabled={busy} className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50">
              {busy ? 'Đang lưu…' : post ? 'Lưu thay đổi' : 'Đăng bài'}
            </button>
          </div>
        </footer>
      </form>

      {creatingProduct && onCreateProduct && (
        <ProductEditorModal
          product={null}
          categories={categories}
          onClose={() => setCreatingProduct(false)}
          onSave={async draft => {
            const created = await onCreateProduct(draft);
            if (created) {
              setPricing(prev => ({ ...prev, items: [...prev.items, { productId: created.id, quantity: '', sold: 0, groupPrices: {}, listPrice: '' }] }));
              setCreatingProduct(false);
            }
            return Boolean(created);
          }}
        />
      )}
    </div>
  );
}
