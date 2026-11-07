'use client';

import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBox,
  faBoxesStacked,
  faCheck,
  faClipboardList,
  faCommentDots,
  faEdit,
  faMotorcycle,
  faPlus,
  faReply,
  faShoppingBag,
  faStar,
  faStore,
  faTruck,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import type { Order, Product, ProductReview, User } from '@/types/domain';
import ProductPhoto from '@/components/product-photo';

interface ShopPortalViewProps {
  currentUser: User;
  products: Product[];
  orders: Order[];
  reviews: ProductReview[];
  shippers: User[];
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onUpdateOrderStatus: (orderId: string, status: string, note?: string) => Promise<boolean>;
  onAssignShipper: (orderApiId: number, shipperId: number) => Promise<void>;
  onReplyReview: (reviewId: number, reply: string) => Promise<void>;
  onAdjustInventory: (productId: number, delta: number) => Promise<boolean>;
  initialTab?: 'overview' | 'products' | 'orders' | 'reviews';
  money: (n: number) => string;
}

export default function ShopPortalView({
  currentUser,
  products,
  orders,
  reviews,
  shippers,
  onAddProduct,
  onEditProduct,
  onUpdateOrderStatus,
  onAssignShipper,
  onReplyReview,
  onAdjustInventory,
  initialTab = 'overview',
  money,
}: ShopPortalViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'orders' | 'reviews'>(initialTab);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [assigningOrderId, setAssigningOrderId] = useState<number | null>(null);
  const [selectedShipperId, setSelectedShipperId] = useState<number>(shippers[0]?.id || 0);
  useEffect(() => setActiveTab(initialTab), [initialTab]);
  useEffect(() => {
    if (shippers.length && !shippers.some(shipper => shipper.id === selectedShipperId)) setSelectedShipperId(shippers[0].id);
  }, [shippers, selectedShipperId]);

  // Shop filtered data
  const shopProducts = products.filter(p => !p.shop_id || p.shop_id === currentUser.id);
  const shopOrders = orders.filter(o => !o.shop_id || o.shop_id === currentUser.id);
  const completedOrders = shopOrders.filter(o => o.status === 'Hoàn thành' || o.status === 'COMPLETED');
  const totalShopRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  const handleReplySubmit = async (reviewId: number) => {
    const text = replyText[reviewId]?.trim();
    if (!text) return;
    await onReplyReview(reviewId, text);
    setReplyText(prev => ({ ...prev, [reviewId]: '' }));
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningOrderId || !selectedShipperId) return;
    await onAssignShipper(assigningOrderId, selectedShipperId);
    setAssigningOrderId(null);
  };

  return (
    <div className="space-y-6">
      {/* Shop Profile Banner */}
      <div className="rounded-2xl border border-[#e8ede8] bg-gradient-to-r from-[#176b52] to-[#2b8268] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-2xl text-white backdrop-blur">
              <FontAwesomeIcon icon={faStore} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold">{currentUser.shop_name || currentUser.full_name}</h2>
              <p className="mt-0.5 text-xs text-white/80">
                {currentUser.shop_description || 'Cửa hàng nông sản FreshFlow'}
              </p>
              <div className="mt-1 text-[11px] text-white/70">
                Địa chỉ: {currentUser.shop_address || 'Chưa cập nhật'} · Hotline: {currentUser.phone || 'Chưa cập nhật'}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onAddProduct}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#176b52] shadow transition hover:bg-slate-100"
            >
              <FontAwesomeIcon icon={faPlus} />
              Thêm sản phẩm mới
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/20 pt-4 text-xs font-semibold">
          {[
            { id: 'overview', label: 'Tổng quan cửa hàng', count: undefined },
            { id: 'products', label: 'Gian hàng sản phẩm', count: shopProducts.length },
            { id: 'orders', label: 'Đơn hàng phát sinh', count: shopOrders.length },
            { id: 'reviews', label: 'Đánh giá & Phản hồi', count: reviews.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-xl px-4 py-2 transition ${
                activeTab === tab.id
                  ? 'bg-white font-bold text-[#176b52] shadow'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm">
              <div className="text-[11px] font-semibold text-[#839288]">Doanh thu đã nhận</div>
              <div className="mt-2 text-xl font-extrabold text-[#176b52]">{money(totalShopRevenue)}</div>
            </div>
            <div className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm">
              <div className="text-[11px] font-semibold text-[#839288]">Đơn cần chuẩn bị</div>
              <div className="mt-2 text-xl font-extrabold text-amber-600">
                {shopOrders.filter(o => ['Chờ xác nhận', 'Chờ duyệt', 'PENDING', 'Đã xác nhận', 'Đang chuẩn bị', 'PREPARING'].includes(o.status)).length}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm">
              <div className="text-[11px] font-semibold text-[#839288]">Sản phẩm đang bán</div>
              <div className="mt-2 text-xl font-extrabold text-[#1f2d25]">{shopProducts.length}</div>
            </div>
            <div className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm">
              <div className="text-[11px] font-semibold text-[#839288]">Đánh giá từ khách</div>
              <div className="mt-2 text-xl font-extrabold text-yellow-500">
                {reviews.length > 0 ? `${(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)} ★` : 'Chưa có đánh giá'}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-bold text-[#1e2d25]">Đánh giá mới nhất</h3><button onClick={() => setActiveTab('reviews')} className="text-xs font-bold text-[#176b52]">Xem tất cả</button></div>
            {reviews.slice(0, 3).map(review => <article key={review.id} className="border-t py-3 first:border-0"><div className="flex items-center justify-between text-xs"><b>{review.user_name || 'Khách hàng'}</b><span className="text-amber-500">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div><p className="mt-1 text-xs text-slate-600">{review.comment || 'Khách hàng đã gửi đánh giá.'}</p></article>)}
            {reviews.length === 0 && <p className="text-xs text-slate-500">Chưa có đánh giá mới. Đánh giá của khách sẽ được đồng bộ tại đây.</p>}
          </div>
        </div>
      )}

      {/* Tab Content: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-[#1e2d25]">Danh sách sản phẩm của Shop</h3>
            <button
              onClick={onAddProduct}
              className="rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
              Thêm mặt hàng
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {shopProducts.map(product => (
              <div
                key={product.id}
                className="overflow-hidden rounded-2xl border border-[#e8ede8] bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="aspect-video w-full overflow-hidden bg-slate-100">
                  <ProductPhoto product={product} className="h-full w-full object-cover" />
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-[#1f2d25]">{product.name}</h4>
                      <span className="text-[10px] text-[#7d8f85]">{product.category} · {product.unit}</span>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-[#176b52]">
                      {money(product.price)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-[#526359] border-t border-[#f0f4f1] pt-2">
                    <span className="flex items-center gap-2">Tồn kho: <b>{product.available}</b> {product.unit}<button aria-label={`Giảm tồn kho ${product.name}`} onClick={() => void onAdjustInventory(product.id, -1)} className="rounded border px-2">−</button><button aria-label={`Tăng tồn kho ${product.name}`} onClick={() => void onAdjustInventory(product.id, 1)} className="rounded border px-2">+</button></span>
                    <button
                      onClick={() => onEditProduct(product)}
                      className="text-xs font-bold text-[#176b52] hover:underline"
                    >
                      <FontAwesomeIcon icon={faEdit} className="mr-1" />
                      Chỉnh sửa
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {shopProducts.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Shop chưa có mặt hàng. Hãy thêm mặt hàng đầu tiên.</div>}
          </div>
        </div>
      )}

      {/* Tab Content: ORDERS */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1e2d25]">Đơn hàng khách đặt tại Shop</h3>
          <div className="space-y-3">
            {shopOrders.map(order => (
              <div
                key={order.id}
                className="flex flex-col justify-between rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm md:flex-row md:items-center gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1f2d25]">{order.id}</span>
                    <span className="rounded-full bg-[#f0f5f2] px-2.5 py-0.5 text-[10px] font-bold text-[#176b52]">
                      {order.status}
                    </span>
                  </div>
                  <div className="text-xs text-[#627369]">
                    Khách hàng: <b>{order.customer}</b> · Tổng tiền: <b className="text-[#176b52]">{money(order.total)}</b>
                  </div>
                  <div className="text-[11px] text-[#86968d]">
                    Giao tới: {order.delivery_address || order.delivery}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {['Chờ xác nhận', 'Chờ duyệt', 'PENDING'].includes(order.status) && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'Đã xác nhận', 'Shop đã nhận đơn và chuẩn bị hàng')}
                      className="rounded-xl bg-[#176b52] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                    >
                      Xác nhận đơn
                    </button>
                  )}

                  {['Đã xác nhận', 'CONFIRMED', 'APPROVED'].includes(order.status) && (
                    <button
                      onClick={() => onUpdateOrderStatus(order.id, 'Đang chuẩn bị', 'Shop đang đóng gói hàng')}
                      className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700"
                    >
                      Chuẩn bị hàng
                    </button>
                  )}

                  {(order.status === 'Đang chuẩn bị' || order.status === 'PREPARING') && (
                    <button
                      onClick={() => setAssigningOrderId(order.apiId || null)}
                      className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-amber-600"
                    >
                      <FontAwesomeIcon icon={faMotorcycle} />
                      Gọi Shipper lấy hàng
                    </button>
                  )}
                </div>
              </div>
            ))}
            {shopOrders.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Chưa có đơn hàng phát sinh.</div>}
          </div>
        </div>
      )}

      {/* Tab Content: REVIEWS */}
      {activeTab === 'reviews' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1e2d25]">Đánh giá từ khách hàng & Phản hồi của Shop</h3>
          <div className="space-y-4">
            {reviews.map(rev => (
              <div key={rev.id} className="rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-[#1e2d25]">{rev.user_name || 'Khách hàng FreshFlow'}</div>
                    <div className="text-yellow-500 text-xs">
                      {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                    </div>
                  </div>
                  <span className="text-[10px] text-[#86968d]">
                    {new Date(rev.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                <p className="text-xs text-[#4c5e53] bg-[#f9faf9] p-3 rounded-xl border border-[#edf2ee]">
                  "{rev.comment}"
                </p>

                {rev.shop_reply ? (
                  <div className="ml-4 rounded-xl border-l-4 border-[#176b52] bg-[#f2f8f4] p-3 text-xs text-[#1e3d2e]">
                    <div className="font-bold">Phản hồi của Shop:</div>
                    <div className="mt-1">{rev.shop_reply}</div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Viết câu trả lời cảm ơn hoặc hỗ trợ khách hàng..."
                      value={replyText[rev.id] || ''}
                      onChange={e => setReplyText({ ...replyText, [rev.id]: e.target.value })}
                      className="flex-1 rounded-xl border border-[#d2ddd5] p-2 text-xs focus:border-[#176b52] focus:outline-none"
                    />
                    <button
                      onClick={() => handleReplySubmit(rev.id)}
                      className="flex items-center gap-1.5 rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                    >
                      <FontAwesomeIcon icon={faReply} />
                      Gửi trả lời
                    </button>
                  </div>
                )}
              </div>
            ))}
            {reviews.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-slate-500">Chưa có đánh giá. Khi khách hàng đánh giá sản phẩm của Shop, nội dung sẽ xuất hiện tại đây.</div>}
          </div>
        </div>
      )}

      {/* Modal Phân công Shipper */}
      {assigningOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1a2d24]">Chọn Shipper giao đơn hàng</h3>
            <p className="mt-1 text-xs text-[#7e8f85]">Hệ thống sẽ gửi thông báo và đơn hàng cho Shipper được chọn.</p>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#3d5045]">Danh sách Shipper sẵn sàng</label>
                <select
                  value={selectedShipperId}
                  onChange={e => setSelectedShipperId(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                >
                  {shippers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.vehicle_info || 'Xe máy'}) - {s.phone || 'Sẵn sàng'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningOrderId(null)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                >
                  Xác nhận giao Shipper
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
