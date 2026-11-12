'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons';
import { freshflow, type ShortageAction, type StockCheck } from '@/lib/api';

const num = (v: number | string) => Number(v || 0);
const fmt = (v: number | string) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(num(v));

const ACTIONS: { action: ShortageAction; label: string; hint: string; tone: string }[] = [
  { action: 'PARTIAL', label: 'Giao một phần', hint: 'Giảm số lượng về mức còn khả dụng, tính lại tiền và xác nhận đơn', tone: 'bg-[#176b52] text-white hover:bg-[#125340]' },
  { action: 'WAIT', label: 'Chờ nhập thêm hàng', hint: 'Giữ đơn ở trạng thái chờ và báo khách', tone: 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100' },
  { action: 'OUT_OF_STOCK', label: 'Báo hết hàng', hint: 'Hủy đơn và thông báo cho khách', tone: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' },
];

/**
 * Shows real available stock for each line of a pending order and lets Admin/Shop
 * decide how to handle a shortage. All checks and changes are done by the backend.
 */
export default function StockShortageDialog({
  orderApiId,
  orderCode,
  onClose,
  onConfirm,
  onResolved,
}: {
  orderApiId: number;
  orderCode: string;
  onClose: () => void;
  /** Confirm normally (only offered when stock is sufficient). */
  onConfirm: () => Promise<unknown> | unknown;
  onResolved?: (message: string) => void;
}) {
  const [check, setCheck] = useState<StockCheck | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>('');
  const [note, setNote] = useState('');

  const load = () => {
    setError('');
    freshflow.stockCheck(orderApiId).then(setCheck).catch(e => setError(e instanceof Error ? e.message : 'Không kiểm tra được tồn kho'));
  };
  useEffect(load, [orderApiId]);

  const resolve = async (action: ShortageAction) => {
    setBusy(action);
    setError('');
    try {
      await freshflow.resolveShortage(orderApiId, action, note.trim() || undefined);
      onResolved?.(
        action === 'PARTIAL' ? `Đã xác nhận giao một phần đơn ${orderCode}` : action === 'WAIT' ? `Đơn ${orderCode} đang chờ nhập hàng` : `Đã báo hết hàng và hủy đơn ${orderCode}`
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xử lý được');
      load();
    } finally {
      setBusy('');
    }
  };

  const confirm = async () => {
    setBusy('CONFIRM');
    try {
      const result = await onConfirm();
      if (result !== false) onClose();
      else load();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="stock-title">
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white text-xs shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-[#f8fbf9] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3 id="stock-title" className="text-sm font-extrabold text-[#1a2e24]">Kiểm tra tồn kho · {orderCode}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">Số lượng khả dụng = tồn thực tế − hàng đang giữ cho đơn đã xác nhận.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {!check && !error && <div className="py-6 text-center text-slate-400">Đang kiểm tra tồn kho…</div>}
          {check && (
            <>
              {check.can_fulfill ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">Đủ hàng để xác nhận đơn này.</div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-900">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
                  <span>Không đủ hàng. Chọn một phương án xử lý bên dưới. Các đơn chờ khác cùng mặt hàng được liệt kê để bạn ưu tiên.</span>
                </div>
              )}
              <ul className="space-y-2">
                {check.lines.map(line => {
                  const short = num(line.shortage_quantity) > 0;
                  return (
                    <li key={line.product_id} className={`rounded-xl border p-3 ${short ? 'border-rose-200 bg-rose-50/40' : 'border-[#e3ece6]'}`}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <b className="break-words text-[#1e2d25]">{line.product_name}</b>
                        {short && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">Thiếu {fmt(line.shortage_quantity)} {line.unit}</span>}
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg bg-white px-2 py-1.5"><dt className="text-slate-400">Đơn này cần</dt><dd className="font-extrabold">{fmt(line.requested_quantity)} {line.unit}</dd></div>
                        <div className="rounded-lg bg-white px-2 py-1.5"><dt className="text-slate-400">Còn khả dụng</dt><dd className={`font-extrabold ${short ? 'text-rose-700' : 'text-[#176b52]'}`}>{fmt(line.available_quantity)} {line.unit}</dd></div>
                      </dl>
                      {line.competing_pending_orders.length > 0 && (
                        <div className="mt-2 text-[11px] text-slate-500">
                          Đơn chờ khác cùng mặt hàng:{' '}
                          {line.competing_pending_orders.map(o => `${o.order_number} (${fmt(o.quantity)})`).join(', ')}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!check.can_fulfill && (
                <label className="block">
                  <span className="mb-1 block font-semibold text-slate-600">Lời nhắn gửi khách (tùy chọn)</span>
                  <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} className="w-full rounded-xl border border-[#d2ddd5] px-3 py-2 focus:border-[#176b52] focus:outline-none" />
                </label>
              )}
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="shrink-0 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {check?.can_fulfill ? (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-[#d2ddd5] px-4 py-2 font-semibold text-slate-600">Đóng</button>
              <button type="button" disabled={Boolean(busy)} onClick={() => void confirm()} className="rounded-xl bg-[#176b52] px-4 py-2 font-bold text-white disabled:opacity-60">
                {busy === 'CONFIRM' ? 'Đang xác nhận…' : '✓ Xác nhận & giữ hàng'}
              </button>
            </div>
          ) : check ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {ACTIONS.map(a => (
                <button key={a.action} type="button" disabled={Boolean(busy)} title={a.hint} onClick={() => void resolve(a.action)} className={`rounded-xl px-3 py-2 text-left font-bold transition disabled:opacity-60 ${a.tone}`}>
                  {busy === a.action ? 'Đang xử lý…' : a.label}
                  <span className="mt-0.5 block text-[10px] font-medium opacity-80">{a.hint}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
