'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBoxOpen,
  faCalendarAlt,
  faCheckCircle,
  faClock,
  faEdit,
  faFire,
  faImages,
  faLayerGroup,
  faPlus,
  faShoppingBasket,
  faStore,
  faTag,
  faTrash,
  faUserGroup,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Post, PostProductInfo, Product, User } from '@/types/domain';
import { productImage } from '@/components/product-photo';

interface GroupPricesState {
  STUDENT: string;
  WORKING: string;
  GROUP_A: string;
  GROUP_B: string;
  COLLECTIVE: string;
}

const defaultGroupPrices: GroupPricesState = {
  STUDENT: '42000',
  WORKING: '45000',
  GROUP_A: '40000',
  GROUP_B: '43000',
  COLLECTIVE: '38000',
};

const GROUP_LABELS: Record<keyof GroupPricesState, string> = {
  STUDENT: 'Sinh viên',
  WORKING: 'Người đi làm',
  GROUP_A: 'Nhóm cư dân A',
  GROUP_B: 'Hộ gia đình B',
  COLLECTIVE: 'Bếp ăn / Tập thể',
};

const SAMPLE_PRODUCE_IMAGES = [
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=900&q=80',
];

const serializeGroupPrices = (gps: GroupPricesState): string => {
  const obj: Record<string, number> = {};
  if (gps.STUDENT.trim()) obj.STUDENT = Number(gps.STUDENT);
  if (gps.WORKING.trim()) obj.WORKING = Number(gps.WORKING);
  if (gps.GROUP_A.trim()) obj.GROUP_A = Number(gps.GROUP_A);
  if (gps.GROUP_B.trim()) obj.GROUP_B = Number(gps.GROUP_B);
  if (gps.COLLECTIVE.trim()) obj.COLLECTIVE = Number(gps.COLLECTIVE);
  return JSON.stringify(obj);
};

const parseGroupPrices = (gpStr?: string): GroupPricesState => {
  let parsed: Record<string, any> = {};
  try {
    if (gpStr) parsed = JSON.parse(gpStr);
  } catch {
    parsed = {};
  }
  return {
    STUDENT: parsed.STUDENT !== undefined ? String(parsed.STUDENT) : '',
    WORKING: parsed.WORKING !== undefined ? String(parsed.WORKING) : '',
    GROUP_A: parsed.GROUP_A !== undefined ? String(parsed.GROUP_A) : '',
    GROUP_B: parsed.GROUP_B !== undefined ? String(parsed.GROUP_B) : '',
    COLLECTIVE: parsed.COLLECTIVE !== undefined ? String(parsed.COLLECTIVE) : '',
  };
};

const parseImageUrls = (raw?: string): string[] => {
  if (!raw) return [];
  return raw
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
};

interface InlineNewProductDraft {
  name: string;
  category_name: string;
  unit: string;
  base_price: number;
  initial_stock: number;
  description: string;
  image_url: string;
}

interface NewfeedProps {
  posts: Post[];
  products: Product[];
  categories?: string[];
  currentUser?: User;
  onAddToCart: (productId: number) => void;
  onCreatePost?: (postData: any) => Promise<void>;
  onUpdatePost?: (postId: number, postData: any) => Promise<void>;
  money: (n: number) => string;
  forceCreateMode?: boolean;
}

export default function Newfeed({
  posts,
  products,
  categories = ['Rau củ', 'Trái cây', 'Thực phẩm'],
  currentUser,
  onAddToCart,
  onCreatePost,
  onUpdatePost,
  money,
  forceCreateMode = false,
}: NewfeedProps) {
  const router = useRouter();
  const pathname = usePathname() || '/newfeed';
  const isCreatePage = forceCreateMode || pathname.endsWith('/newfeed/create');

  const [filterType, setFilterType] = useState<string>('ALL');
  const [submitting, setSubmitting] = useState(false);

  // Create Post Form State (used on /newfeed/create)
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    post_type: 'DAILY_SPECIAL',
    sale_price: 45000,
    original_price: 55000,
    delivery_time_text: 'Giao nhanh trong ngày (08:00 - 18:00)',
    target_audience: 'ALL',
    target_customer_group: 'STUDENT',
  });
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [imageList, setImageList] = useState<string[]>([SAMPLE_PRODUCE_IMAGES[0]]);
  const [imageInput, setImageInput] = useState('');
  const [autoAddToCatalog, setAutoAddToCatalog] = useState(true);
  const [inlineNewProducts, setInlineNewProducts] = useState<InlineNewProductDraft[]>([
    {
      name: '',
      category_name: categories[0] || 'Rau củ',
      unit: 'kg',
      base_price: 45000,
      initial_stock: 50,
      description: 'Nông sản tươi mới thu hoạch trong ngày',
      image_url: SAMPLE_PRODUCE_IMAGES[0],
    },
  ]);
  const [createGroupPrices, setCreateGroupPrices] = useState<GroupPricesState>(defaultGroupPrices);

  // Edit Post Modal State
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    content: string;
    post_type: string;
    product_id: number;
    product_ids: number[];
    image_urls: string;
    sale_price: number;
    delivery_time_text: string;
    target_audience: string;
    target_customer_group: string;
    group_prices: GroupPricesState;
  } | null>(null);

  const canPost = currentUser?.role === 'ADMIN' || currentUser?.role === 'SHOP';
  const availableShopProducts =
    currentUser?.role === 'SHOP'
      ? products.filter(p => !p.shop_id || p.shop_id === currentUser.id)
      : products;

  const toggleProductSelection = (id: number) => {
    setSelectedProductIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]));
  };

  const addImageToList = (url?: string) => {
    const clean = (url ?? imageInput).trim();
    if (!clean) return;
    setImageList(prev => (prev.includes(clean) ? prev : [...prev, clean]));
    if (!url) setImageInput('');
  };

  const removeImageFromList = (url: string) => {
    setImageList(prev => prev.filter(item => item !== url));
  };

  const addInlineNewProductRow = () => {
    setInlineNewProducts(prev => [
      ...prev,
      {
        name: '',
        category_name: categories[0] || 'Rau củ',
        unit: 'kg',
        base_price: Number(newPost.sale_price) || 45000,
        initial_stock: 30,
        description: 'Nông sản tươi mới thu hoạch trong ngày',
        image_url: imageList[0] || SAMPLE_PRODUCE_IMAGES[0],
      },
    ]);
  };

  const updateInlineNewProduct = (index: number, patch: Partial<InlineNewProductDraft>) => {
    setInlineNewProducts(prev => prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  };

  const removeInlineNewProduct = (index: number) => {
    setInlineNewProducts(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreatePost) return;
    setSubmitting(true);
    try {
      let validInlineProducts: InlineNewProductDraft[] = [];
      if (autoAddToCatalog) {
        validInlineProducts = inlineNewProducts
          .map((p, idx) => ({
            ...p,
            name: p.name.trim() || (idx === 0 ? newPost.title.trim() : ''),
            base_price: Number(p.base_price) || Number(newPost.sale_price) || 45000,
            initial_stock: Number(p.initial_stock) || 50,
            image_url: p.image_url || imageList[0] || SAMPLE_PRODUCE_IMAGES[0],
            description: p.description?.trim() || newPost.content.trim() || newPost.title.trim(),
          }))
          .filter(p => p.name.length >= 2);
      }

      await onCreatePost({
        title: newPost.title.trim(),
        content: newPost.content.trim(),
        post_type: newPost.post_type,
        product_id: selectedProductIds[0] || null,
        product_ids: selectedProductIds,
        new_products: validInlineProducts,
        image_urls: imageList.join(','),
        sale_price: Number(newPost.sale_price),
        delivery_time_text: newPost.delivery_time_text,
        target_audience: newPost.target_audience,
        target_customer_group:
          newPost.target_audience === 'ALL'
            ? null
            : newPost.target_audience === 'COLLECTIVE'
              ? 'COLLECTIVE'
              : newPost.target_customer_group,
        group_prices: serializeGroupPrices(createGroupPrices),
      });
      setInlineNewProducts([
        {
          name: '',
          category_name: categories[0] || 'Rau củ',
          unit: 'kg',
          base_price: 45000,
          initial_stock: 50,
          description: 'Nông sản tươi mới thu hoạch trong ngày',
          image_url: SAMPLE_PRODUCE_IMAGES[0],
        },
      ]);
      router.push('/newfeed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (post: Post) => {
    setEditingPost(post);
    setEditForm({
      title: post.title,
      content: post.content,
      post_type: post.post_type,
      product_id: post.product_id || products[0]?.id || 0,
      product_ids: post.product_ids && post.product_ids.length > 0 ? post.product_ids : post.product_id ? [post.product_id] : [],
      image_urls: post.image_urls || '',
      sale_price: post.sale_price ?? 50000,
      delivery_time_text: post.delivery_time_text || 'Giao trong ngày',
      target_audience: post.target_audience || 'ALL',
      target_customer_group: post.target_customer_group || 'STUDENT',
      group_prices: parseGroupPrices(post.group_prices),
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !editForm || !onUpdatePost) return;
    await onUpdatePost(editingPost.id, {
      title: editForm.title,
      content: editForm.content,
      post_type: editForm.post_type,
      product_id: editForm.product_ids[0] || editForm.product_id || null,
      product_ids: editForm.product_ids,
      image_urls: editForm.image_urls,
      sale_price: Number(editForm.sale_price),
      delivery_time_text: editForm.delivery_time_text,
      target_audience: editForm.target_audience,
      target_customer_group:
        editForm.target_audience === 'ALL'
          ? null
          : editForm.target_audience === 'COLLECTIVE'
            ? 'COLLECTIVE'
            : editForm.target_customer_group,
      group_prices: serializeGroupPrices(editForm.group_prices),
    });
    setEditingPost(null);
    setEditForm(null);
  };

  // ============================================================================
  // DEDICATED PAGE: /newfeed/create (Tạo bài đăng mới & Thêm sản phẩm vào kho)
  // ============================================================================
  if (isCreatePage) {
    const baseRefPrice = Math.max(Number(newPost.original_price) || 0, Number(newPost.sale_price) || 0, 1000);

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e3ece6] bg-white p-5 shadow-sm">
          <div>
            <button
              type="button"
              onClick={() => router.push('/newfeed')}
              className="mb-2 inline-flex items-center gap-2 text-xs font-bold text-[#176b52] hover:underline"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Quay lại Bảng tin Newfeed
            </button>
            <h2 className="text-xl font-extrabold text-[#1a2e24]">
              Tạo bài đăng Newfeed & Lên kệ Nông sản mới
            </h2>
            <p className="mt-0.5 text-xs text-[#6e8075]">
              Đăng nhiều hình ảnh, chọn nhiều sản phẩm có sẵn hoặc thêm trực tiếp mặt hàng mới vào kho cùng bảng giá khuyến mãi theo từng nhóm khách hàng.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateSubmit} className="space-y-6">
          {/* 1. Nội dung bài đăng & Đối tượng khách hàng */}
          <section className="rounded-2xl border border-[#e3ece6] bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-[#1a2e24] border-b border-[#edf2ee] pb-2.5">
              1. Nội dung bài viết & Nhóm khách hàng mục tiêu
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#3d5045]">Tiêu đề bài đăng *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Tổng hợp rau củ hữu cơ Đà Lạt & Trái cây tươi vừa cập bến sáng nay!"
                  value={newPost.title}
                  onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-3 text-xs font-semibold focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Phân loại tin đăng</label>
                <select
                  value={newPost.post_type}
                  onChange={e => setNewPost({ ...newPost, post_type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                >
                  <option value="DAILY_SPECIAL">⚡ Món ngon / Nông sản mới trong ngày</option>
                  <option value="PROMOTION">🔥 Chương trình Khuyến mãi theo nhóm</option>
                  <option value="PRODUCT_INTRO">🌱 Giới thiệu mặt hàng mới nhập kho</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Khung giờ giao hàng dự kiến</label>
                <input
                  type="text"
                  value={newPost.delivery_time_text}
                  onChange={e => setNewPost({ ...newPost, delivery_time_text: e.target.value })}
                  placeholder="Ví dụ: Giao khung 11h30 trưa & 17h30 chiều nay"
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Đối tượng khách hàng được mua</label>
                <select
                  value={newPost.target_audience}
                  onChange={e => setNewPost({ ...newPost, target_audience: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                >
                  <option value="ALL">Công khai — Tất cả nhóm khách hàng</option>
                  <option value="GROUP">Ưu đãi riêng cho một nhóm khách hàng</option>
                  <option value="COLLECTIVE">Dành riêng cho Bếp ăn / Tập thể</option>
                </select>
              </div>

              {newPost.target_audience === 'GROUP' && (
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Chọn nhóm khách hàng ưu tiên</label>
                  <select
                    value={newPost.target_customer_group}
                    onChange={e => setNewPost({ ...newPost, target_customer_group: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="STUDENT">Sinh viên (STUDENT)</option>
                    <option value="WORKING">Người đi làm (WORKING)</option>
                    <option value="GROUP_A">Nhóm cư dân A (GROUP_A)</option>
                    <option value="GROUP_B">Hộ gia đình B (GROUP_B)</option>
                    <option value="COLLECTIVE">Tập thể (COLLECTIVE)</option>
                  </select>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-[#3d5045]">Nội dung chi tiết bài đăng *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Chia sẻ câu chuyện thu hoạch sáng nay, độ tươi ngon, cam kết VietGAP và ưu đãi cho các nhóm khách hàng..."
                  value={newPost.content}
                  onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-3 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* 2. Bộ sưu tập Nhiều Ảnh bài đăng */}
          <section className="rounded-2xl border border-[#e3ece6] bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#edf2ee] pb-2.5">
              <div>
                <h3 className="text-sm font-extrabold text-[#1a2e24] flex items-center gap-2">
                  <FontAwesomeIcon icon={faImages} className="text-[#176b52]" />
                  2. Hình ảnh bài đăng (Hỗ trợ đăng nhiều ảnh như Facebook)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Thêm nhiều link ảnh nông sản thực tế để hiển thị dạng lưới ảnh (Album) trên Bảng tin.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-[#176b52]">
                Đã chọn {imageList.length} ảnh
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={imageInput}
                onChange={e => setImageInput(e.target.value)}
                placeholder="Dán URL hình ảnh nông sản (https://...) rồi bấm Thêm ảnh"
                className="flex-1 rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => addImageToList()}
                className="rounded-xl bg-[#176b52] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#125340]"
              >
                + Thêm ảnh vào bài
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400 font-semibold">Ảnh mẫu nhanh:</span>
              {SAMPLE_PRODUCE_IMAGES.map((sampleUrl, idx) => (
                <button
                  key={sampleUrl}
                  type="button"
                  onClick={() => addImageToList(sampleUrl)}
                  className="rounded-lg border border-[#d2ddd5] bg-[#f8faf8] px-2.5 py-1 font-semibold text-[#176b52] hover:bg-emerald-50"
                >
                  + Ảnh nông sản #{idx + 1}
                </button>
              ))}
            </div>

            {imageList.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {imageList.map((imgUrl, idx) => (
                  <div key={imgUrl + idx} className="group relative aspect-video overflow-hidden rounded-xl border border-[#e3ece6] bg-slate-100">
                    <img src={imgUrl} alt={`Ảnh ${idx + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImageFromList(imgUrl)}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white text-xs hover:bg-rose-600"
                      title="Xóa ảnh này"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. Tự động thêm mặt hàng mới vào Danh sách Mặt hàng & Kho hàng HOẶC chọn thêm sản phẩm sẵn có */}
          <section className="rounded-2xl border border-[#e3ece6] bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf2ee] pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#1a2e24] flex items-center gap-2">
                  <FontAwesomeIcon icon={faBoxOpen} className="text-[#176b52]" />
                  3. Đồng bộ lên Danh sách Mặt hàng & Kho hàng (Tự động lên kệ)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Mặc định khi đăng bài Newfeed mới, mặt hàng sẽ được tự động tạo và hiển thị ngay trong Danh sách Mặt hàng & Tồn kho.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAutoAddToCatalog(true);
                  addInlineNewProductRow();
                }}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600"
              >
                <FontAwesomeIcon icon={faPlus} />
                + Thêm nhiều mặt hàng mới
              </button>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs font-bold text-[#176b52]">
              <input
                type="checkbox"
                checked={autoAddToCatalog}
                onChange={e => setAutoAddToCatalog(e.target.checked)}
                className="h-4 w-4 accent-[#176b52]"
              />
              <span>Tự động đăng thành mặt hàng mới bên Danh sách Mặt hàng (Cửa hàng nông sản & Kho hàng)</span>
            </label>

            {/* Khung thêm mặt hàng mới trực tiếp vào kho khi đăng bài */}
            {autoAddToCatalog && inlineNewProducts.length > 0 && (
              <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="text-xs font-extrabold text-amber-900">
                  Thông tin mặt hàng sẽ tự động xuất hiện bên Danh sách Mặt hàng ngay khi đăng bài ({inlineNewProducts.length} mặt hàng):
                </div>
                {inlineNewProducts.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-3 rounded-xl border border-amber-200 bg-white p-3.5 text-xs sm:grid-cols-6"
                  >
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-600">
                        Tên mặt hàng {idx === 0 ? '(để trống = lấy theo Tiêu đề bài đăng)' : '*'}
                      </label>
                      <input
                        type="text"
                        required={idx > 0}
                        placeholder={idx === 0 && newPost.title.trim() ? newPost.title.trim() : 'VD: Dâu tây giống Nhật hộp 500g'}
                        value={item.name}
                        onChange={e => updateInlineNewProduct(idx, { name: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#d2ddd5] p-2 text-xs focus:border-[#176b52] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Danh mục</label>
                      <select
                        value={item.category_name}
                        onChange={e => updateInlineNewProduct(idx, { category_name: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Đơn vị tính</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={e => updateInlineNewProduct(idx, { unit: e.target.value })}
                        placeholder="kg, bó, hộp..."
                        className="mt-1 w-full rounded-lg border border-[#d2ddd5] p-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600">Giá gốc (₫)</label>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={item.base_price}
                        onChange={e => updateInlineNewProduct(idx, { base_price: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-[#d2ddd5] p-2 text-xs font-bold text-[#176b52]"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] font-bold text-slate-600">Nhập kho</label>
                        <input
                          type="number"
                          min={1}
                          value={item.initial_stock}
                          onChange={e => updateInlineNewProduct(idx, { initial_stock: Number(e.target.value) })}
                          className="mt-1 w-full rounded-lg border border-[#d2ddd5] p-2 text-xs font-bold"
                        />
                      </div>
                      {inlineNewProducts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInlineNewProduct(idx)}
                          className="mb-0.5 rounded-lg bg-rose-50 p-2 text-rose-600 hover:bg-rose-100"
                          title="Xóa mặt hàng này"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Danh sách chọn nhiều sản phẩm có sẵn (tùy chọn đính kèm thêm) */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Hoặc đính kèm thêm sản phẩm đã có sẵn trong cửa hàng ({selectedProductIds.length} đã chọn):
                </span>
              </div>
              <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3">
                {availableShopProducts.map(prod => {
                  const checked = selectedProductIds.includes(prod.id);
                  return (
                    <label
                      key={prod.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 text-xs transition ${
                        checked
                          ? 'border-[#176b52] bg-[#eef7f1] font-bold text-[#176b52]'
                          : 'border-[#e3ece6] bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProductSelection(prod.id)}
                        className="accent-[#176b52]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{prod.name}</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {money(prod.price)}/{prod.unit} · Tồn: {prod.available}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 4. Hiệu ứng Giá gốc - Giá khuyến mãi theo từng nhóm khách hàng */}
          <section className="rounded-2xl border border-[#e3ece6] bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-extrabold text-[#1a2e24] border-b border-[#edf2ee] pb-2.5">
              4. Bảng giá gốc & Hiệu ứng giảm giá theo từng nhóm khách hàng
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-bold text-slate-600">Giá niêm yết gốc (₫) — Hiển thị gạch ngang</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={newPost.original_price}
                  onChange={e => setNewPost({ ...newPost, original_price: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs text-slate-500 line-through focus:border-[#176b52] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[#176b52]">Giá khuyến mãi chung trên bài đăng (₫)</label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={newPost.sale_price}
                  onChange={e => setNewPost({ ...newPost, sale_price: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-[#176b52] bg-[#f4faf6] p-2.5 text-xs font-extrabold text-[#176b52] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
              {(Object.keys(GROUP_LABELS) as Array<keyof GroupPricesState>).map(groupKey => {
                const groupVal = Number(createGroupPrices[groupKey]) || Number(newPost.sale_price) || 0;
                const discountPct =
                  baseRefPrice > groupVal ? Math.round(((baseRefPrice - groupVal) / baseRefPrice) * 100) : 0;
                return (
                  <div key={groupKey} className="rounded-xl border border-[#d8e6dd] bg-[#f8fbf9] p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-[#2d4236]">{GROUP_LABELS[groupKey]}</label>
                      {discountPct > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                          -{discountPct}%
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step={1000}
                      value={createGroupPrices[groupKey]}
                      onChange={e => setCreateGroupPrices({ ...createGroupPrices, [groupKey]: e.target.value })}
                      className="mt-1.5 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs font-bold text-[#176b52]"
                    />
                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
                      <span className="text-slate-400 line-through">{money(baseRefPrice)}</span>
                      <span className="font-extrabold text-rose-600">{money(groupVal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/newfeed')}
              className="rounded-xl border border-[#d2ddd5] bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[#176b52] px-6 py-2.5 text-xs font-extrabold text-white shadow-lg hover:bg-[#125340] disabled:opacity-50"
            >
              {submitting ? 'Đang đăng bài & đồng bộ kho…' : 'Đăng bài lên Bảng tin ngay'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================================
  // FACEBOOK-STYLE SOCIAL FEED VIEW (/newfeed)
  // ============================================================================
  const filteredPosts = posts.filter(post => {
    if (filterType === 'ALL') return true;
    return post.post_type === filterType;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Facebook-style "Bạn đang nghĩ gì / Đăng nông sản mới" Composer Box */}
      {canPost && (
        <div className="rounded-2xl border border-[#e3ece6] bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#176b52] text-sm font-extrabold text-white shadow-sm">
              <FontAwesomeIcon icon={faStore} />
            </div>
            <button
              type="button"
              onClick={() => router.push('/newfeed/create')}
              className="flex-1 rounded-full bg-[#f2f6f3] px-4 py-3 text-left text-xs font-medium text-[#5f7267] transition hover:bg-[#e6efe9]"
            >
              Hôm nay {currentUser?.shop_name || currentUser?.full_name || 'Cửa hàng'} có nông sản gì tươi mới? Bấm để tạo bài đăng nhiều ảnh & sản phẩm...
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f4f1] pt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push('/newfeed/create')}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
              >
                <FontAwesomeIcon icon={faImages} className="text-emerald-600" />
                <span>Nhiều ảnh nông sản</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/newfeed/create')}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50"
              >
                <FontAwesomeIcon icon={faBoxOpen} className="text-amber-600" />
                <span>+ Thêm mặt hàng mới vào kho</span>
              </button>
              <button
                type="button"
                onClick={() => router.push('/newfeed/create')}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                <FontAwesomeIcon icon={faTag} className="text-rose-500" />
                <span>Giảm giá theo nhóm</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => router.push('/newfeed/create')}
              className="flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#125340]"
            >
              <FontAwesomeIcon icon={faPlus} />
              Đăng bài mới
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#e8ede8] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'Tất cả bảng tin', icon: faFire },
            { id: 'DAILY_SPECIAL', label: 'Món ngon hôm nay', icon: faClock },
            { id: 'PROMOTION', label: 'Ưu đãi theo nhóm', icon: faTag },
            { id: 'PRODUCT_INTRO', label: 'Nông sản mới lên kệ', icon: faLayerGroup },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                filterType === tab.id
                  ? 'bg-[#176b52] text-white shadow-sm'
                  : 'bg-[#f4f7f4] text-[#55695e] hover:bg-[#e9f0e9]'
              }`}
            >
              <FontAwesomeIcon icon={tab.icon} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Facebook-style Single Column Stream */}
      <div className="space-y-5">
        {filteredPosts.map(post => {
          let parsedGroupPrices: Record<string, number> = {};
          try {
            if (post.group_prices) {
              parsedGroupPrices = JSON.parse(post.group_prices);
            }
          } catch {
            parsedGroupPrices = {};
          }

          const attachedProducts: PostProductInfo[] =
            post.products_info && post.products_info.length > 0
              ? post.products_info
              : post.product_id
                ? (() => {
                    const p = products.find(item => item.id === post.product_id);
                    return p
                      ? [
                          {
                            id: p.id,
                            name: p.name,
                            unit: p.unit,
                            base_price: p.price,
                            effective_price: post.effective_price ?? post.sale_price ?? p.price,
                            available_quantity: p.available,
                            image_url: p.image,
                          },
                        ]
                      : [];
                  })()
                : [];

          const primaryProduct = products.find(p => p.id === post.product_id);
          const displayPrice = post.effective_price ?? post.sale_price ?? primaryProduct?.price ?? 0;
          const rawOriginalPrice =
            post.original_price ??
            primaryProduct?.price ??
            (displayPrice > 0 ? Math.round(displayPrice * 1.18) : 0);
          const originalPrice = rawOriginalPrice > displayPrice ? rawOriginalPrice : Math.round(displayPrice * 1.15);
          const discountPercent =
            originalPrice > displayPrice && displayPrice > 0
              ? Math.round(((originalPrice - displayPrice) / originalPrice) * 100)
              : 0;

          const userGroup = currentUser?.customer_group || 'STUDENT';
          const customerView = currentUser?.role === 'CUSTOMER';
          const isAuthor =
            currentUser?.role === 'ADMIN' ||
            (currentUser?.role === 'SHOP' && post.author_id === currentUser.id);

          const images = parseImageUrls(post.image_urls);
          const displayImages =
            images.length > 0
              ? images
              : [productImage({ name: post.title, image: post.image_urls })];

          return (
            <article
              key={post.id}
              className="overflow-hidden rounded-2xl border border-[#e2ebe5] bg-white shadow-sm transition hover:shadow-md"
            >
              {/* Facebook Post Author Header */}
              <div className="flex items-start justify-between gap-3 p-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#176b52] to-[#289672] text-white shadow-sm">
                    <FontAwesomeIcon icon={faStore} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-extrabold text-[#1a2d23]">
                        {post.shop_name || post.author_name || 'Nông Trại Xanh FreshFlow'}
                      </span>
                      <FontAwesomeIcon icon={faCheckCircle} className="text-xs text-emerald-600" title="Cửa hàng xác thực" />
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          post.post_type === 'DAILY_SPECIAL'
                            ? 'bg-amber-100 text-amber-800'
                            : post.post_type === 'PROMOTION'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {post.post_type === 'DAILY_SPECIAL'
                          ? '⚡ Món ngon trong ngày'
                          : post.post_type === 'PROMOTION'
                            ? '🔥 Khuyến mãi nhóm'
                            : '🌱 Mặt hàng mới'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#7c8d83]">
                      <span>
                        {new Intl.DateTimeFormat('vi-VN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(post.created_at))}
                      </span>
                      <span>·</span>
                      <span className="font-semibold text-[#176b52]">
                        {post.target_audience === 'ALL'
                          ? '🌐 Mọi nhóm khách hàng'
                          : `👥 Nhóm ưu tiên: ${post.target_customer_group || post.target_audience}`}
                      </span>
                      {post.delivery_time_text && (
                        <>
                          <span>·</span>
                          <span>
                            <FontAwesomeIcon icon={faClock} className="mr-1" />
                            {post.delivery_time_text}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {isAuthor && onUpdatePost && (
                  <button
                    onClick={() => handleOpenEdit(post)}
                    className="rounded-xl border border-[#d8e3dc] bg-white px-3 py-1.5 text-xs font-bold text-[#176b52] hover:bg-[#eef7f1]"
                  >
                    <FontAwesomeIcon icon={faEdit} className="mr-1" />
                    Sửa bài & giá
                  </button>
                )}
              </div>

              {/* Post Text Body */}
              <div className="px-4 pb-3">
                <h2 className="text-base font-extrabold text-[#182920]">{post.title}</h2>
                <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-[#3f5247]">
                  {post.content}
                </p>
              </div>

              {/* Multi-Image Grid (Facebook Album Style) */}
              {displayImages.length === 1 ? (
                <div className="relative max-h-[420px] w-full overflow-hidden bg-[#f0f4f1]">
                  <img
                    src={displayImages[0]}
                    alt={post.title}
                    className="max-h-[420px] w-full object-cover"
                  />
                  {discountPercent > 0 && (
                    <div className="absolute right-3 top-3 rounded-full bg-rose-600 px-3 py-1 text-xs font-extrabold text-white shadow-lg animate-pulse">
                      Giảm tới -{discountPercent}%
                    </div>
                  )}
                </div>
              ) : (
                <div className={`grid gap-1 bg-[#e8eee9] ${displayImages.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                  {displayImages.slice(0, 6).map((imgUrl, idx) => (
                    <div key={idx} className="relative aspect-video overflow-hidden bg-slate-100">
                      <img src={imgUrl} alt={`${post.title} ${idx + 1}`} className="h-full w-full object-cover" />
                      {idx === 0 && discountPercent > 0 && (
                        <div className="absolute left-2 top-2 rounded-full bg-rose-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow">
                          Ưu đãi -{discountPercent}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Attached Multi-Products Section */}
              {attachedProducts.length > 0 && (
                <div className="border-t border-[#edf2ee] bg-[#fbfdfb] p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-[#1e2e26]">
                      🛒 Nông sản mở bán trong bài đăng ({attachedProducts.length} mặt hàng):
                    </span>
                    <span className="text-[11px] text-slate-400">Bấm chọn mua trực tiếp từng món</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {attachedProducts.map(prod => {
                      const prodOrig = Math.max(prod.base_price || 0, Math.round((prod.effective_price || 0) * 1.15));
                      const prodSale = prod.effective_price || prod.base_price || displayPrice;
                      const prodDisc =
                        prodOrig > prodSale && prodSale > 0
                          ? Math.round(((prodOrig - prodSale) / prodOrig) * 100)
                          : 0;
                      return (
                        <div
                          key={prod.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-[#dfeae3] bg-white p-3 shadow-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs font-extrabold text-[#1a2e24]">{prod.name}</span>
                              {prodDisc > 0 && (
                                <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-extrabold text-rose-700">
                                  -{prodDisc}%
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs">
                              {prodOrig > prodSale && (
                                <span className="text-[11px] text-slate-400 line-through">{money(prodOrig)}</span>
                              )}
                              <span className="font-extrabold text-rose-600">{money(prodSale)}</span>
                              <span className="text-[10px] text-slate-400">/ {prod.unit}</span>
                            </div>
                            <div className="mt-0.5 text-[10px] text-emerald-700 font-semibold">
                              Sẵn có trong kho: {prod.available_quantity} {prod.unit}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddToCart(prod.id)}
                            className="shrink-0 rounded-xl bg-[#176b52] px-3 py-2 text-[11px] font-bold text-white shadow-sm hover:bg-[#125340] active:scale-95"
                          >
                            <FontAwesomeIcon icon={faShoppingBasket} className="mr-1" />
                            Thêm giỏ
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Group Discount Pricing Visual Effect Section */}
              <div className="border-t border-[#edf2ee] bg-[#f7faf8] p-4">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 font-extrabold text-[#1e3328]">
                    <FontAwesomeIcon icon={faUserGroup} className="text-[#176b52]" />
                    Bảng giá gốc & Khuyến mãi theo từng nhóm khách hàng:
                  </span>
                  {customerView && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-[#176b52]">
                      Nhóm của bạn: {GROUP_LABELS[userGroup as keyof GroupPricesState] || userGroup}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {(Object.entries(GROUP_LABELS) as Array<[keyof GroupPricesState, string]>).map(([groupKey, label]) => {
                    const groupPromo = parsedGroupPrices[groupKey] ?? post.sale_price ?? displayPrice;
                    const groupOrig = Math.max(originalPrice, Math.round(groupPromo * 1.15));
                    const pct =
                      groupOrig > groupPromo && groupPromo > 0
                        ? Math.round(((groupOrig - groupPromo) / groupOrig) * 100)
                        : 0;
                    const isMyGroup = customerView && userGroup === groupKey;

                    return (
                      <div
                        key={groupKey}
                        className={`relative rounded-xl border p-2.5 transition ${
                          isMyGroup
                            ? 'border-2 border-[#176b52] bg-emerald-50/90 shadow-sm'
                            : 'border-[#e3ece6] bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-bold text-[#52655a]">{label}</span>
                          {pct > 0 && (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-extrabold text-white">
                              -{pct}%
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-400 line-through">{money(groupOrig)}</div>
                        <div className="text-xs font-extrabold text-[#176b52]">{money(groupPromo)}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Facebook-style Action Footer */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6efe9] pt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-slate-500">Giá ưu đãi hôm nay:</span>
                    {originalPrice > displayPrice && (
                      <span className="text-xs text-slate-400 line-through">{money(originalPrice)}</span>
                    )}
                    <span className="text-lg font-extrabold text-rose-600">{money(displayPrice)}</span>
                    {discountPercent > 0 && (
                      <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-700">
                        Tiết kiệm {discountPercent}%
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {post.product_id && (
                      <button
                        type="button"
                        onClick={() => onAddToCart(post.product_id!)}
                        className="flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow transition hover:bg-[#135843] active:scale-95"
                      >
                        <FontAwesomeIcon icon={faShoppingBasket} />
                        Đặt mua ngay
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {filteredPosts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#d8e0d8] bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f2f7f4] text-xl text-[#7a8c80]">
            <FontAwesomeIcon icon={faCalendarAlt} />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#1c2c23]">Chưa có bài đăng nào trong mục này</h3>
          <p className="mt-1 text-xs text-[#7e8f84]">Hãy quay lại sau hoặc chọn phân loại tin khác.</p>
        </div>
      )}

      {/* Modal Chỉnh Sửa Bài Đăng & Giá Bán */}
      {editingPost && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8ede8] pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#1a2d23]">Chỉnh sửa bài đăng & Giá bán</h3>
                <p className="mt-0.5 text-xs text-[#7b8b80]">
                  Cập nhật thông tin bài viết, nhiều hình ảnh và bảng giá khuyến mãi theo từng nhóm khách hàng.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPost(null);
                  setEditForm(null);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#3d5045]">Tiêu đề bài đăng</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Danh sách URL hình ảnh (cách nhau dấu phẩy)</label>
                <input
                  type="text"
                  value={editForm.image_urls}
                  onChange={e => setEditForm({ ...editForm, image_urls: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Nội dung mô tả</label>
                <textarea
                  rows={3}
                  required
                  value={editForm.content}
                  onChange={e => setEditForm({ ...editForm, content: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Giá bán cơ bản (₫)</label>
                  <input
                    type="number"
                    value={editForm.sale_price}
                    onChange={e => setEditForm({ ...editForm, sale_price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Thời gian giao hàng</label>
                  <input
                    type="text"
                    value={editForm.delivery_time_text}
                    onChange={e => setEditForm({ ...editForm, delivery_time_text: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#e2ece5] bg-[#f8faf9] p-4">
                <div className="mb-2 text-xs font-bold text-[#203227]">
                  Chính sách giá khuyến mãi theo từng nhóm khách hàng (₫)
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(Object.keys(GROUP_LABELS) as Array<keyof GroupPricesState>).map(groupKey => (
                    <div key={groupKey}>
                      <label className="text-[11px] font-semibold text-[#44564c]">{GROUP_LABELS[groupKey]}</label>
                      <input
                        type="number"
                        value={editForm.group_prices[groupKey]}
                        onChange={e =>
                          setEditForm({
                            ...editForm,
                            group_prices: { ...editForm.group_prices, [groupKey]: e.target.value },
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPost(null);
                    setEditForm(null);
                  }}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
