'use client';

import { useState } from 'react';
import StockShortageDialog from '@/components/stock-shortage-dialog';

export type UpdateOrderStatus = (id: string, status: string, note?: string) => void | boolean | Promise<void | boolean>;

const STATUS_BADGE_STYLE: Record<string, string> = {
  'Đã xác nhận': 'border-emerald-200 bg-emerald-50 text-[#176b52] hover:bg-emerald-100',
  'Đang chuẩn bị': 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
  'Chờ Shipper lấy hàng': 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100',
  'Shipper đã lấy hàng': 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100',
  'Đang giao': 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100',
  'Hoàn thành': 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  'Từ chối': 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  'Đã hủy': 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
};

const PENDING = new Set(['Chờ xác nhận', 'Chờ duyệt']);
const RESERVING = new Set(['Đã xác nhận', 'Đang chuẩn bị', 'Chờ Shipper lấy hàng', 'Hoàn thành']);

export default function OrderStatusControl({
  id,
  status,
  updateStatus,
  apiId,
  onNotify,
}: {
  id: string;
  status: string;
  updateStatus: UpdateOrderStatus;
  /** Backend order id: enables the stock check / shortage handling dialog. */
  apiId?: number;
  onNotify?: (message: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const allowedStatuses: Record<string, string[]> = {
    'Chờ xác nhận': ['Đã xác nhận', 'Đang chuẩn bị', 'Từ chối', 'Đã hủy'],
    'Chờ duyệt': ['Đã xác nhận', 'Đang chuẩn bị', 'Từ chối', 'Đã hủy'],
    'Đã xác nhận': ['Đang chuẩn bị', 'Chờ Shipper lấy hàng', 'Đã hủy'],
    'Đã duyệt': ['Đang chuẩn bị', 'Chờ Shipper lấy hàng', 'Đã hủy'],
    'Đang chuẩn bị': ['Chờ Shipper lấy hàng', 'Đang giao', 'Hoàn thành', 'Đã hủy'],
    'Chờ Shipper lấy hàng': ['Shipper đã lấy hàng', 'Đang giao', 'Hoàn thành', 'Đã hủy'],
    'Shipper đã lấy hàng': ['Đang giao', 'Đã hủy'],
    'Đang giao': ['Hoàn thành', 'Đã hủy'],
  };
  const statuses = allowedStatuses[status] || [];

  const nextQuickStep: Record<string, { status: string; label: string; color: string }> = {
    'Chờ xác nhận': { status: 'Đã xác nhận', label: '✓ Xác nhận đơn', color: 'bg-[#176b52] hover:bg-[#125340] text-white' },
    'Chờ duyệt': { status: 'Đã xác nhận', label: '✓ Xác nhận đơn', color: 'bg-[#176b52] hover:bg-[#125340] text-white' },
    'Đã xác nhận': { status: 'Đang chuẩn bị', label: '→ Chuẩn bị hàng', color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
    'Đã duyệt': { status: 'Đang chuẩn bị', label: '→ Chuẩn bị hàng', color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
    'Đang chuẩn bị': { status: 'Chờ Shipper lấy hàng', label: '→ Chờ Shipper', color: 'bg-teal-600 hover:bg-teal-700 text-white' },
    'Chờ Shipper lấy hàng': { status: 'Đang giao', label: '→ Đang giao', color: 'bg-sky-600 hover:bg-sky-700 text-white' },
    'Shipper đã lấy hàng': { status: 'Đang giao', label: '→ Đang giao', color: 'bg-sky-600 hover:bg-sky-700 text-white' },
    'Đang giao': { status: 'Hoàn thành', label: '✓ Hoàn thành', color: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  };
  const quick = nextQuickStep[status];

  async function saveStatus(targetStatus: string) {
    setSaving(true);
    try {
      const result = await updateStatus(id, targetStatus);
      if (result !== false) setMenuOpen(false);
      // Confirming reserves stock on the backend; a refusal is almost always a shortage.
      else if (apiId && PENDING.has(status) && RESERVING.has(targetStatus)) {
        setMenuOpen(false);
        setStockOpen(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (statuses.length === 0) {
    return (
      <span className="inline-flex h-8 items-center rounded-xl bg-slate-100 px-3 text-[11px] font-semibold text-slate-500">
        Đã chốt trạng thái
      </span>
    );
  }

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1.5">
      {apiId && PENDING.has(status) && (
        <button
          type="button"
          onClick={() => setStockOpen(true)}
          className="inline-flex h-8 items-center whitespace-nowrap rounded-xl border border-amber-300 bg-amber-50 px-3 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
        >
          Kiểm tra kho
        </button>
      )}
      {stockOpen && apiId && (
        <StockShortageDialog
          orderApiId={apiId}
          orderCode={id}
          onClose={() => setStockOpen(false)}
          onConfirm={() => updateStatus(id, 'Đã xác nhận')}
          onResolved={message => onNotify?.(message)}
        />
      )}
      {quick && (
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveStatus(quick.status)}
          className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-xl px-3 text-[11px] font-bold shadow-xs transition disabled:opacity-50 ${quick.color}`}
        >
          {saving ? 'Đang cập nhật…' : quick.label}
        </button>
      )}
      <button
        type="button"
        disabled={saving}
        aria-label={`Đổi trạng thái đơn ${id}`}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(v => !v)}
        className={`inline-flex h-8 items-center justify-center gap-1 whitespace-nowrap rounded-xl border px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
          menuOpen
            ? 'border-[#176b52] bg-emerald-50 text-[#176b52]'
            : 'border-[#d2ddd5] bg-white text-[#294033] hover:border-[#176b52]/50 hover:bg-[#f7faf8]'
        }`}
      >
        <span>{menuOpen ? 'Đóng' : 'Đổi trạng thái'}</span>
        <span className="text-[10px] opacity-70">{menuOpen ? '▲' : '▾'}</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label={`Chọn trạng thái cho đơn ${id}`}
          className="absolute right-0 top-10 z-30 w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#dce6df] bg-white p-2 shadow-xl"
        >
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            <span>Chọn trạng thái mới</span>
            <button
              type="button"
              aria-label="Hủy"
              onClick={() => setMenuOpen(false)}
              className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {statuses.map(value => (
              <button
                key={value}
                type="button"
                role="menuitem"
                disabled={saving}
                onClick={() => void saveStatus(value)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-bold transition disabled:opacity-50 ${
                  STATUS_BADGE_STYLE[value] || 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{value}</span>
                {quick?.status === value && (
                  <span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-extrabold text-[#176b52]">
                    Đề xuất
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
