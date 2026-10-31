import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';

export default function ProductSearch({ value, onChange, count }: { value: string; onChange: (value: string) => void; count: number }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3">
    <label className="relative block w-full sm:max-w-md">
      <span className="sr-only">Tìm kiếm sản phẩm</span>
      <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400" />
      <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder="Tìm tên sản phẩm (có dấu hoặc không dấu)…" className="h-11 w-full rounded-xl border border-[#e0e7e1] bg-white pl-11 pr-11 text-sm outline-none focus:border-[#176b52] [&::-webkit-search-cancel-button]:hidden" />
      {value && <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => onChange('')} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><FontAwesomeIcon icon={faXmark} /></button>}
    </label>
    <span role="status" className="text-xs text-slate-500">{count === 0 ? 'Không có sản phẩm phù hợp. Hãy thử từ khóa hoặc danh mục khác.' : `${count} sản phẩm`}</span>
  </div>;
}
