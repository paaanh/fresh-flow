'use client';

import { useState } from 'react';

export default function ProductImageField({ value, onChange, onBusyChange }: { value: string; onChange: (value: string) => void; onBusyChange: (busy: boolean) => void }) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  function chooseFile(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Vui lòng chọn ảnh JPG, PNG hoặc WebP.'); return; }
    if (file.size > 1024 * 1024) { setError('Vui lòng chọn ảnh nhỏ hơn hoặc bằng 1 MB.'); return; }
    setError('');
    setReading(true);
    onBusyChange(true);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.onerror = () => setError('Không đọc được ảnh. Vui lòng thử lại.');
    reader.onloadend = () => { setReading(false); onBusyChange(false); };
    reader.readAsDataURL(file);
  }

  return <div className="space-y-2 rounded-xl border border-[#e4e9e4] p-3">
    <label className="block text-xs font-semibold">Ảnh minh họa <span className="font-normal text-slate-400">(không bắt buộc)</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={reading} onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} className="mt-2 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-[#176b52]" />
    </label>
    <p className="text-xs text-slate-500">Chọn ảnh JPG, PNG, WebP tối đa 1 MB hoặc dán đường dẫn ảnh bên dưới.</p>
    <label className="block text-xs font-semibold">Đường dẫn ảnh
      <input type="text" value={value.startsWith('data:') ? '' : value} disabled={reading} onChange={event => { setError(''); onChange(event.target.value.trim()); }} placeholder="https://... hoặc /images/anh-san-pham.jpg" className="mt-2 w-full rounded-lg border px-3 py-2 text-xs" />
    </label>
    {reading && <p role="status" className="text-xs text-slate-500">Đang đọc ảnh…</p>}
    {value && <div className="flex items-center gap-3"><img key={value} src={value} alt="Ảnh minh họa sản phẩm" onError={() => setError('Không tải được ảnh. Kiểm tra đường dẫn hoặc chọn ảnh khác.')} onLoad={() => setError('')} className="h-24 w-24 rounded-xl border object-cover" /><button type="button" disabled={reading} onClick={() => { onChange(''); setError(''); }} className="text-xs font-semibold text-rose-600">Bỏ ảnh</button></div>}
    {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
  </div>;
}
