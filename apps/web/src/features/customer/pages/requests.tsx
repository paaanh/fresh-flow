'use client';

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { Badge, Button } from './shared-ui';
import type { ProductRequest } from '@/types/domain';

export function RequestsView({
  admin,
  shop = false,
  requests,
  notify,
  open,
  update,
}: {
  admin: boolean;
  shop?: boolean;
  requests: ProductRequest[];
  notify: (s: string) => void;
  open: () => void;
  update: (id: number, status: string, quotedPrice?: number, responseNote?: string) => void;
}) {
  const canManage = admin || shop;
  const visible = requests;
  const fresh = visible.filter(request => request.status === 'Mới').length;
  const processing = visible.filter(request => request.status === 'Đang xử lý' || request.status === 'Hoàn tất').length;
  const quoted = visible.filter(request => request.status === 'Đã báo giá').length;

  const [quotingReq, setQuotingReq] = useState<ProductRequest | null>(null);
  const [quotePrice, setQuotePrice] = useState<number>(45000);
  const [quoteStatus, setQuoteStatus] = useState<string>('Đã báo giá');
  const [quoteNote, setQuoteNote] = useState<string>('');

  const openQuoteModal = (req: ProductRequest) => {
    setQuotingReq(req);
    setQuotePrice(req.quoted_price || 45000);
    setQuoteStatus('Đã báo giá');
    setQuoteNote(req.admin_response || `Cửa hàng đã tìm được nguồn hàng ${req.name} tươi ngon trong ngày.`);
  };

  const handleQuoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotingReq) return;
    update(quotingReq.id, quoteStatus, quotePrice > 0 ? quotePrice : undefined, quoteNote.trim() || undefined);
    setQuotingReq(null);
  };

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          ['Yêu cầu mới', String(fresh)],
          ['Đang xử lý / Hoàn tất', String(processing)],
          ['Đã báo giá', String(quoted)],
        ].map(x => (
          <div key={x[0]} className="panel p-4">
            <span className="text-xs text-slate-500">{x[0]}</span>
            <div className="mt-2 text-2xl font-extrabold">{x[1]}</div>
          </div>
        ))}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <b className="text-sm">{canManage ? 'Quản lý Yêu cầu tìm nguồn mặt hàng từ Khách' : 'Yêu cầu tìm nguồn nông sản của bạn'}</b>
            <p className="mt-1 text-[11px] text-slate-400">
              {canManage
                ? 'Tiếp nhận yêu cầu nông sản đặc thù, báo giá dự kiến và phản hồi trực tiếp cho khách hàng.'
                : 'Đề xuất mặt hàng nông sản bạn đang cần — Cửa hàng & Quản trị viên sẽ tìm nguồn và báo giá cho bạn.'}
            </p>
          </div>
          {!canManage && (
            <Button onClick={open}>
              <FontAwesomeIcon icon={faPlus} /> Tạo yêu cầu mặt hàng
            </Button>
          )}
        </div>

        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <h3 className="mt-3 text-sm font-bold">Chưa có yêu cầu mặt hàng</h3>
            <p className="mt-1 text-xs text-slate-500">Gửi yêu cầu để cửa hàng tìm nguồn cung nông sản tươi sạch giúp bạn.</p>
            {!canManage && (
              <div className="mt-4">
                <Button onClick={open}>
                  <FontAwesomeIcon icon={faPlus} /> Gửi yêu cầu đầu tiên
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="bg-white text-[10px] uppercase text-slate-400">
                <tr>
                  {['Mặt hàng mong muốn', 'Danh mục & Số lượng', 'Người yêu cầu', 'Phản hồi & Báo giá từ Shop/Admin', 'Trạng thái', 'Tác vụ'].map(x => (
                    <th key={x} className="px-5 py-3">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(request => (
                  <tr id={`request-${request.id}`} key={request.id} className="scroll-mt-24 border-t target:bg-emerald-50">
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#1e2d25]">{request.name}</div>
                      <div className="text-[10px] text-slate-400">{request.date}</div>
                    </td>
                    <td className="px-5">
                      <div className="font-semibold text-slate-700">{request.category}</div>
                      <div className="text-[11px] text-slate-500">{request.quantity}</div>
                    </td>
                    <td className="px-5 font-medium">{canManage ? request.customer : 'Bạn'}</td>
                    <td className="px-5">
                      {request.quoted_price ? (
                        <div>
                          <span className="font-extrabold text-[#176b52]">
                            {new Intl.NumberFormat('vi-VN').format(request.quoted_price)}₫
                          </span>
                          {request.admin_response && (
                            <p className="mt-0.5 text-[11px] text-slate-600">{request.admin_response}</p>
                          )}
                        </div>
                      ) : request.admin_response ? (
                        <p className="text-[11px] text-slate-600">{request.admin_response}</p>
                      ) : (
                        <span className="text-[11px] text-slate-400">Đang chờ Shop/Admin phản hồi</span>
                      )}
                    </td>
                    <td className="px-5">
                      <Badge
                        tone={
                          request.status === 'Mới'
                            ? 'orange'
                            : request.status === 'Đã báo giá' || request.status === 'Hoàn tất'
                              ? 'green'
                              : request.status === 'Từ chối'
                                ? 'red'
                                : 'blue'
                        }
                      >
                        {request.status}
                      </Badge>
                    </td>
                    <td className="px-5">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => openQuoteModal(request)}
                          className="rounded-xl bg-[#176b52] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#125340]"
                        >
                          {request.status === 'Mới' ? 'Báo giá & Phản hồi' : 'Cập nhật báo giá'}
                        </button>
                      ) : request.status === 'Đã báo giá' ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => update(request.id, 'Đang xử lý', request.quoted_price || undefined, 'Khách hàng đồng ý mức báo giá')}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                          >
                            Đồng ý mua
                          </button>
                          <button
                            type="button"
                            onClick={() => update(request.id, 'Từ chối', request.quoted_price || undefined, 'Khách hàng từ chối báo giá')}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                          >
                            Từ chối
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Báo giá & Phản hồi cho Admin / Shop */}
      {quotingReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-extrabold text-[#1a2e24]">Phản hồi & Báo giá mặt hàng</h3>
            <p className="mt-1 text-xs text-slate-500">
              Yêu cầu: <b>{quotingReq.name}</b> ({quotingReq.quantity}) từ <b>{quotingReq.customer}</b>
            </p>

            <form onSubmit={handleQuoteSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Trạng thái xử lý</label>
                <select
                  value={quoteStatus}
                  onChange={e => setQuoteStatus(e.target.value)}
                  className="w-full rounded-xl border border-[#d2ddd5] bg-white p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                >
                  <option value="Đã báo giá">Đã báo giá (QUOTED)</option>
                  <option value="Đang xử lý">Đang chuẩn bị nguồn hàng (ACCEPTED)</option>
                  <option value="Hoàn tất">Đã nhập hàng lên kệ (FULFILLED)</option>
                  <option value="Từ chối">Từ chối / Chưa có nguồn cung (REJECTED)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Giá dự kiến báo cho khách (VNĐ)</label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={quotePrice}
                  onChange={e => setQuotePrice(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs font-bold text-[#176b52] focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nội dung phản hồi cho khách hàng</label>
                <textarea
                  rows={3}
                  value={quoteNote}
                  onChange={e => setQuoteNote(e.target.value)}
                  placeholder="Thông tin nguồn gốc, thời gian hàng về, quy cách đóng gói..."
                  className="w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuotingReq(null)}
                  className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-slate-600"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340]"
                >
                  Gửi báo giá & Phản hồi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
