'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClockRotateLeft, faEllipsis, faMotorcycle, faPhone, faReply, faStar } from '@fortawesome/free-solid-svg-icons';
import OrderItems from '@/components/order-items';
import OrderStatusControl, { type UpdateOrderStatus } from '@/components/order-status-control';
import { Badge } from './shared-ui';
import { freshflow } from '@/lib/api';
import { getOrderVisualMeta, sortOrdersByPriority } from '@/features/customer/page-model';
import type { Order } from '@/types/domain';

const statusViMap: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  APPROVED: 'Đã xác nhận',
  PREPARING: 'Đang chuẩn bị',
  READY_FOR_PICKUP: 'Chờ Shipper lấy hàng',
  PICKED_UP: 'Shipper đã lấy hàng',
  DELIVERING: 'Đang giao',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Từ chối',
  CANCELLED: 'Đã hủy',
};

export function OrderDetailView({
  order,
  statusTone,
  money,
  go,
  admin,
  shop = false,
  updateStatus,
  notify,
}: {
  order: Order;
  statusTone: (status: string) => string;
  money: (value: number) => string;
  go: (path: string) => void;
  admin: boolean;
  shop?: boolean;
  updateStatus: UpdateOrderStatus;
  notify?: (msg: string) => void;
}) {
  const milestones = ['Chờ xác nhận', 'Đang chuẩn bị', 'Đang giao', 'Hoàn thành'];
  const active =
    order.status === 'Chờ duyệt' || order.status === 'Chờ xác nhận'
      ? 0
      : order.status === 'Đã duyệt' || order.status === 'Đã xác nhận'
        ? 0
        : order.status === 'Đang chuẩn bị' ||
            order.status === 'Chờ Shipper lấy hàng' ||
            order.status === 'Shipper đã lấy hàng'
          ? 1
          : order.status === 'Đang giao'
            ? 2
            : order.status === 'Hoàn thành'
              ? 3
              : -1;

  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [productReviews, setProductReviews] = useState<any[]>([]);
  const [shipperReviews, setShipperReviews] = useState<any[]>([]);
  const [ratingDraft, setRatingDraft] = useState<Record<number, number>>({});
  const [commentDraft, setCommentDraft] = useState<Record<number, string>>({});
  const [shipperRating, setShipperRating] = useState(5);
  const [shipperComment, setShipperComment] = useState('');
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const loadOrderExtras = () => {
    if (!order.apiId) return;
    freshflow
      .orderHistory<any>(order.apiId)
      .then(list => setHistoryLogs(list || []))
      .catch(() => {});
    freshflow
      .orderReviews<{ product_reviews: any[]; shipper_reviews: any[] }>(order.apiId)
      .then(res => {
        setProductReviews(res?.product_reviews || []);
        setShipperReviews(res?.shipper_reviews || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadOrderExtras();
  }, [order.apiId, order.status, order.shipper_id, order.shipper_name, order.payment_status, order.paid_amount]);

  const handleProductReviewSubmit = async (productId: number) => {
    if (!order.apiId || !productId) return;
    setSubmitting(true);
    try {
      await freshflow.createProductReview(productId, {
        order_id: order.apiId,
        rating: ratingDraft[productId] || 5,
        comment: (commentDraft[productId] || '').trim() || 'Sản phẩm tươi ngon, đóng gói cẩn thận!',
        images: '',
      });
      setCommentDraft(prev => ({ ...prev, [productId]: '' }));
      loadOrderExtras();
      notify?.('Đã gửi đánh giá sản phẩm thành công!');
    } catch (err: any) {
      notify?.(err?.message || 'Không thể gửi đánh giá sản phẩm.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShipperReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order.apiId) return;
    setSubmitting(true);
    try {
      await freshflow.reviewShipper(order.apiId, {
        rating: shipperRating,
        attitude_rating: shipperRating,
        speed_rating: shipperRating,
        comment: shipperComment.trim() || 'Tài xế giao hàng đúng giờ, nhiệt tình!',
      });
      setShipperComment('');
      loadOrderExtras();
      notify?.('Đã gửi đánh giá Shipper thành công!');
    } catch (err: any) {
      notify?.(err?.message || 'Không thể gửi đánh giá Shipper.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyReview = async (reviewId: number) => {
    const text = (replyDraft[reviewId] || '').trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await freshflow.replyReview(reviewId, text);
      setReplyDraft(prev => ({ ...prev, [reviewId]: '' }));
      loadOrderExtras();
      notify?.('Đã gửi phản hồi đánh giá của Shop!');
    } catch (err: any) {
      notify?.(err?.message || 'Không thể gửi phản hồi.');
    } finally {
      setSubmitting(false);
    }
  };

  const canCustomerCancel = !admin && !shop && (order.status === 'Chờ xác nhận' || order.status === 'Chờ duyệt');

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <section className="panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">MÃ ĐƠN HÀNG</p>
              <h2 className="mt-1 text-xl font-extrabold">{order.id}</h2>
              <p className="mt-1 text-xs text-slate-500">Đặt lúc {order.date}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={statusTone(order.status)}>{order.status}</Badge>
              {canCustomerCancel && (
                <button
                  type="button"
                  onClick={() => void updateStatus(order.id, 'Đã hủy', 'Khách hàng hủy đơn khi chờ xác nhận')}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
                >
                  Hủy đơn hàng
                </button>
              )}
            </div>
          </div>

          {(admin || shop) && (
            <div className="mt-4">
              <OrderStatusControl id={order.id} status={order.status} updateStatus={updateStatus} />
            </div>
          )}

          <div className="mt-7 grid gap-4 sm:grid-cols-4">
            {milestones.map((step, index) => (
              <div key={step} className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    index <= active ? 'bg-[#176b52] text-white' : 'bg-white text-slate-400'
                  }`}
                >
                  {index < active ? '✓' : index + 1}
                </span>
                <span className={`text-[10px] ${index <= active ? 'font-bold text-[#315d40]' : 'text-slate-400'}`}>
                  {step}
                </span>
              </div>
            ))}
          </div>
          {(order.status === 'Từ chối' || order.status === 'Đã hủy') && (
            <div className="mt-5 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
              Đơn hàng đang ở trạng thái <b>{order.status}</b>. Liên hệ cửa hàng qua Tin nhắn nếu cần hỗ trợ thêm.
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h3 className="font-bold">Sản phẩm trong đơn</h3>
          <OrderItems lines={order.lines} money={money} />
          <div className="mt-4 flex justify-between text-xs text-slate-500">
            <span>Phương thức giao hàng</span>
            <span className="font-semibold text-slate-700">{order.delivery}</span>
          </div>
          {order.delivery_address && (
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>Địa chỉ nhận</span>
              <span className="font-semibold text-slate-700">{order.delivery_address}</span>
            </div>
          )}
        </section>

        {/* THÔNG TIN TÀI XẾ (SHIPPER) PHỤ TRÁCH ĐƠN HÀNG */}
        {(order.shipper_id || order.shipper_name || order.delivery !== 'Điểm giao tập trung') && (
          <section className="panel p-5 border border-blue-200 bg-blue-50/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
                  <FontAwesomeIcon icon={faMotorcycle} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#1a2e24]">
                    Thông tin Tài xế (Shipper) phụ trách đơn hàng
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {order.shipper_id || order.shipper_name
                      ? 'Shipper đã nhận đơn — Người nhận và Shop có thể theo dõi chi tiết bên dưới'
                      : 'Đơn hàng giao tận nơi — Đang chờ chỉ định hoặc chờ Shipper nhận đơn'}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                  getOrderVisualMeta(order.status).badge
                }`}
              >
                {order.status}
              </span>
            </div>

            {order.shipper_id || order.shipper_name ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs">
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Họ tên Shipper</div>
                  <div className="mt-1 font-extrabold text-[#1e2d25]">
                    {order.shipper_name || `Shipper #${order.shipper_id}`}
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Số điện thoại & Phương tiện</div>
                  <div className="mt-1 font-bold text-blue-700 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faPhone} className="text-[10px]" />
                    <span>{order.shipper_phone || '0900000003'}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {order.shipper_vehicle || 'Xe máy giao hàng chuyên dụng'}
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white p-3">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Số tiền thu hộ (COD) / Thanh toán</div>
                  <div className="mt-1 font-extrabold text-[#176b52]">{money(order.total)}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {order.status === 'Hoàn thành' ? 'Đã giao & đối soát thành công' : 'Thanh toán khi nhận hàng'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs text-slate-600">
                Ngay khi Shipper bấm <b>Nhận đơn</b> hoặc được Cửa hàng phân công, tên tài xế, số điện thoại liên hệ và biển số xe sẽ hiển thị trực tiếp tại đây cho khách hàng.
              </div>
            )}
          </section>
        )}

        {/* ĐÁNH GIÁ ĐƠN HÀNG & PHẢN HỒI CỦA SHOP (Khi đơn hàng đã hoàn thành) */}
        {order.status === 'Hoàn thành' && (
          <section className="panel p-5 space-y-4 border border-emerald-200 bg-[#f9fcfa]">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#1a2e24] flex items-center gap-2">
                  <FontAwesomeIcon icon={faStar} className="text-amber-500" />
                  Đánh giá đơn hàng & Phản hồi từ Cửa hàng (Shop)
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Xem đánh giá sản phẩm, phản hồi trực tiếp từ Shop và đánh giá chất lượng giao hàng của Shipper.
                </p>
              </div>
            </div>

            {/* Danh sách từng mặt hàng để đánh giá & xem phản hồi của Shop */}
            <div className="space-y-3">
              {(order.lines || []).map((line, idx) => {
                const productId = Number(line.productId || 0);
                const existingReview = productReviews.find(r => Number(r.product_id) === productId);
                return (
                  <div key={idx} className="rounded-xl border border-[#e3ece6] bg-white p-4 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-[#1e2d25]">{line.name}</span>
                        <span className="ml-2 text-slate-400">({line.quantity} {line.unit})</span>
                      </div>
                      {existingReview && (
                        <span className="font-bold text-amber-500">
                          {'★'.repeat(existingReview.rating)}{'☆'.repeat(5 - existingReview.rating)} ({existingReview.rating}/5)
                        </span>
                      )}
                    </div>

                    {existingReview ? (
                      <div className="space-y-2">
                        <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
                          <div className="text-[10px] font-bold text-slate-400 mb-0.5">
                            Đánh giá của khách hàng ({new Date(existingReview.created_at).toLocaleDateString('vi-VN')}):
                          </div>
                          <div>&ldquo;{existingReview.comment || 'Sản phẩm chất lượng tốt!'}&rdquo;</div>
                        </div>

                        {existingReview.shop_reply ? (
                          <div className="ml-3 rounded-lg border-l-4 border-[#176b52] bg-[#eef7f1] p-3 text-[#174d3b]">
                            <div className="font-bold text-[11px]">Phản hồi từ Cửa hàng (Shop):</div>
                            <div className="mt-1">{existingReview.shop_reply}</div>
                          </div>
                        ) : (admin || shop) ? (
                          <div className="flex gap-2 pt-1">
                            <input
                              value={replyDraft[existingReview.id] || ''}
                              onChange={e => setReplyDraft(prev => ({ ...prev, [existingReview.id]: e.target.value }))}
                              placeholder="Nhập phản hồi của Shop cho đánh giá này..."
                              className="flex-1 rounded-xl border border-[#d2ddd5] px-3 py-1.5 text-xs focus:border-[#176b52] focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => void handleReplyReview(existingReview.id)}
                              className="rounded-xl bg-[#176b52] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#125340]"
                            >
                              <FontAwesomeIcon icon={faReply} className="mr-1" /> Phản hồi
                            </button>
                          </div>
                        ) : (
                          <div className="text-[11px] italic text-slate-400">
                            Cửa hàng đã nhận được đánh giá và sẽ phản hồi sớm.
                          </div>
                        )}
                      </div>
                    ) : !admin && !shop && productId > 0 ? (
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600 font-semibold">Chọn số sao:</span>
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRatingDraft(prev => ({ ...prev, [productId]: star }))}
                              className={`text-base ${(ratingDraft[productId] || 5) >= star ? 'text-amber-400' : 'text-slate-300'}`}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <input
                            value={commentDraft[productId] || ''}
                            onChange={e => setCommentDraft(prev => ({ ...prev, [productId]: e.target.value }))}
                            placeholder="Chia sẻ cảm nhận của bạn về độ tươi ngon, đóng gói..."
                            className="flex-1 rounded-xl border border-[#d2ddd5] px-3 py-2 text-xs focus:border-[#176b52] focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleProductReviewSubmit(productId)}
                            className="rounded-xl bg-[#176b52] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#125340] disabled:opacity-50"
                          >
                            Gửi đánh giá
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400">Chưa có đánh giá cho sản phẩm này.</div>
                    )}
                  </div>
                );
              })}

              {/* Fallback nếu có productReviews không nằm trong lines */}
              {productReviews
                .filter(r => !(order.lines || []).some(line => Number(line.productId) === Number(r.product_id)))
                .map(rev => (
                  <div key={rev.id} className="rounded-xl border border-[#e3ece6] bg-white p-4 space-y-2 text-xs">
                    <div className="flex justify-between font-bold">
                      <span>{rev.product_name || `Sản phẩm #${rev.product_id}`}</span>
                      <span className="text-amber-500">{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</span>
                    </div>
                    <p className="text-slate-600">&ldquo;{rev.comment}&rdquo;</p>
                    {rev.shop_reply && (
                      <div className="ml-3 rounded-lg border-l-4 border-[#176b52] bg-[#eef7f1] p-3 text-[#174d3b]">
                        <div className="font-bold text-[11px]">Phản hồi từ Cửa hàng (Shop):</div>
                        <div className="mt-1">{rev.shop_reply}</div>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {/* Đánh giá Shipper */}
            {order.shipper_id && (
              <div className="rounded-xl border border-blue-100 bg-white p-4 space-y-2 text-xs">
                <div className="font-bold text-[#1e2d25]">Đánh giá dịch vụ giao hàng (Shipper)</div>
                {shipperReviews.length > 0 ? (
                  shipperReviews.map((sr: any) => (
                    <div key={sr.id} className="space-y-1">
                      <div className="text-amber-500 font-bold">
                        {'★'.repeat(sr.rating)}{'☆'.repeat(5 - sr.rating)} ({sr.rating}/5)
                      </div>
                      <p className="text-slate-600">&ldquo;{sr.comment}&rdquo;</p>
                    </div>
                  ))
                ) : !admin && !shop ? (
                  <form onSubmit={handleShipperReviewSubmit} className="space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-semibold">Chất lượng giao hàng:</span>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setShipperRating(star)}
                          className={`text-base ${shipperRating >= star ? 'text-amber-400' : 'text-slate-300'}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={shipperComment}
                        onChange={e => setShipperComment(e.target.value)}
                        placeholder="Nhận xét thái độ và tốc độ giao hàng của Shipper..."
                        className="flex-1 rounded-xl border border-[#d2ddd5] px-3 py-2 text-xs focus:border-[#176b52] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
                      >
                        Đánh giá Shipper
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="text-slate-400">Khách hàng chưa gửi đánh giá Shipper.</p>
                )}
              </div>
            )}
          </section>
        )}

        {/* LỊCH SỬ TRẠNG THÁI ĐƠN HÀNG */}
        <section className="panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faClockRotateLeft} className="text-[#176b52] text-sm" />
            <h3 className="font-bold text-sm text-[#1e2d25]">Lịch sử xử lý & Trạng thái đơn hàng</h3>
          </div>
          {historyLogs.length === 0 ? (
            <p className="text-xs text-slate-400">Đơn hàng vừa được khởi tạo ({order.date}).</p>
          ) : (
            <div className="space-y-3 border-l-2 border-[#176b52]/30 pl-4 ml-2">
              {historyLogs.map((log: any) => (
                <div key={log.id} className="relative text-xs">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[#176b52]" />
                  <div className="flex flex-wrap items-center gap-2 font-bold text-[#1e2d25]">
                    <span>
                      {log.from_status ? `${statusViMap[log.from_status] || log.from_status} → ` : ''}
                      {statusViMap[log.to_status] || log.to_status}
                    </span>
                    <span className="text-[10px] font-normal text-slate-400">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </span>
                  </div>
                  {log.actor_name && (
                    <div className="text-[11px] text-[#176b52] font-semibold">
                      Thực hiện bởi: {log.actor_name}
                    </div>
                  )}
                  {log.note && <div className="mt-0.5 text-slate-600">{log.note}</div>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="panel h-fit p-5 space-y-3">
        <h3 className="font-bold">Tóm tắt đơn hàng</h3>
        <div className="mt-4 flex justify-between text-xs text-slate-500">
          <span>Khách hàng</span>
          <span className="font-semibold text-slate-700">{order.customer}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Hình thức nhận</span>
          <span className="font-semibold text-slate-700">{order.delivery}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Tổng tiền</span>
          <b className="text-[#176b52]">{money(order.total)}</b>
        </div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Trạng thái hiện tại</span>
          <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        </div>
        {canCustomerCancel && (
          <button
            type="button"
            onClick={() => void updateStatus(order.id, 'Đã hủy', 'Khách hàng hủy đơn khi chờ xác nhận')}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
          >
            Hủy đơn hàng này
          </button>
        )}
        <button onClick={() => go('/orders')} className="mt-3 w-full text-xs font-semibold text-slate-500 hover:underline">
          ← Quay lại danh sách đơn hàng
        </button>
      </aside>
    </div>
  );
}

export function OrderTable({
  orders,
  admin,
  statusTone,
  money,
  updateStatus,
}: {
  orders: Order[];
  admin: boolean;
  statusTone: (s: string) => string;
  money: (n: number) => string;
  updateStatus?: UpdateOrderStatus;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const adminPrefix = pathname.startsWith('/admin') ? '/admin' : '';
  const sortedOrders = sortOrdersByPriority(orders);
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-white text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            {['Mã đơn hàng', 'Khách hàng & Shipper', 'Thời gian', 'Tổng tiền', 'Trạng thái', 'Tác vụ'].map(x => (
              <th key={x} className="px-5 py-3 font-bold">
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedOrders.map(o => {
            const canCancel = !admin && updateStatus && (o.status === 'Chờ xác nhận' || o.status === 'Chờ duyệt');
            const visual = getOrderVisualMeta(o.status);
            return (
              <tr
                key={o.id}
                className={`border-t border-[#f0f2ef] border-l-4 transition ${visual.border} ${
                  visual.muted ? `${visual.rowBg} opacity-75` : `${visual.rowBg} hover:bg-slate-50/90`
                }`}
              >
                <td className="px-5 py-3 font-bold text-[#39614a]">
                  <button
                    type="button"
                    onClick={() => router.push(`${adminPrefix}/orders/${encodeURIComponent(o.id)}`)}
                    className={`hover:underline text-left ${visual.muted ? 'line-through text-slate-500' : ''}`}
                  >
                    {o.id}
                  </button>
                  <div className="text-[10px] font-normal text-slate-400">{o.delivery}</div>
                </td>
                <td className="px-5">
                  <div className="font-semibold">{o.customer}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{o.items}</div>
                  {o.shipper_name && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      <FontAwesomeIcon icon={faMotorcycle} className="text-[9px]" />
                      <span>Shipper: {o.shipper_name} {o.shipper_phone ? `(${o.shipper_phone})` : ''}</span>
                    </div>
                  )}
                </td>
                <td className="px-5 text-slate-500">{o.date}</td>
                <td className={`px-5 font-bold ${visual.muted ? 'text-slate-500' : 'text-[#176b52]'}`}>{money(o.total)}</td>
                <td className="whitespace-nowrap px-5 py-3 align-middle">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold ${visual.badge}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-5 py-3 align-middle">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {admin && updateStatus && (
                      <div className="shrink-0">
                        <OrderStatusControl id={o.id} status={o.status} updateStatus={updateStatus} />
                      </div>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => void updateStatus(o.id, 'Đã hủy', 'Khách hàng hủy đơn khi chờ xác nhận')}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                      >
                        Hủy đơn
                      </button>
                    )}
                    <button
                      aria-label={`Xem đơn ${o.id}`}
                      onClick={() => router.push(`${adminPrefix}/orders/${encodeURIComponent(o.id)}`)}
                      className="flex items-center gap-1 rounded-lg border border-[#dce4de] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#176b52] hover:bg-[#eef7f1]"
                    >
                      <span>Chi tiết</span>
                      <FontAwesomeIcon icon={faEllipsis} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {sortedOrders.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                Chưa có đơn hàng nào trong mục này.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersView({
  admin,
  orders,
  updateStatus,
  statusTone,
  money,
  tab,
  setTab,
}: {
  admin: boolean;
  orders: Order[];
  updateStatus: UpdateOrderStatus;
  statusTone: (s: string) => string;
  money: (n: number) => string;
  tab: string;
  setTab: (s: string) => void;
}) {
  const tabs = ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Đang chuẩn bị', 'Chờ Shipper lấy hàng', 'Đang giao', 'Hoàn thành', 'Từ chối', 'Đã hủy'];
  const matchesTab = (orderStatus: string, currentTab: string) => {
    if (currentTab === 'Tất cả') return true;
    if (currentTab === 'Chờ xác nhận' || currentTab === 'Chờ duyệt') return orderStatus === 'Chờ xác nhận' || orderStatus === 'Chờ duyệt';
    if (currentTab === 'Đã xác nhận' || currentTab === 'Đã duyệt') return orderStatus === 'Đã xác nhận' || orderStatus === 'Đã duyệt';
    return orderStatus === currentTab;
  };
  const shown = orders.filter(order => matchesTab(order.status, tab));
  return (
    <>
      <div className="mb-4 flex gap-2 overflow-auto">
        {tabs.map(value => (
          <button
            onClick={() => setTab(value)}
            key={value}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold ${
              tab === value ? 'bg-[#176b52] text-white' : 'bg-white text-[#77847b]'
            }`}
          >
            {value}{' '}
            {(value === 'Chờ xác nhận' || value === 'Chờ duyệt') && (
              <span className="ml-1 rounded-full bg-white/20 px-1.5">
                {orders.filter(order => order.status === 'Chờ xác nhận' || order.status === 'Chờ duyệt').length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="panel overflow-hidden">
        <OrderTable orders={shown} admin={admin} statusTone={statusTone} money={money} updateStatus={updateStatus} />
        <div className="flex flex-wrap gap-2 border-t p-4">
          <span className="mr-auto self-center text-[11px] text-slate-400">
            Hiển thị {shown.length} trên {orders.length} đơn hàng
          </span>
        </div>
      </div>
    </>
  );
}
