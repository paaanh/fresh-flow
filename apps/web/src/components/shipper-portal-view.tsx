'use client';

import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxOpen,
  faCheck,
  faCheckCircle,
  faClipboardCheck,
  faCoins,
  faHandHoldingDollar,
  faLocationDot,
  faMapMarkerAlt,
  faMotorcycle,
  faPhone,
  faReceipt,
  faTruck,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import type { Order, User } from '@/types/domain';
import { freshflow } from '@/lib/api';

interface ShipperPortalViewProps {
  currentUser: User;
  assignedOrders: Order[];
  availableOrders: Order[];
  onClaimOrder: (orderId: number) => Promise<void>;
  onPickupOrder: (orderId: number) => Promise<void>;
  onDeliveringOrder: (orderId: number) => Promise<void>;
  onCompleteOrder: (orderId: number, paidAmount: number) => Promise<void>;
  money: (n: number) => string;
  initialTab?: 'assigned' | 'available' | 'history';
}

export default function ShipperPortalView({
  currentUser,
  assignedOrders,
  availableOrders,
  onClaimOrder,
  onPickupOrder,
  onDeliveringOrder,
  onCompleteOrder,
  money,
  initialTab = 'assigned',
}: ShipperPortalViewProps) {
  const [activeTab, setActiveTab] = useState<'assigned' | 'available' | 'history'>(initialTab);
  const [completingOrder, setCompletingOrder] = useState<Order | null>(null);
  const [collectedCash, setCollectedCash] = useState<number>(0);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [orderHistoryLogs, setOrderHistoryLogs] = useState<any[]>([]);
  useEffect(() => setActiveTab(initialTab), [initialTab]);

  const handleOpenDetail = (order: Order) => {
    setDetailOrder(order);
    setOrderHistoryLogs([]);
    if (order.apiId) {
      freshflow.orderHistory<any>(order.apiId)
        .then(logs => setOrderHistoryLogs(logs || []))
        .catch(() => {});
    }
  };

  const activeDeliveries = assignedOrders.filter(
    o => o.status !== 'Hoàn thành' && o.status !== 'COMPLETED' && o.status !== 'Đã hủy' && o.status !== 'CANCELLED'
  );
  const completedOrders = assignedOrders.filter(
    o => o.status === 'Hoàn thành' || o.status === 'COMPLETED'
  );
  const totalCollectedCOD = completedOrders.reduce(
    (sum, o) => sum + (o.cash_collected_by_shipper || o.total || 0),
    0
  );

  const handleOpenCompleteModal = (order: Order) => {
    setCompletingOrder(order);
    setCollectedCash(order.total);
  };

  const handleConfirmComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingOrder || !completingOrder.apiId) return;
    await onCompleteOrder(completingOrder.apiId, collectedCash);
    setCompletingOrder(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Shipper Banner */}
      <div className="rounded-2xl border border-[#e8ede8] bg-gradient-to-r from-[#205493] to-[#2b72c4] p-6 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 text-2xl text-white backdrop-blur">
              <FontAwesomeIcon icon={faMotorcycle} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold">{currentUser.full_name}</h2>
              <div className="mt-0.5 text-xs text-white/80">
                Phương tiện: {currentUser.vehicle_info || 'Chưa cập nhật'} · SĐT: {currentUser.phone || 'Chưa cập nhật'}
              </div>
              <div className="mt-1 text-[11px] text-white/70">
                Trạng thái: <span className="font-bold text-emerald-300">Đang sẵn sàng nhận đơn</span>
              </div>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl bg-white/10 p-3 backdrop-blur text-xs">
            <div>
              <div className="text-white/70">Tiền COD đã thu:</div>
              <div className="text-base font-extrabold">{money(totalCollectedCOD)}</div>
            </div>
            <div className="border-l border-white/20 pl-4">
              <div className="text-white/70">Đơn đã giao:</div>
              <div className="text-base font-extrabold">{completedOrders.length}</div>
            </div>
          </div>
        </div>

        {/* Tab selection */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-white/20 pt-4 text-xs font-semibold">
          {[
            { id: 'assigned', label: 'Đơn đang giao của bạn', count: activeDeliveries.length },
            { id: 'available', label: 'Đơn chờ Shipper nhận', count: availableOrders.length },
            { id: 'history', label: 'Lịch sử đã giao thành công', count: completedOrders.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-xl px-4 py-2 transition ${
                activeTab === tab.id
                  ? 'bg-white font-bold text-[#205493] shadow'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px]">
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab: ASSIGNED ORDERS */}
      {activeTab === 'assigned' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1f2d26]">Danh sách đơn hàng bạn đang phụ trách</h3>
          <div className="space-y-4">
            {activeDeliveries.map(order => (
              <div
                key={order.id}
                className="overflow-hidden rounded-2xl border border-[#e8ede8] bg-white p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1f5f2] pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-[#1a2d24] text-base">{order.id}</span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
                      {order.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] text-[#5d6e64]">
                      {order.delivery}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-[#809187]">Cần thu COD: </span>
                    <span className="text-base font-extrabold text-[#176b52]">{money(order.total)}</span>
                  </div>
                </div>

                {/* Recipient details */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs text-[#43564c]">
                  <div className="flex items-start gap-2">
                    <FontAwesomeIcon icon={faUser} className="mt-0.5 text-[#176b52]" />
                    <div>
                      <div className="font-bold">{order.recipient_name || order.customer}</div>
                      {order.recipient_phone ? <a className="text-[#176b52] underline" href={`tel:${order.recipient_phone}`}>{order.recipient_phone}</a> : <div className="text-[#72857a]">Khách chưa cung cấp số điện thoại</div>}
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <FontAwesomeIcon icon={faLocationDot} className="mt-0.5 text-rose-500" />
                    <div>
                      <a className="font-semibold text-[#176b52] underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address || order.delivery)}`}>{order.delivery_address || order.delivery} · Mở bản đồ</a>
                      {order.note && <div className="text-[11px] text-[#819287]">Ghi chú: {order.note}</div>}
                    </div>
                  </div>
                </div>

                {/* Shipper Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#f1f5f2] pt-3">
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(order)}
                    className="rounded-xl border border-[#d2ddd5] bg-white px-3.5 py-2 text-xs font-bold text-[#33493d] hover:bg-slate-50"
                  >
                    Xem chi tiết đơn
                  </button>
                  {(order.delivery_address || order.delivery) && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.delivery_address || order.delivery)}`} className="rounded-xl border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700">Mở chỉ đường</a>}
                  {(order.status === 'Chờ Shipper lấy hàng' || order.status === 'READY_FOR_PICKUP' || order.status === 'Đang chuẩn bị') && (
                    <button
                      onClick={() => onPickupOrder(order.apiId!)}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-indigo-700"
                    >
                      <FontAwesomeIcon icon={faBoxOpen} />
                      Đã lấy hàng từ Shop
                    </button>
                  )}

                  {(order.status === 'Shipper đã lấy hàng' || order.status === 'PICKED_UP') && (
                    <button
                      onClick={() => onDeliveringOrder(order.apiId!)}
                      className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-cyan-700"
                    >
                      <FontAwesomeIcon icon={faTruck} />
                      Bắt đầu đi giao
                    </button>
                  )}

                  {(order.status === 'Đang giao hàng' || order.status === 'DELIVERING' || order.status === 'Đang giao') && (
                    <button
                      onClick={() => handleOpenCompleteModal(order)}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} />
                      Giao thành công & Thu tiền COD
                    </button>
                  )}
                </div>
              </div>
            ))}

            {activeDeliveries.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#d8e0d8] bg-white p-12 text-center text-xs text-[#809187]">
                Hiện tại bạn chưa có đơn hàng nào đang giao.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: AVAILABLE ORDERS */}
      {activeTab === 'available' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1f2d26]">Đơn hàng sẵn sàng chờ Shipper nhận</h3>
          <div className="space-y-3">
            {availableOrders.map(order => (
              <div
                key={order.id}
                className="flex flex-col justify-between rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm sm:flex-row sm:items-center gap-4"
              >
                <div>
                  <div className="font-bold text-[#1f2d26]">{order.id}</div>
                  <div className="text-xs text-[#627369]">
                    Giao tới: {order.delivery_address || order.delivery} · Thu COD: <b className="text-[#176b52]">{money(order.total)}</b>
                  </div>
                  {(order.delivery_address || order.delivery) && <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.delivery_address || order.delivery)}`} className="text-xs font-semibold text-blue-700 underline">Xem tuyến đường</a>}
                </div>

                <button
                  onClick={() => onClaimOrder(order.apiId!)}
                  className="rounded-xl bg-[#205493] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#184275]"
                >
                  Nhận giao đơn này
                </button>
              </div>
            ))}

            {availableOrders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#d8e0d8] bg-white p-12 text-center text-xs text-[#809187]">
                Hiện không có đơn nào đang chờ nhận.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#1f2d26]">Các đơn bạn đã hoàn thành giao ({completedOrders.length})</h3>
          <div className="space-y-3">
            {completedOrders.map(order => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e8ede8] bg-white p-4 text-xs shadow-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-[#1f2d26]">#{order.id}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      {order.status}
                    </span>
                    <span className="text-[11px] text-slate-400">{order.date}</span>
                  </div>
                  <div className="text-[#4a5d52]">
                    Người nhận: <b>{order.recipient_name || order.customer}</b>{order.recipient_phone ? ` (${order.recipient_phone})` : ''} · Mặt hàng: <b>{order.items}</b>
                  </div>
                  <div className="text-[11px] text-[#7d8f85]">
                    Địa chỉ giao: {order.delivery_address || order.delivery}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-extrabold text-sm text-[#176b52]">{money(order.total)}</div>
                    <div className="text-[10px] text-emerald-600 font-bold">
                      Đã thu COD: {money(order.cash_collected_by_shipper || order.total)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenDetail(order)}
                    className="rounded-xl border border-[#205493]/30 bg-blue-50/60 px-3.5 py-2 text-xs font-bold text-[#205493] hover:bg-blue-100"
                  >
                    Xem chi tiết đơn
                  </button>
                </div>
              </div>
            ))}
            {completedOrders.length === 0 && (
              <div className="rounded-2xl border border-dashed border-[#d8e0d8] bg-white p-12 text-center text-xs text-[#809187]">
                Chưa có đơn hàng nào trong lịch sử giao hoàn thành.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Xem Chi Tiết Đơn Giao & Lịch sử */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#edf2ee] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#1a2e24]">Chi tiết đơn giao #{detailOrder.id}</h3>
                <p className="text-[11px] text-slate-400">Thời gian đặt: {detailOrder.date} · Hình thức: {detailOrder.delivery}</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-[#176b52]">
                {detailOrder.status}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl bg-[#f8faf8] p-4 border border-[#e8ede8]">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Thông tin người nhận</div>
                <div className="mt-1 font-bold text-[#1e2d25]">{detailOrder.recipient_name || detailOrder.customer}</div>
                <div className="text-slate-600">{detailOrder.recipient_phone || 'Chưa cung cấp SĐT'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400">Địa chỉ giao hàng</div>
                <div className="mt-1 font-semibold text-[#1e2d25]">{detailOrder.delivery_address || detailOrder.delivery}</div>
                {detailOrder.note && <div className="mt-0.5 text-amber-700">Ghi chú: {detailOrder.note}</div>}
              </div>
            </div>

            <div>
              <h4 className="font-bold text-[#1e2d25] mb-2">Danh sách sản phẩm trong đơn ({detailOrder.items})</h4>
              <div className="divide-y divide-[#f0f4f1] rounded-xl border border-[#e8ede8]">
                {(detailOrder.lines || []).map((line, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="font-bold text-[#1f2d25]">{line.name}</div>
                      <div className="text-[11px] text-slate-500">Số lượng: {line.quantity} {line.unit}</div>
                    </div>
                    <div className="font-bold text-[#176b52]">{money((line.price || 0) * line.quantity)}</div>
                  </div>
                ))}
                {(!detailOrder.lines || detailOrder.lines.length === 0) && (
                  <div className="p-3 text-slate-400">Đơn gồm {detailOrder.items}</div>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-[#f4f9f6] p-4 space-y-1.5 border border-[#dcebe2]">
              <div className="flex justify-between text-slate-600">
                <span>Phương thức thanh toán:</span>
                <b>{detailOrder.payment_method || 'COD'}</b>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Phí giao hàng:</span>
                <b>{money(detailOrder.delivery_fee || 0)}</b>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-[#176b52] border-t border-[#dcebe2] pt-1.5">
                <span>Tổng thu khách (COD):</span>
                <span>{money(detailOrder.total)}</span>
              </div>
            </div>

            {orderHistoryLogs.length > 0 && (
              <div>
                <h4 className="font-bold text-[#1e2d25] mb-2">Lịch sử hành trình đơn hàng</h4>
                <div className="space-y-2 border-l-2 border-[#176b52]/30 pl-3 ml-1">
                  {orderHistoryLogs.map((log: any) => (
                    <div key={log.id} className="text-[11px]">
                      <div className="font-bold text-[#1e2d25]">
                        {log.from_status ? `${log.from_status} → ` : ''}{log.to_status}
                        <span className="ml-2 font-normal text-slate-400">
                          ({new Date(log.created_at).toLocaleString('vi-VN')})
                        </span>
                      </div>
                      {log.note && <div className="text-slate-600">{log.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="rounded-xl bg-[#205493] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#184275]"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Hoàn Tất Giao Hàng & Thu Tiền */}
      {completingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1a2e24]">Xác nhận giao hàng thành công</h3>
            <p className="mt-1 text-xs text-[#7e8f85]">
              Xác nhận khách đã nhận đủ hàng và ghi nhận số tiền thu hộ (COD).
            </p>

            <form onSubmit={handleConfirmComplete} className="mt-4 space-y-4">
              <div className="rounded-xl bg-[#f2f8f4] p-3 text-xs text-[#1e3e2e] space-y-1">
                <div>Đơn hàng: <b>{completingOrder.id}</b></div>
                <div>Khách hàng: <b>{completingOrder.customer}</b></div>
                <div>Tổng tiền đơn: <b>{money(completingOrder.total)}</b></div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Số tiền thực tế đã thu từ khách (₫)</label>
                <input
                  type="number"
                  required
                  value={collectedCash}
                  onChange={e => setCollectedCash(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs font-bold text-[#176b52] focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingOrder(null)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64]"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
                >
                  Xác nhận hoàn tất
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
