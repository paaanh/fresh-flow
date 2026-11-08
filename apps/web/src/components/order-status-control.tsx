'use client';

import { useState } from 'react';

export type UpdateOrderStatus = (id: string, status: string) => void | boolean | Promise<void | boolean>;

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
    'Chờ Shipper lấy hàng': ['Shipper đã lấy hàng', 'Đang giao', 'Đã hủy'],
    'Shipper đã lấy hàng': ['Đang giao', 'Đã hủy'],
    'Đang giao': ['Hoàn thành', 'Đã hủy'],
  };
  const statuses = allowedStatuses[status] || [];

  async function save() {
    setSaving(true);
    try {
      const result = await updateStatus(id, selected);
      if (result !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) return <button type="button" disabled={statuses.length === 0} aria-label={`Đổi trạng thái đơn ${id}`} onClick={() => { setSelected(statuses[0] || status); setEditing(true); }} className="inline-flex h-9 w-32 items-center justify-center whitespace-nowrap rounded-lg border border-[#c9ddce] px-3 text-xs font-semibold text-[#176b52] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">Đổi trạng thái</button>;

  return <div className="flex items-center gap-2">
    <select aria-label={`Trạng thái mới của đơn ${id}`} value={selected} disabled={saving} onChange={event => setSelected(event.target.value)} className="h-9 w-36 shrink-0 rounded-lg border border-[#c9ddce] bg-white px-2 text-xs">
      {statuses.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
    <button type="button" onClick={save} disabled={saving || selected === status} className="h-9 w-24 shrink-0 whitespace-nowrap rounded-lg bg-[#176b52] px-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Đang lưu…' : 'Lưu'}</button>
    <button type="button" disabled={saving} onClick={() => setEditing(false)} className="h-9 shrink-0 rounded-lg px-2 text-xs text-slate-500 disabled:opacity-50">Hủy</button>
  </div>;
}
