'use client';

import { useState } from 'react';

export type UpdateOrderStatus = (id: string, status: string, note?: string) => void | boolean | Promise<void | boolean>;

export default function OrderStatusControl({ id, status, updateStatus }: { id: string; status: string; updateStatus: UpdateOrderStatus }) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(status);
  const [saving, setSaving] = useState(false);
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
    'Chờ xác nhận': { status: 'Đã xác nhận', label: '→ Xác nhận đơn', color: 'bg-[#176b52] hover:bg-[#125340] text-white' },
    'Chờ duyệt': { status: 'Đã xác nhận', label: '→ Xác nhận đơn', color: 'bg-[#176b52] hover:bg-[#125340] text-white' },
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
      if (result !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="inline-flex items-center gap-1.5">
        {quick && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveStatus(quick.status)}
            className={`inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[11px] font-bold shadow-sm transition disabled:opacity-50 ${quick.color}`}
          >
            {quick.label}
          </button>
        )}
        <button
          type="button"
          disabled={statuses.length === 0 || saving}
          aria-label={`Đổi trạng thái đơn ${id}`}
          onClick={() => {
            setSelected(statuses[0] || status);
            setEditing(true);
          }}
          className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border border-[#c9ddce] bg-white px-2.5 text-[11px] font-semibold text-[#176b52] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Đổi trạng thái
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label={`Trạng thái mới của đơn ${id}`}
        value={selected}
        disabled={saving}
        onChange={event => setSelected(event.target.value)}
        className="h-8 w-36 shrink-0 rounded-lg border border-[#c9ddce] bg-white px-2 text-xs"
      >
        {statuses.map(value => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void saveStatus(selected)}
        disabled={saving || selected === status}
        className="h-8 shrink-0 whitespace-nowrap rounded-lg bg-[#176b52] px-2.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Đang lưu…' : 'Lưu'}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => setEditing(false)}
        className="h-8 shrink-0 rounded-lg px-2 text-xs text-slate-500 disabled:opacity-50"
      >
        Hủy
      </button>
    </div>
  );
}
