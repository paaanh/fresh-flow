'use client';

import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate, faCloudArrowUp, faLink, faTrash } from '@fortawesome/free-solid-svg-icons';
import { freshflow } from '@/lib/api';
import { productImage } from '@/components/product-photo';

export const SAMPLE_PRODUCE_IMAGES = [
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=900&q=80',
];

export const MAX_POST_IMAGES = 10;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

/** Uploaded images are stored by the API under /media/...; resolve them to a full URL for <img>. */
export const resolvePostImage = (url: string) => productImage({ name: '', image: url });

async function uploadFile(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error(`"${file.name}": chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.`);
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" vượt quá 5 MB.`);
  const form = new FormData();
  form.append('file', file);
  const result = await freshflow.uploadImage<{ image_url: string }>(form);
  return result.image_url;
}

/**
 * Image album editor for posts: upload from the computer, paste a URL or pick one of the
 * sample photos; every tile can be previewed, replaced or removed. Images are uploaded to
 * the server immediately, so only stored URLs end up in the post.
 */
export function PostImageManager({
  images,
  onChange,
  labels = {},
}: {
  images: string[];
  onChange: (next: string[]) => void;
  /** image url -> product name, for photos that come from a product of the post */
  labels?: Record<string, string>;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);

  const room = MAX_POST_IMAGES - images.length;

  const add = (list: string[]) => {
    const next = [...images];
    list.forEach(u => {
      if (u && !next.includes(u) && next.length < MAX_POST_IMAGES) next.push(u);
    });
    onChange(next);
  };

  const uploadMany = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError('');
    const uploaded: string[] = [];
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, room))) {
        uploaded.push(await uploadFile(file));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được ảnh lên.');
    } finally {
      if (uploaded.length) add(uploaded);
      setBusy(false);
      if (addInput.current) addInput.current.value = '';
    }
  };

  const replace = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || replaceIndex === null) return;
    setBusy(true);
    setError('');
    try {
      const stored = await uploadFile(file);
      onChange(images.map((u, i) => (i === replaceIndex ? stored : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thay được ảnh.');
    } finally {
      setBusy(false);
      setReplaceIndex(null);
      if (replaceInput.current) replaceInput.current.value = '';
    }
  };

  const addUrl = () => {
    const clean = url.trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) {
      setError('Đường dẫn ảnh phải bắt đầu bằng http:// hoặc https://');
      return;
    }
    setError('');
    add([clean]);
    setUrl('');
  };

  return (
    <div className="space-y-3">
      <input ref={addInput} type="file" accept={ACCEPTED.join(',')} multiple className="hidden" onChange={e => void uploadMany(e.target.files)} />
      <input ref={replaceInput} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={e => void replace(e.target.files)} />

      <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <button
          type="button"
          disabled={busy || room <= 0}
          onClick={() => addInput.current?.click()}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#176b52] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#125340] disabled:opacity-50"
        >
          <FontAwesomeIcon icon={faCloudArrowUp} /> {busy ? 'Đang tải ảnh…' : 'Tải ảnh từ máy'}
        </button>
        <div className="flex min-w-0 gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Dán đường dẫn ảnh</span>
            <FontAwesomeIcon icon={faLink} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="Hoặc dán link ảnh https://…"
              className="w-full rounded-xl border border-[#d2ddd5] py-2.5 pl-8 pr-3 text-xs focus:border-[#176b52] focus:outline-none"
            />
          </label>
          <button type="button" onClick={addUrl} disabled={room <= 0 || !url.trim()} title={url.trim() ? undefined : 'Dán link ảnh vào ô bên cạnh trước'} className="shrink-0 rounded-xl border border-[#d2ddd5] bg-white px-3 text-xs font-bold text-[#176b52] hover:bg-emerald-50 disabled:opacity-50">
            Thêm
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold text-slate-400">Ảnh mẫu:</span>
        {SAMPLE_PRODUCE_IMAGES.map((sample, idx) => {
          const used = images.includes(sample);
          return (
            <button
              key={sample}
              type="button"
              disabled={used || room <= 0}
              onClick={() => add([sample])}
              className="rounded-lg border border-[#d2ddd5] bg-[#f8faf8] px-2 py-1 font-semibold text-[#176b52] hover:bg-emerald-50 disabled:opacity-40"
            >
              {used ? '✓' : '+'} Ảnh #{idx + 1}
            </button>
          );
        })}
        <span className="ml-auto text-slate-400">{images.length}/{MAX_POST_IMAGES} ảnh · JPG/PNG/WebP ≤ 5 MB</span>
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{error}</p>}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {images.map((img, idx) => (
            <li key={img + idx} className="group relative aspect-video overflow-hidden rounded-xl border border-[#e3ece6] bg-slate-100">
              <img src={resolvePostImage(img)} alt={`Ảnh ${idx + 1}`} className="h-full w-full object-cover" />
              {idx === 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">Ảnh bìa</span>}
              {labels[img] && (
                <span className="absolute inset-x-1.5 bottom-9 truncate rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-[#176b52] shadow-sm" title={`Ảnh của mặt hàng ${labels[img]}`}>
                  🔗 {labels[img]}
                </span>
              )}
              <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1">
                <button
                  type="button"
                  title="Thay ảnh"
                  aria-label={`Thay ảnh ${idx + 1}`}
                  disabled={busy}
                  onClick={() => {
                    setReplaceIndex(idx);
                    replaceInput.current?.click();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[11px] text-[#176b52] shadow hover:bg-white"
                >
                  <FontAwesomeIcon icon={faArrowsRotate} />
                </button>
                <button
                  type="button"
                  title="Xóa ảnh"
                  aria-label={`Xóa ảnh ${idx + 1}`}
                  onClick={() => onChange(images.filter((_, i) => i !== idx))}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-[11px] text-white shadow hover:bg-rose-600"
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-[#d8e0d8] p-4 text-center text-[11px] text-slate-400">Chưa có ảnh. Ảnh của mặt hàng bạn thêm vào bài sẽ tự hiện ở đây.</p>
      )}
    </div>
  );
}
