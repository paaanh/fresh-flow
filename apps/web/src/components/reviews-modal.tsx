'use client';

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faTruck, faXmark, faImage } from '@fortawesome/free-solid-svg-icons';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'product' | 'shipper';
  targetId: number; // productId or orderId
  targetTitle: string;
  onSubmit: (data: any) => Promise<void>;
}

export default function ReviewModal({
  isOpen,
  onClose,
  type,
  targetId,
  targetTitle,
  onSubmit,
}: ReviewModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [attitudeRating, setAttitudeRating] = useState<number>(5);
  const [speedRating, setSpeedRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (type === 'product') {
        await onSubmit({
          product_id: targetId,
          rating,
          comment,
          images,
        });
      } else {
        await onSubmit({
          order_id: targetId,
          rating,
          attitude_rating: attitudeRating,
          speed_rating: speedRating,
          comment,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Không gửi được đánh giá.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="review-modal-title" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex justify-between items-center pb-3 border-b border-[#edf2ee]">
          <div>
            <h3 id="review-modal-title" className="font-extrabold text-[#1a2d24] text-base">
              {type === 'product' ? 'Đánh giá sản phẩm' : 'Đánh giá chất lượng Shipper'}
            </h3>
            <p className="text-xs text-[#7d8f85] mt-0.5">{targetTitle}</p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="-mr-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {error && <div className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {type === 'product' ? (
            <div>
              <label className="text-xs font-bold text-[#3d5045]">Chất lượng sản phẩm</label>
              <div className="mt-1 flex gap-2 text-2xl">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    className={`focus:outline-none transition hover:scale-110 ${s <= rating ? 'text-amber-400' : 'text-slate-300'}`}
                  >
                    ★
                  </button>
                ))}
                <span className="text-xs font-bold text-slate-600 self-center ml-2">{rating}/5 sao</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-[#3d5045]">Đánh giá chung dịch vụ giao hàng</label>
                <div className="flex gap-2 text-2xl">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      className={`focus:outline-none transition hover:scale-110 ${s <= rating ? 'text-amber-400' : 'text-slate-300'}`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-600 self-center ml-2">{rating}/5 sao</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Thái độ phục vụ của Shipper</label>
                <div className="flex gap-2 text-xl">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAttitudeRating(s)}
                      className={s <= attitudeRating ? 'text-amber-400' : 'text-slate-300'}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs text-slate-600 self-center ml-2">{attitudeRating} sao</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#3d5045]">Tốc độ & Thời gian giao hàng</label>
                <div className="flex gap-2 text-xl">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeedRating(s)}
                      className={s <= speedRating ? 'text-amber-400' : 'text-slate-300'}
                    >
                      ★
                    </button>
                  ))}
                  <span className="text-xs text-slate-600 self-center ml-2">{speedRating} sao</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-[#3d5045]">Nhận xét chi tiết</label>
            <textarea
              rows={3}
              required
              placeholder="Chia sẻ cảm nhận chân thực của bạn về trải nghiệm lần này..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2.5 text-xs focus:border-[#176b52] focus:outline-none"
            />
          </div>

          {type === 'product' && (
            <div>
              <label className="text-xs font-bold text-[#3d5045]">Hình ảnh chụp thực tế (URL)</label>
              <input
                type="text"
                placeholder="Dán đường dẫn ảnh sản phẩm nếu có..."
                value={images}
                onChange={e => setImages(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#d2ddd5] p-2 text-xs focus:border-[#176b52] focus:outline-none"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#d2ddd5] px-4 py-2 text-xs font-semibold text-[#5c6e64]"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[#176b52] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#125340] disabled:opacity-50"
            >
              {busy ? 'Đang gửi…' : 'Gửi đánh giá'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
