'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faXmark } from '@fortawesome/free-solid-svg-icons';
import { productImage } from '@/components/product-photo';
import type { Product } from '@/types/domain';

export type ProductDraft = {
  name: string;
  description: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
  image_url: string;
  /** 0 = không có chương trình Sale */
  sale_price: number;
  /** datetime-local strings ('' = không giới hạn) */
  sale_start_at: string;
  sale_end_at: string;
};

const emptyDraft: ProductDraft = { name: '', description: '', category: '', unit: 'kg', price: 0, stock: 0, image_url: '', sale_price: 0, sale_start_at: '', sale_end_at: '' };

/** ISO -> value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Sale fields for the products API (null clears the Sale). */
export function salePayload(draft: Pick<ProductDraft, 'sale_price' | 'sale_start_at' | 'sale_end_at'>) {
  const on = draft.sale_price > 0;
  return {
    sale_price: on ? draft.sale_price : null,
    sale_start_at: on && draft.sale_start_at ? new Date(draft.sale_start_at).toISOString() : null,
    sale_end_at: on && draft.sale_end_at ? new Date(draft.sale_end_at).toISOString() : null,
  };
}

export default function ProductEditorModal({
  product,
  categories,
  categoryLabels,
  onClose,
  onSave,
}: {
  product: Product | null;
  categories: string[];
  /** Optional display label per category ("Rau củ › Rau lá"). */
  categoryLabels?: Record<string, string>;
  onClose: () => void;
  onSave: (draft: ProductDraft, product?: Product) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const categoriesVersion = categories.join('|');

  useEffect(() => {
    setDraft(product ? {
      name: product.name,
      description: product.description || '',
      category: product.category,
      unit: product.unit,
      price: product.base_price ?? product.price,
      stock: product.available,
      image_url: product.image || '',
      sale_price: product.sale_price && product.sale_status !== 'EXPIRED' ? product.sale_price : 0,
      sale_start_at: product.sale_status !== 'EXPIRED' ? toLocalInput(product.sale_start_at) : '',
      sale_end_at: product.sale_status !== 'EXPIRED' ? toLocalInput(product.sale_end_at) : '',
    } : { ...emptyDraft, category: categoriesVersion.split('|')[0] || '' });
    setError('');
  }, [product, categoriesVersion]);

  const update = (key: keyof ProductDraft, value: string | number) => setDraft(current => ({ ...current, [key]: value }));

  const uploadImage = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setError('');
    try {
      const { freshflow } = await import('@/lib/api');
      const result = await freshflow.uploadImage<{ image_url: string }>(form);
      update('image_url', result.image_url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được ảnh lên.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.category || !draft.unit.trim() || draft.price <= 0 || draft.stock < 0) return;
    if (draft.sale_price > 0 && draft.sale_price >= draft.price) {
      setError('Giá Sale phải thấp hơn giá gốc.');
      return;
    }
    if (draft.sale_price > 0 && draft.sale_start_at && draft.sale_end_at && new Date(draft.sale_end_at) <= new Date(draft.sale_start_at)) {
      setError('Thời gian kết thúc Sale phải sau thời gian bắt đầu.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (await onSave(draft, product || undefined)) onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
      <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 id="product-editor-title" className="text-lg font-extrabold text-[#1a2d24]">{product ? 'Cập nhật mặt hàng' : 'Thêm mặt hàng'}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <label className="block text-xs font-semibold">Tên mặt hàng<input required value={draft.name} onChange={e => update('name', e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="block text-xs font-semibold">Mô tả<textarea value={draft.description} onChange={e => update('description', e.target.value)} rows={3} className="mt-1 w-full rounded-xl border p-3" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Danh mục<select required value={draft.category} onChange={e => update('category', e.target.value)} className="mt-1 w-full rounded-xl border p-3">{categories.map(category => <option key={category} value={category}>{categoryLabels?.[category] || category}</option>)}</select></label>
          <label className="text-xs font-semibold">Đơn vị<input required value={draft.unit} onChange={e => update('unit', e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="text-xs font-semibold">Giá gốc (₫)<input required min="1" type="number" value={draft.price || ''} onChange={e => update('price', Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3" /></label>
          {!product && <label className="text-xs font-semibold">Tồn kho ban đầu<input required min="0" step="0.001" type="number" value={draft.stock} onChange={e => update('stock', Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3" /></label>}
        </div>
        {product && <fieldset className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
          <legend className="px-1 text-xs font-bold text-rose-700">Chương trình Sale</legend>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={draft.sale_price > 0}
              onChange={e => update('sale_price', e.target.checked ? Math.max(1, Math.round(draft.price * 0.9)) : 0)}
              className="h-4 w-4 accent-rose-600"
            />
            Áp dụng giá Sale
          </label>
          {draft.sale_price > 0 && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-semibold">Giá Sale (₫)<input min="1" type="number" value={draft.sale_price || ''} onChange={e => update('sale_price', Number(e.target.value))} className="mt-1 w-full rounded-xl border bg-white p-3" /></label>
              <label className="text-xs font-semibold">Bắt đầu<input type="datetime-local" value={draft.sale_start_at} onChange={e => update('sale_start_at', e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-3" /></label>
              <label className="text-xs font-semibold">Kết thúc<input type="datetime-local" value={draft.sale_end_at} onChange={e => update('sale_end_at', e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-3" /></label>
              <p className="text-[11px] text-slate-500 sm:col-span-3">
                {draft.price > 0 && draft.sale_price < draft.price ? `Giảm ${Math.round((1 - draft.sale_price / draft.price) * 100)}% so với giá gốc. ` : ''}
                Để trống thời gian = áp dụng ngay / không giới hạn. Đơn hàng đã đặt trước đó giữ nguyên giá.
              </p>
            </div>
          )}
        </fieldset>}
        <div>
          <label className="mb-1 block text-xs font-semibold">Ảnh sản phẩm</label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-xl border px-4 py-2 text-xs font-semibold text-[#176b52]"><FontAwesomeIcon icon={faImage} className="mr-2" />Chọn ảnh<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => void uploadImage(e.target.files?.[0])} /></label>
            {draft.image_url && <img src={productImage({ name: draft.name || 'Ảnh mặt hàng', image: draft.image_url })} alt="Ảnh xem trước" className="h-14 w-14 rounded-lg object-cover" />}
            <span className="text-[11px] text-slate-500">JPG, PNG hoặc WebP (tối đa 5 MB)</span>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">Hủy</button><button disabled={busy} className="rounded-xl bg-[#176b52] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Đang lưu…' : 'Lưu mặt hàng'}</button></div>
      </form>
    </div>
  );
}
