'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faCheckCircle,
  faClock,
  faCoins,
  faDownload,
  faEdit,
  faFileInvoiceDollar,
  faHistory,
  faPercentage,
  faReceipt,
  faShieldAlt,
  faShoppingBag,
  faStore,
  faUserGroup,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import type { FinancialSummary, VatConfig, Order } from '@/types/domain';
import { API_BASE, authToken } from '@/lib/api';

interface AdminDashboardViewProps {
  summary: FinancialSummary;
  vatConfigs: VatConfig[];
  vatHistory: any[];
  recentOrders: Order[];
  onUpdateVat: (id: number, rate: number, note: string) => Promise<void>;
  money: (n: number) => string;
}

export default function AdminDashboardView({
  summary,
  vatConfigs,
  vatHistory,
  recentOrders,
  onUpdateVat,
  money,
}: AdminDashboardViewProps) {
  const [selectedVat, setSelectedVat] = useState<VatConfig | null>(null);
  const [newRatePercent, setNewRatePercent] = useState<number>(8);
  const [vatNote, setVatNote] = useState('');
  const [isVatModalOpen, setIsVatModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleOpenVatModal = (cfg: VatConfig) => {
    setSelectedVat(cfg);
    setNewRatePercent(cfg.rate * 100);
    setVatNote('');
    setIsVatModalOpen(true);
  };

  const handleSaveVat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVat) return;
    await onUpdateVat(selectedVat.id, newRatePercent / 100, vatNote);
    setIsVatModalOpen(false);
  };

  const handleExportCsv = async () => {
    const token = authToken.get();
    if (!token) {
      setExportError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      return;
    }
    setIsExporting(true);
    setExportError('');
    try {
      const response = await fetch(`${API_BASE}/admin/reports/export-csv`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (response.status === 401 && authToken.get() === token) {
        authToken.clear();
        window.dispatchEvent(new Event('freshflow:unauthorized'));
      }
      if (!response.ok) {
        let message = `Không thể xuất CSV (${response.status}).`;
        try {
          const body = await response.json();
          if (typeof body.detail === 'string') message = body.detail;
        } catch { /* Keep the HTTP status message. */ }
        throw new Error(message);
      }
      const file = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'freshflow_bao_cao_don_hang.csv';
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất báo cáo CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  const maxRevenue = Math.max(...summary.orders_by_date.map(d => d.revenue), 100000);

  return (
    <div className="space-y-8">
      {/* Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-[#1a2d23]">Tổng quan & Quản trị tài chính</h2>
          <p className="text-xs text-[#7d8f85]">Số liệu doanh thu, đơn hàng, công nợ và tỷ lệ vận hành toàn hệ thống FreshFlow.</p>
        </div>
        <button
          onClick={handleExportCsv}
          disabled={isExporting}
          className="flex items-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-xs font-bold text-white shadow transition hover:bg-[#125340] disabled:cursor-wait disabled:opacity-60"
        >
          <FontAwesomeIcon icon={faDownload} />
          Xuất báo cáo tài chính (CSV)
        </button>
      </div>
      {exportError && <p role="alert" className="-mt-5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{exportError}</p>}

      {/* 8 Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Tổng người dùng', value: summary.total_users.toString(), icon: faUsers, color: 'text-blue-600 bg-blue-50', href: '/admin/customers' },
          { label: 'Tổng số Shop', value: summary.total_shops.toString(), icon: faStore, color: 'text-amber-600 bg-amber-50', href: '/admin/customers' },
          { label: 'Tổng sản phẩm', value: summary.total_products.toString(), icon: faShoppingBag, color: 'text-emerald-600 bg-emerald-50', href: '/admin/products' },
          { label: 'Tổng đơn hàng', value: summary.total_orders.toString(), icon: faReceipt, color: 'text-purple-600 bg-purple-50', href: '/admin/orders' },
          { label: 'Giao thành công', value: `${summary.delivery_success_rate}%`, icon: faCheckCircle, color: 'text-teal-600 bg-teal-50', href: '/admin/deliveries' },
          { label: 'Tổng doanh thu', value: money(summary.total_revenue), icon: faCoins, color: 'text-green-700 bg-green-50', href: '/admin/reports' },
          { label: 'Tổng tiền đã thu', value: money(summary.total_paid), icon: faFileInvoiceDollar, color: 'text-indigo-600 bg-indigo-50', href: '/admin/reports' },
          { label: 'Tổng tiền còn nợ', value: money(summary.total_debt), icon: faClock, color: 'text-rose-600 bg-rose-50', href: '/admin/reports' },
        ].map((card, i) => (
          <Link
            key={i}
            href={card.href}
            style={i < 4 ? { borderTopColor: ['#17a2b8', '#28a745', '#f0b400', '#dc3545'][i] } : undefined}
            className={`group flex flex-col justify-between rounded-2xl border border-[#e8ede8] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#176b52]/40 hover:shadow-md ${i < 4 ? 'border-t-4' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#839188] group-hover:text-[#176b52]">{card.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${card.color}`}>
                <FontAwesomeIcon icon={card.icon} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-lg font-extrabold text-[#1f2e26]">{card.value}</span>
              <span className="text-[10px] font-bold text-[#176b52] opacity-0 transition group-hover:opacity-100">Mở →</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Doanh thu theo thời gian */}
        <div className="rounded-2xl border border-[#e8ede8] bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#f1f5f2] pb-4">
            <div>
              <h3 className="text-sm font-bold text-[#1f2f27]">Doanh thu theo thời gian</h3>
              <p className="text-[11px] text-[#86968d]">Biểu đồ các ngày gần nhất</p>
            </div>
            <span className="rounded-md bg-[#eef7f1] px-2.5 py-1 text-[11px] font-bold text-[#176b52]">
              {summary.orders_by_date.length} ngày gần nhất
            </span>
          </div>

          <div className="mt-6 flex h-48 items-end gap-3 pt-6">
            {summary.orders_by_date.map((item, idx) => {
              const heightPercent = Math.max(8, Math.round((item.revenue / maxRevenue) * 100));
              return (
                <div key={idx} className="group relative flex flex-1 flex-col items-center gap-2">
                  <div className="absolute -top-7 hidden rounded bg-slate-900 px-2 py-0.5 text-[9px] font-bold text-white group-hover:block">
                    {money(item.revenue)} ({item.orders} đơn)
                  </div>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-full rounded-t-lg bg-gradient-to-t from-[#176b52] to-[#43967b] transition hover:brightness-110"
                  />
                  <span className="text-[10px] text-[#85948b]">{item.date}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trạng thái đơn hàng */}
        <div className="rounded-2xl border border-[#e8ede8] bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-[#1f2f27]">Trạng thái đơn hàng</h3>
          <p className="text-[11px] text-[#86968d]">Tỷ lệ xử lý các đơn hiện tại</p>

          <div className="mt-5 space-y-3">
            {[
              { key: 'PENDING', label: 'Chờ xác nhận', color: 'bg-amber-400' },
              { key: 'CONFIRMED', label: 'Đã xác nhận', color: 'bg-blue-400' },
              { key: 'PREPARING', label: 'Đang chuẩn bị hàng', color: 'bg-indigo-400' },
              { key: 'READY_FOR_PICKUP', label: 'Chờ Shipper lấy', color: 'bg-yellow-500' },
              { key: 'DELIVERING', label: 'Đang giao hàng', color: 'bg-cyan-500' },
              { key: 'COMPLETED', label: 'Giao thành công', color: 'bg-emerald-500' },
              { key: 'CANCELLED', label: 'Đã hủy', color: 'bg-rose-400' },
            ].map(st => {
              const count = summary.status_distribution[st.key] || 0;
              const percent = summary.total_orders > 0 ? Math.round((count / summary.total_orders) * 100) : 0;
              return (
                <div key={st.key} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#55695f]">{st.label}</span>
                    <span className="font-bold text-[#1e2d25]">{count} ({percent}%)</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0f4f1]">
                    <div style={{ width: `${percent}%` }} className={`h-full ${st.color}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quản lý VAT Section */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[#e8ede8] bg-white shadow-sm">
          <div className="border-b border-[#edf1ee] px-5 py-4">
            <h3 className="text-sm font-bold text-[#1f2f27]">Hiệu quả cửa hàng</h3>
            <p className="mt-1 text-[11px] text-[#86968d]">Doanh thu và số đơn trong kỳ</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="bg-[#f7faf8] text-[10px] uppercase tracking-wide text-[#819087]"><tr><th className="px-5 py-3">Cửa hàng</th><th className="px-3 py-3">Đơn hàng</th><th className="px-5 py-3 text-right">Doanh thu</th></tr></thead>
              <tbody className="divide-y divide-[#edf1ee]">
                {[...summary.shop_breakdown].sort((a, b) => b.revenue - a.revenue).slice(0, 6).map(shop => (
                  <tr key={shop.shop_id}><td className="px-5 py-3 font-semibold text-[#33443a]">{shop.shop_name}</td><td className="px-3 py-3 text-[#637369]">{shop.total_orders}</td><td className="px-5 py-3 text-right font-bold text-[#176b52]">{money(shop.revenue)}</td></tr>
                ))}
                {summary.shop_breakdown.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-[#86968d]">Chưa có dữ liệu cửa hàng trong kỳ.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#e8ede8] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#edf1ee] px-5 py-4">
            <div>
              <h3 className="text-sm font-bold text-[#1f2f27]">Đơn hàng gần đây</h3>
              <p className="mt-1 text-[11px] text-[#86968d]">Theo dõi hoạt động mới nhất</p>
            </div>
            <Link href="/admin/orders" className="text-xs font-bold text-[#176b52] hover:underline">
              Xem tất cả →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left text-xs">
              <thead className="bg-[#f7faf8] text-[10px] uppercase tracking-wide text-[#819087]"><tr><th className="px-5 py-3">Mã đơn / Khách hàng</th><th className="px-3 py-3">Trạng thái</th><th className="px-5 py-3 text-right">Tổng tiền</th></tr></thead>
              <tbody className="divide-y divide-[#edf1ee]">
                {recentOrders.slice(0, 6).map(order => (
                  <tr key={order.apiId ?? order.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/admin/orders/${encodeURIComponent(order.id)}`} className="font-bold text-[#176b52] hover:underline">
                        #{order.id}
                      </Link>
                      <div className="mt-1 text-[10px] text-[#86968d]">{order.customer_name || order.customer || 'Khách hàng'}</div>
                    </td>
                    <td className="px-3 py-3"><span className="rounded-full bg-[#eef7f1] px-2 py-1 text-[10px] font-semibold text-[#176b52]">{order.status}</span></td>
                    <td className="px-5 py-3 text-right font-bold text-[#26372d]">{money(order.total)}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && <tr><td colSpan={3} className="px-5 py-8 text-center text-[#86968d]">Chưa có đơn hàng.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="rounded-2xl border border-[#e8ede8] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f1f5f2] pb-4">
          <div>
            <h3 className="text-sm font-bold text-[#1f2f27]">Quản lý cấu hình thuế VAT</h3>
            <p className="text-[11px] text-[#86968d]">Thiết lập thuế suất VAT và xem lịch sử điều chỉnh chính sách thuế</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#176b52]">
            <FontAwesomeIcon icon={faShieldAlt} />
            Tuân thủ quy định thuế hiện hành
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* VAT Cards */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#44564c]">Mức thuế áp dụng:</div>
            {vatConfigs.map(cfg => (
              <div
                key={cfg.id}
                className="flex items-center justify-between rounded-xl border border-[#e5ece6] bg-[#f9fbf9] p-4"
              >
                <div>
                  <div className="text-sm font-bold text-[#1f2e26]">{cfg.tax_name}</div>
                  <div className="text-[11px] text-[#7d8f85]">
                    Cập nhật lần cuối: {new Date(cfg.updated_at).toLocaleDateString('vi-VN')}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xl font-extrabold text-[#176b52]">{cfg.rate * 100}%</span>
                  <button
                    onClick={() => handleOpenVatModal(cfg)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-[#d2ddd5] text-[#176b52] shadow-sm hover:bg-[#eaf4ee]"
                    title="Chỉnh sửa VAT"
                  >
                    <FontAwesomeIcon icon={faEdit} className="text-xs" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Lịch sử VAT */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#44564c]">
              <FontAwesomeIcon icon={faHistory} />
              Lịch sử thay đổi thuế suất:
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {vatHistory.map(h => (
                <div key={h.id} className="rounded-lg border border-[#e8ede8] bg-white p-2.5 text-[11px]">
                  <div className="flex justify-between font-bold text-[#1e2a23]">
                    <span>Thay đổi: {h.old_rate * 100}%  {h.new_rate * 100}%</span>
                    <span className="text-[10px] font-normal text-[#86968d]">
                      {new Date(h.created_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>
                  <div className="mt-1 text-[#627369]">{h.note || 'Không có ghi chú'}</div>
                </div>
              ))}
              {vatHistory.length === 0 && (
                <div className="text-xs text-[#8d9e94]">Chưa có lịch sử điều chỉnh nào.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal chỉnh sửa VAT */}
      {isVatModalOpen && selectedVat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1b2d24]">Điều chỉnh tỷ lệ VAT</h3>
            <p className="mt-1 text-xs text-[#7d8f85]">Thay đổi tỷ lệ phần trăm thuế GTGT áp dụng cho các đơn hàng mới.</p>

            <form onSubmit={handleSaveVat} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-[#3d5045]">Tỷ lệ thuế VAT (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  required
                  value={newRatePercent}
                  onChange={e => setNewRatePercent(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs font-bold focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Ghi chú / Căn cứ pháp lý điều chỉnh</label>
                <textarea
                  rows={3}
                  placeholder="Ví dụ: Áp dụng Nghị quyết giảm thuế GTGT 8% theo quy định..."
                  value={vatNote}
                  onChange={e => setVatNote(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVatModalOpen(false)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64] hover:bg-slate-50"
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
