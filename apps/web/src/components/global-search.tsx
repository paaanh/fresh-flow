'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, endpoints, unwrapList } from '@/lib/api';
import { normalizeSearch } from '@/lib/search';
import { demoCustomers } from '@/lib/demo-customers';

type Product = { id: number; name: string; category: string };
type Order = { id: string; customer: string; status: string };
type Request = { id: number; name: string; customer: string; status: string };
type Customer = { id: string | number; name: string; email?: string; phone?: string };
type Result = { key: string; group: string; title: string; description: string; href: string };

export function searchResults(query: string, products: Product[], orders: Order[], requests: Request[], customers: Customer[]): Result[] {
  const term = normalizeSearch(query);
  if (!term) return [];
  const matches = (...values: string[]) => normalizeSearch(values.join(' ')).includes(term);
  return [
    ...products.filter(item => matches(item.name, item.category)).slice(0, 5).map(item => ({ key: `product-${item.id}`, group: 'Sản phẩm', title: item.name, description: item.category, href: `/products/${item.id}` })),
    ...orders.filter(item => matches(item.id, item.customer)).slice(0, 5).map(item => ({ key: `order-${item.id}`, group: 'Đơn hàng', title: item.id, description: `${item.customer} · ${item.status}`, href: `/orders/${encodeURIComponent(item.id)}` })),
    ...customers.filter(item => matches(item.name, item.email || '', item.phone || '')).slice(0, 5).map(item => ({ key: `customer-${item.id}`, group: 'Khách hàng', title: item.name, description: item.email || item.phone || 'Xem khách hàng', href: `/customers#customer-${item.id}` })),
    ...requests.filter(item => matches(item.name, item.customer, String(item.id))).slice(0, 5).map(item => ({ key: `request-${item.id}`, group: 'Yêu cầu mặt hàng', title: item.name, description: `${item.customer} · ${item.status}`, href: `/requests#request-${item.id}` })),
  ];
}

export default function GlobalSearch({ admin, apiState, products, orders, requests }: { admin: boolean; apiState: string; products: Product[]; orders: Order[]; requests: Request[] }) {
  const router = useRouter();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<{ orders: Order[]; requests: Request[]; customers: Customer[] }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, id]);

  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function shortcut(event: KeyboardEvent) { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); setOpen(true); } }
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', shortcut);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', shortcut); };
  }, []);

  useEffect(() => {
    if (!open || apiState !== 'live') return;
    let alive = true;
    setLoading(true); setError(''); setRemote(undefined);
    // These endpoints must return only records authorized for the current session.
    Promise.allSettled([api.get<any>(endpoints.orders), api.get<any>(endpoints.requests), admin ? api.get<any>(endpoints.customers) : Promise.resolve([])]).then(results => {
      if (!alive) return;
      const list = (index: number): any[] => { const result = results[index]; return result.status === 'fulfilled' ? unwrapList(result.value) : []; };
      setRemote({
        orders: list(0).map(item => ({ id: String(item.order_number || item.code || item.id), customer: item.customer_name || item.customer?.full_name || item.user?.full_name || '', status: item.status || '' })),
        requests: list(1).map(item => ({ id: Number(item.id), name: item.product_name || item.name || '', customer: item.customer_name || item.user?.full_name || '', status: item.status || '' })),
        customers: admin ? list(2).map(item => ({ id: item.id, name: item.full_name || item.name || '', email: item.email, phone: item.phone })) : [],
      });
      if (results.some(result => result.status === 'rejected')) setError('Một số dữ liệu chưa tải được. Đóng và mở lại tìm kiếm để thử lại.');
    }).catch(() => { if (alive) setError('Không tải được dữ liệu tìm kiếm.'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, admin, apiState]);

  const demoOrders = admin ? orders : orders.filter(order => order.customer === 'Nguyễn Ngọc Anh');
  const demoRequests = admin ? requests : requests.filter(request => request.customer === 'Bạn');

  const results = searchResults(query, products, apiState === 'live' ? remote?.orders || [] : apiState === 'demo' ? demoOrders : [], apiState === 'live' ? remote?.requests || [] : apiState === 'demo' ? demoRequests : [], apiState === 'live' ? remote?.customers || [] : apiState === 'demo' && admin ? demoCustomers : []);

  function select(result: Result) { setOpen(false); setQuery(''); setActive(-1); router.push(admin && !result.href.startsWith('/admin/') ? `/admin${result.href}` : result.href); }

  return <div ref={root} className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <label className="sr-only" htmlFor={id}>Tìm kiếm toàn hệ thống</label>
    <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-results`} aria-autocomplete="list" aria-activedescendant={active >= 0 && results[active] ? `${id}-${active}` : undefined} value={query} placeholder="Tìm kiếm nhanh…" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }} onKeyDown={event => {
      if (event.key === 'Escape') { setOpen(false); setActive(-1); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(current => results.length ? (current + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : -1); }
      if (event.key === 'Enter' && results.length) { event.preventDefault(); select(results[Math.max(0, Math.min(active, results.length - 1))]); }
    }} className="h-10 w-36 rounded-xl border border-[#e6ebe6] bg-white px-3 pr-10 text-xs outline-none focus:border-[#176b52] sm:w-56" />
    {query ? <button type="button" aria-label="Xóa tìm kiếm" onClick={() => { setQuery(''); setActive(-1); input.current?.focus(); }} className="absolute right-2 top-2 h-6 w-6 text-slate-500">×</button> : <span aria-hidden="true" className="pointer-events-none absolute right-2 top-3 text-[9px] text-slate-400">⌘K</span>}
    {open && <div className="absolute right-0 top-full z-50 mt-2 max-h-[65vh] w-[min(420px,85vw)] overflow-y-auto rounded-xl border bg-white p-2 shadow-xl">
      {loading && <p role="status" className="p-3 text-xs text-slate-500">Đang tải dữ liệu…</p>}
      {error && <p role="status" className="p-3 text-xs text-amber-700">{error}</p>}
      <div id={`${id}-results`} role="listbox" aria-label="Kết quả tìm kiếm">
        {!query.trim() ? <p className="p-3 text-xs text-slate-500">{admin ? 'Tìm sản phẩm, mã đơn, khách hàng hoặc yêu cầu mặt hàng.' : 'Tìm sản phẩm, đơn hàng và yêu cầu của bạn.'}</p> : results.length ? results.map((result, index) => <div key={result.key}>
          {(index === 0 || results[index - 1].group !== result.group) && <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase text-slate-400">{result.group}</p>}
          <button id={`${id}-${index}`} role="option" aria-selected={active === index} onClick={() => select(result)} className={`block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100 ${active === index ? 'bg-slate-100' : 'bg-white'}`}><b className="block text-xs text-[#176b52]">{result.title}</b><span className="mt-1 block text-xs text-slate-500">{result.description}</span></button>
        </div>) : !loading && <p role="status" className="p-3 text-xs text-slate-500">Không tìm thấy kết quả phù hợp.</p>}
      </div>
    </div>}
  </div>;
}
