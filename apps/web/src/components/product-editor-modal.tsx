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
};

const emptyDraft: ProductDraft = { name: '', description: '', category: '', unit: 'kg', price: 0, stock: 0, image_url: '' };

export default function ProductEditorModal({
  product,
  categories,
  onClose,
  onSave,
}: {
  product: Product | null;
  categories: string[];
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="product-editor-title">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="product-editor-title" className="text-lg font-extrabold text-[#1a2d24]">{product ? 'Cập nhật mặt hàng' : 'Thêm mặt hàng'}</h2>
          <button type="button" onClick={onClose} aria-label="Đóng"><FontAwesomeIcon icon={faXmark} /></button>
        </div>
        <label className="block text-xs font-semibold">Tên mặt hàng<input required value={draft.name} onChange={e => update('name', e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
        <label className="block text-xs font-semibold">Mô tả<textarea value={draft.description} onChange={e => update('description', e.target.value)} rows={3} className="mt-1 w-full rounded-xl border p-3" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">Danh mục<select required value={draft.category} onChange={e => update('category', e.target.value)} className="mt-1 w-full rounded-xl border p-3">{categories.map(category => <option key={category}>{category}</option>)}</select></label>
          <label className="text-xs font-semibold">Đơn vị<input required value={draft.unit} onChange={e => update('unit', e.target.value)} className="mt-1 w-full rounded-xl border p-3" /></label>
          <label className="text-xs font-semibold">Giá bán (₫)<input required min="1" type="number" value={draft.price || ''} onChange={e => update('price', Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3" /></label>
          {!product && <label className="text-xs font-semibold">Tồn kho ban đầu<input required min="0" step="0.001" type="number" value={draft.stock} onChange={e => update('stock', Number(e.target.value))} className="mt-1 w-full rounded-xl border p-3" /></label>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold">Ảnh sản phẩm</label>
          <div className="flex items-center gap-3">
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
