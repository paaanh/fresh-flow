'use client';

import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarAlt,
  faClock,
  faEdit,
  faFire,
  faLayerGroup,
  faPlus,
  faShoppingBasket,
  faStore,
  faTag,
  faUserGroup,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Post, Product, User } from '@/types/domain';
import { productImage } from '@/components/product-photo';

interface GroupPricesState {
  STUDENT: string;
  WORKING: string;
  GROUP_A: string;
  GROUP_B: string;
  COLLECTIVE: string;
}

const defaultGroupPrices: GroupPricesState = {
  STUDENT: '45000',
  WORKING: '48000',
  GROUP_A: '42000',
  GROUP_B: '44000',
  COLLECTIVE: '40000',
};

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

interface NewfeedProps {
  posts: Post[];
  products: Product[];
  currentUser?: User;
  onAddToCart: (productId: number) => void;
  onCreatePost?: (postData: any) => Promise<void>;
  onUpdatePost?: (postId: number, postData: any) => Promise<void>;
  money: (n: number) => string;
}

export default function Newfeed({
  posts,
  products,
  currentUser,
  onAddToCart,
  onCreatePost,
  onUpdatePost,
  money,
}: NewfeedProps) {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    post_type: 'DAILY_SPECIAL',
    product_id: products[0]?.id || 0,
    sale_price: 50000,
    delivery_time_text: 'Giao trong ngày',
    target_audience: 'ALL',
    target_customer_group: 'STUDENT',
  });
  const [createGroupPrices, setCreateGroupPrices] = useState<GroupPricesState>(defaultGroupPrices);

  // Edit Post State
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editForm, setEditForm] = useState<{
    title: string;
    content: string;
    post_type: string;
    product_id: number;
    sale_price: number;
    delivery_time_text: string;
    target_audience: string;
    target_customer_group: string;
    group_prices: GroupPricesState;
  } | null>(null);

  const canPost = currentUser?.role === 'ADMIN' || currentUser?.role === 'SHOP';

  useEffect(() => {
    if (products.length && !products.some(product => product.id === newPost.product_id)) {
      setNewPost(current => ({ ...current, product_id: products[0].id }));
    }
  }, [products, newPost.product_id]);

  const filteredPosts = posts.filter(post => {
    if (filterType === 'ALL') return true;
    return post.post_type === filterType;
  });

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreatePost) return;
    await onCreatePost({
      ...newPost,
      target_customer_group:
        newPost.target_audience === 'ALL'
          ? null
          : newPost.target_audience === 'COLLECTIVE'
          ? 'COLLECTIVE'
          : newPost.target_customer_group,
      group_prices: serializeGroupPrices(createGroupPrices),
    });
    setShowCreateModal(false);
    setNewPost({
      title: '',
      content: '',
      post_type: 'DAILY_SPECIAL',
      product_id: products[0]?.id || 0,
      sale_price: 50000,
      delivery_time_text: 'Giao trong ngày',
      target_audience: 'ALL',
      target_customer_group: 'STUDENT',
    });
    setCreateGroupPrices(defaultGroupPrices);
  };

  const handleOpenEdit = (post: Post) => {
    setEditingPost(post);
    setEditForm({
      title: post.title,
      content: post.content,
      post_type: post.post_type,
      product_id: post.product_id || products[0]?.id || 0,
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
      product_id: editForm.product_id || null,
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

  return (
    <div className="space-y-6">
      {/* Feed Filter & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'ALL', label: 'Tất cả tin mới', icon: faFire },
            { id: 'DAILY_SPECIAL', label: 'Món ngon trong ngày', icon: faClock },
            { id: 'PROMOTION', label: 'Khuyến mãi đặc biệt', icon: faTag },
            { id: 'PRODUCT_INTRO', label: 'Giới thiệu sản phẩm', icon: faLayerGroup },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
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

        {canPost && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-[#125340]"
          >
            <FontAwesomeIcon icon={faPlus} />
            Đăng bài mới
          </button>
        )}
      </div>

      {/* Feed List */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {filteredPosts.map(post => {
          let parsedGroupPrices: Record<string, number> = {};
          try {
            if (post.group_prices) {
              parsedGroupPrices = JSON.parse(post.group_prices);
            }
          } catch {
            parsedGroupPrices = {};
          }

          const matchedProduct = products.find(p => p.id === post.product_id);
          const displayPrice = post.effective_price ?? post.sale_price ?? matchedProduct?.price ?? 0;
          const userGroup = currentUser?.customer_group || 'INDIVIDUAL';
          const hasGroupDiscount = parsedGroupPrices[userGroup] !== undefined;
          const customerView = currentUser?.role === 'CUSTOMER';
          const isAuthor =
            currentUser?.role === 'ADMIN' ||
            (currentUser?.role === 'SHOP' && (post.author_id === currentUser.id || !post.author_id));

          return (
            <article
              key={post.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-[#e8ede8] bg-white shadow-sm transition hover:shadow-md"
            >
              {/* Header */}
              <div className="p-5 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf4ee] font-bold text-[#176b52]">
                      <FontAwesomeIcon icon={faStore} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#1e2a24]">
                        {post.shop_name || post.author_name || 'FreshFlow Shop'}
                      </div>
                      <div className="text-[11px] text-[#839188]">
                        {new Intl.DateTimeFormat('vi-VN', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }).format(new Date(post.created_at))}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                      post.post_type === 'DAILY_SPECIAL'
                        ? 'bg-amber-100 text-amber-800'
                        : post.post_type === 'PROMOTION'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {post.post_type === 'DAILY_SPECIAL'
                      ? '⚡ Món hôm nay'
                      : post.post_type === 'PROMOTION'
                      ? 'Ưu đãi hot'
                      : 'Giới thiệu'}
                  </span>
                </div>

                {/* Title & Content */}
                <h2 className="mt-3 text-base font-extrabold text-[#1a2e24] line-clamp-2">
                  {post.title}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[#4e6256] line-clamp-3">
                  {post.content}
                </p>
              </div>

              {/* Image banner */}
              {post.image_urls && (
                <div className="relative aspect-video w-full overflow-hidden bg-[#f0f4f1]">
                  <img
                    src={productImage({ name: post.title, image: post.image_urls })}
                    alt={post.title}
                    className="h-full w-full object-cover transition duration-300 hover:scale-105"
                  />
                  {post.delivery_time_text && (
                    <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
                      <FontAwesomeIcon icon={faClock} className="mr-1.5" />
                      {post.delivery_time_text}
                    </div>
                  )}
                </div>
              )}

              {/* Group Pricing Section */}
              <div className="border-t border-[#f0f4f1] bg-[#f9faf9] p-4">
                {!customerView && (
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#6d7e74]">
                    <span className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faUserGroup} className="text-[#176b52]" />
                      Chính sách giá theo nhóm:
                    </span>
                    {hasGroupDiscount && (
                      <span className="rounded bg-[#e3f4e8] px-2 py-0.5 text-[10px] font-bold text-[#176b52]">
                        Áp dụng giá nhóm bạn: {userGroup}
                      </span>
                    )}
                  </div>
                )}

                {customerView ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
                    <span className="text-slate-600">Giá dành cho nhóm của bạn · {userGroup}</span>
                    <strong className="ml-2 text-[#176b52]">{money(displayPrice)}</strong>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3 md:grid-cols-6">
                    <div className="rounded-lg bg-white p-2 border border-[#e8ede8]">
                      <div className="text-[10px] text-[#86968c]">Cá nhân</div>
                      <div className="font-bold text-[#1f2d25]">{money(post.sale_price || 0)}</div>
                    </div>
                    {Object.entries({
                      STUDENT: 'Sinh viên',
                      WORKING: 'Người đi làm',
                      GROUP_A: 'Nhóm A',
                      GROUP_B: 'Nhóm B',
                      COLLECTIVE: 'Tập thể',
                    }).map(([group, label]) => (
                      <div key={group} className="rounded-lg border border-[#e8ede8] bg-white p-2">
                        <div className="text-[10px] text-[#86968c]">{label}</div>
                        <div className="font-bold text-[#176b52]">
                          {money(parsedGroupPrices[group] ?? post.sale_price ?? 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer action */}
                <div className="mt-4 flex items-center justify-between gap-3 pt-2">
                  <div>
                    <div className="text-[10px] font-medium text-[#7d8f84]">
                      {customerView ? 'Giá áp dụng cho bạn:' : 'Giá bán cơ bản:'}
                    </div>
                    <div className="text-lg font-extrabold text-[#176b52]">
                      {money(customerView ? displayPrice : (post.sale_price || displayPrice))}
                    </div>
                  </div>

                  {customerView ? (
                    post.product_id && (
                      <button
                        onClick={() => onAddToCart(post.product_id!)}
                        className="flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-[#135843] active:scale-95"
                      >
                        <FontAwesomeIcon icon={faShoppingBasket} />
                        Đặt hàng ngay
                      </button>
                    )
                  ) : (
                    isAuthor && onUpdatePost && (
                      <button
                        onClick={() => handleOpenEdit(post)}
                        className="flex items-center gap-1.5 rounded-xl bg-[#176b52] px-3.5 py-2 text-xs font-bold text-white shadow transition hover:bg-[#125340]"
                      >
                        <FontAwesomeIcon icon={faEdit} className="text-xs" />
                        Chỉnh sửa bài & giá
                      </button>
                    )
                  )}
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

      {/* Modal Đăng Bài Mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e8ede8] pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#1a2d23]">Tạo bài đăng quảng bá mới</h3>
                <p className="mt-0.5 text-xs text-[#7b8b80]">
                  Chia sẻ món ăn, sản phẩm tươi trong ngày và cấu hình giá ưu đãi theo nhóm khách hàng.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#3d5045]">Tiêu đề bài đăng</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Đợt Bơ sáp 034 Đắk Lắk vừa hái sáng nay"
                  value={newPost.title}
                  onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Phân loại bài đăng</label>
                  <select
                    value={newPost.post_type}
                    onChange={e => setNewPost({ ...newPost, post_type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="DAILY_SPECIAL">Món/Sản phẩm trong ngày</option>
                    <option value="PROMOTION">Chương trình khuyến mãi</option>
                    <option value="PRODUCT_INTRO">Giới thiệu sản phẩm mới</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Sản phẩm liên kết</label>
                  <select
                    value={newPost.product_id}
                    onChange={e => setNewPost({ ...newPost, product_id: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({money(p.price)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-[#3d5045]">
                  Đối tượng xem bài
                  <select
                    value={newPost.target_audience}
                    onChange={e => setNewPost({ ...newPost, target_audience: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs"
                  >
                    <option value="ALL">Tất cả khách hàng</option>
                    <option value="GROUP">Một nhóm khách hàng</option>
                    <option value="COLLECTIVE">Khách tập thể</option>
                  </select>
                </label>
                {newPost.target_audience === 'GROUP' && (
                  <label className="text-xs font-bold text-[#3d5045]">
                    Nhóm khách hàng
                    <select
                      value={newPost.target_customer_group}
                      onChange={e => setNewPost({ ...newPost, target_customer_group: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs"
                    >
                      <option value="STUDENT">Sinh viên</option>
                      <option value="WORKING">Người đi làm</option>
                      <option value="GROUP_A">Nhóm A</option>
                      <option value="GROUP_B">Nhóm B</option>
                      <option value="COLLECTIVE">Tập thể</option>
                    </select>
                  </label>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Nội dung mô tả</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Mô tả độ tươi ngon, nguồn gốc xuất xứ, lưu ý khi thưởng thức..."
                  value={newPost.content}
                  onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Giá bán cơ bản (₫)</label>
                  <input
                    type="number"
                    value={newPost.sale_price}
                    onChange={e => setNewPost({ ...newPost, sale_price: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Thời gian giao hàng</label>
                  <input
                    type="text"
                    value={newPost.delivery_time_text}
                    onChange={e => setNewPost({ ...newPost, delivery_time_text: e.target.value })}
                    placeholder="Ví dụ: Giao 11h - 12h trưa nay"
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </div>
              </div>

              {/* Nhập giá theo nhóm - Thay thế JSON bằng form nhập tiện lợi */}
              <div className="rounded-xl border border-[#e2ece5] bg-[#f8faf9] p-4">
                <div className="mb-2">
                  <div className="text-xs font-bold text-[#203227]">
                    Chính sách giá theo từng nhóm khách hàng (₫)
                  </div>
                  <div className="text-[11px] text-[#78897f]">
                    Nhập giá ưu đãi cụ thể cho từng đối tượng (để trống nếu áp dụng giá cơ bản)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Sinh viên (STUDENT)</label>
                    <input
                      type="number"
                      placeholder="45000"
                      value={createGroupPrices.STUDENT}
                      onChange={e =>
                        setCreateGroupPrices({ ...createGroupPrices, STUDENT: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Người đi làm (WORKING)</label>
                    <input
                      type="number"
                      placeholder="48000"
                      value={createGroupPrices.WORKING}
                      onChange={e =>
                        setCreateGroupPrices({ ...createGroupPrices, WORKING: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Nhóm A (GROUP_A)</label>
                    <input
                      type="number"
                      placeholder="42000"
                      value={createGroupPrices.GROUP_A}
                      onChange={e =>
                        setCreateGroupPrices({ ...createGroupPrices, GROUP_A: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Nhóm B (GROUP_B)</label>
                    <input
                      type="number"
                      placeholder="44000"
                      value={createGroupPrices.GROUP_B}
                      onChange={e =>
                        setCreateGroupPrices({ ...createGroupPrices, GROUP_B: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Tập thể (COLLECTIVE)</label>
                    <input
                      type="number"
                      placeholder="40000"
                      value={createGroupPrices.COLLECTIVE}
                      onChange={e =>
                        setCreateGroupPrices({ ...createGroupPrices, COLLECTIVE: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64] hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                >
                  Đăng ngay
                </button>
              </div>
            </form>
          </div>
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
                  Cập nhật thông tin bài viết, giá bán cơ bản và bảng giá theo từng nhóm khách hàng.
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Phân loại bài đăng</label>
                  <select
                    value={editForm.post_type}
                    onChange={e => setEditForm({ ...editForm, post_type: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    <option value="DAILY_SPECIAL">Món/Sản phẩm trong ngày</option>
                    <option value="PROMOTION">Chương trình khuyến mãi</option>
                    <option value="PRODUCT_INTRO">Giới thiệu sản phẩm mới</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#3d5045]">Sản phẩm liên kết</label>
                  <select
                    value={editForm.product_id}
                    onChange={e => setEditForm({ ...editForm, product_id: Number(e.target.value) })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({money(p.price)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-[#3d5045]">
                  Đối tượng xem bài
                  <select
                    value={editForm.target_audience}
                    onChange={e => setEditForm({ ...editForm, target_audience: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs"
                  >
                    <option value="ALL">Tất cả khách hàng</option>
                    <option value="GROUP">Một nhóm khách hàng</option>
                    <option value="COLLECTIVE">Khách tập thể</option>
                  </select>
                </label>
                {editForm.target_audience === 'GROUP' && (
                  <label className="text-xs font-bold text-[#3d5045]">
                    Nhóm khách hàng
                    <select
                      value={editForm.target_customer_group}
                      onChange={e => setEditForm({ ...editForm, target_customer_group: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs"
                    >
                      <option value="STUDENT">Sinh viên</option>
                      <option value="WORKING">Người đi làm</option>
                      <option value="GROUP_A">Nhóm A</option>
                      <option value="GROUP_B">Nhóm B</option>
                      <option value="COLLECTIVE">Tập thể</option>
                    </select>
                  </label>
                )}
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
                    placeholder="Ví dụ: Giao 11h - 12h trưa nay"
                    className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                  />
                </div>
              </div>

              {/* Nhập giá theo nhóm - Không dùng JSON */}
              <div className="rounded-xl border border-[#e2ece5] bg-[#f8faf9] p-4">
                <div className="mb-2">
                  <div className="text-xs font-bold text-[#203227]">
                    Chính sách giá theo từng nhóm khách hàng (₫)
                  </div>
                  <div className="text-[11px] text-[#78897f]">
                    Nhập giá ưu đãi cụ thể cho từng đối tượng (để trống nếu áp dụng giá cơ bản)
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Sinh viên (STUDENT)</label>
                    <input
                      type="number"
                      placeholder="45000"
                      value={editForm.group_prices.STUDENT}
                      onChange={e =>
                        setEditForm({
                          ...editForm,
                          group_prices: { ...editForm.group_prices, STUDENT: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Người đi làm (WORKING)</label>
                    <input
                      type="number"
                      placeholder="48000"
                      value={editForm.group_prices.WORKING}
                      onChange={e =>
                        setEditForm({
                          ...editForm,
                          group_prices: { ...editForm.group_prices, WORKING: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Nhóm A (GROUP_A)</label>
                    <input
                      type="number"
                      placeholder="42000"
                      value={editForm.group_prices.GROUP_A}
                      onChange={e =>
                        setEditForm({
                          ...editForm,
                          group_prices: { ...editForm.group_prices, GROUP_A: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Nhóm B (GROUP_B)</label>
                    <input
                      type="number"
                      placeholder="44000"
                      value={editForm.group_prices.GROUP_B}
                      onChange={e =>
                        setEditForm({
                          ...editForm,
                          group_prices: { ...editForm.group_prices, GROUP_B: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#44564c]">Tập thể (COLLECTIVE)</label>
                    <input
                      type="number"
                      placeholder="40000"
                      value={editForm.group_prices.COLLECTIVE}
                      onChange={e =>
                        setEditForm({
                          ...editForm,
                          group_prices: { ...editForm.group_prices, COLLECTIVE: e.target.value },
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-[#d2ddd5] bg-white p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPost(null);
                    setEditForm(null);
                  }}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64] hover:bg-slate-50"
                >
                  Hủy bỏ
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
