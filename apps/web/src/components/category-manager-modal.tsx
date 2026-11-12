'use client';

import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightArrowLeft, faChevronRight, faFolder, faFolderOpen, faFolderPlus, faFolderTree, faMagnifyingGlass, faPlus, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
import { freshflow } from '@/lib/api';
import { normalizeSearch } from '@/lib/search';

export type CategoryNode = { id: number; name: string; parent_id?: number | null };

/** Categories in tree order with their depth ("Rau củ", "— Rau lá", "— — Rau thơm"). */
export function categoryTree(categories: CategoryNode[]): { cat: CategoryNode; depth: number }[] {
  const ids = new Set(categories.map(c => c.id));
  const children = new Map<number | null, CategoryNode[]>();
  categories.forEach(c => {
    const parent = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    children.set(parent, [...(children.get(parent) || []), c]);
  });
  children.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, 'vi')));
  const out: { cat: CategoryNode; depth: number }[] = [];
  const walk = (parent: number | null, depth: number, seen: Set<number>) => {
    for (const c of children.get(parent) || []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ cat: c, depth });
      walk(c.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

/** Names of a category and all its sub-categories (for "show everything in Rau củ"). */
export function categoryWithChildren(categories: CategoryNode[], name: string): Set<string> {
  const root = categories.find(c => c.name === name);
  const out = new Set<string>([name]);
  if (!root) return out;
  let frontier = [root.id];
  while (frontier.length) {
    const next = categories.filter(c => c.parent_id != null && frontier.includes(c.parent_id) && !out.has(c.name));
    next.forEach(c => out.add(c.name));
    frontier = next.map(c => c.id);
  }
  return out;
}

/** Label with the parent path, e.g. "Rau củ › Rau lá". */
export function categoryPath(categories: CategoryNode[], cat: CategoryNode): string {
  const parts = [cat.name];
  let node = cat;
  const seen = new Set([cat.id]);
  while (node.parent_id) {
    const parent = categories.find(c => c.id === node.parent_id);
    if (!parent || seen.has(parent.id)) break;
    parts.unshift(parent.name);
    seen.add(parent.id);
    node = parent;
  }
  return parts.join(' › ');
}

type Mode =
  | { kind: 'add'; parentId: number | null }
  | { kind: 'rename'; id: number }
  | { kind: 'move'; id: number }
  | { kind: 'delete'; id: number };

export default function CategoryManagerModal({
  categories,
  onChange,
  onClose,
  notify,
  productCounts = {},
}: {
  categories: CategoryNode[];
  onChange: (next: CategoryNode[]) => void;
  onClose: () => void;
  notify: (message: string) => void;
  /** category name -> number of products filed directly in it */
  productCounts?: Record<string, number>;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState('');
  const [moveTo, setMoveTo] = useState<number | ''>('');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tree = useMemo(() => categoryTree(categories), [categories]);
  const childCount = (id: number) => categories.filter(c => c.parent_id === id).length;
  const byId = (id: number | null | undefined) => categories.find(c => c.id === id);

  /** Rows to show: the tree without collapsed branches, or every match when searching. */
  const rows = useMemo(() => {
    const q = normalizeSearch(search.trim());
    if (q) return tree.filter(t => normalizeSearch(t.cat.name).includes(q)).map(t => ({ ...t, depth: 0, path: categoryPath(categories, t.cat) }));
    const hidden = new Set<number>();
    return tree.filter(t => {
      if (t.cat.parent_id && (hidden.has(t.cat.parent_id) || collapsed.has(t.cat.parent_id))) {
        hidden.add(t.cat.id);
        return false;
      }
      return true;
    }).map(t => ({ ...t, path: '' }));
  }, [tree, search, collapsed, categories]);

  const start = (next: Mode) => {
    setError('');
    setMode(next);
    if (next.kind === 'rename') setText(byId(next.id)?.name || '');
    else if (next.kind === 'add') setText('');
    else if (next.kind === 'move') setMoveTo(byId(next.id)?.parent_id ?? '');
    if (next.kind === 'add' && next.parentId) setCollapsed(prev => { const s = new Set(prev); s.delete(next.parentId!); return s; });
  };
  const cancel = () => { setMode(null); setError(''); };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được.');
    } finally {
      setBusy(false);
    }
  };

  const saveAdd = (parentId: number | null) =>
    run(async () => {
      const clean = text.trim();
      if (!clean) return;
      const created = await freshflow.createCategory<any>(clean, undefined, parentId);
      onChange([...categories.filter(c => c.id !== Number(created.id)), { id: Number(created.id), name: created.name, parent_id: created.parent_id ?? null }]);
      notify(`Đã thêm danh mục "${clean}".`);
      setText(''); // stay open: add the next one right away
    });
  const saveRename = (id: number) =>
    run(async () => {
      const clean = text.trim();
      if (!clean || clean === byId(id)?.name) return cancel();
      const updated = await freshflow.updateCategory<any>(id, { name: clean });
      onChange(categories.map(c => (c.id === id ? { ...c, name: updated.name } : c)));
      notify('Đã đổi tên danh mục.');
      setMode(null);
    });
  const saveMove = (id: number) =>
    run(async () => {
      const updated = await freshflow.updateCategory<any>(id, { parent_id: moveTo || null });
      onChange(categories.map(c => (c.id === id ? { ...c, parent_id: updated.parent_id ?? null } : c)));
      notify(moveTo ? `Đã chuyển vào "${byId(Number(moveTo))?.name}".` : 'Đã chuyển lên cấp cao nhất.');
      setMode(null);
    });
  const confirmDelete = (cat: CategoryNode) =>
    run(async () => {
      const res = await freshflow.deleteCategory(cat.id);
      onChange(categories.filter(c => c.id !== cat.id).map(c => (c.parent_id === cat.id ? { ...c, parent_id: cat.parent_id ?? null } : c)));
      notify(`Đã xóa "${cat.name}"${res.moved_products ? ` — ${res.moved_products} sản phẩm chuyển lên "${byId(cat.parent_id)?.name}"` : ''}.`);
      setMode(null);
    });

  /** A category cannot move under itself or one of its own sub-categories. */
  const parentChoices = (id: number) => {
    const self = byId(id);
    const blocked = self ? categoryWithChildren(categories, self.name) : new Set<string>();
    return tree.filter(t => !blocked.has(t.cat.name));
  };

  const input = 'h-9 min-w-0 flex-1 rounded-lg border border-[#176b52] bg-white px-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-100';
  const btn = 'h-9 shrink-0 rounded-lg px-3 text-[11px] font-bold disabled:opacity-40';
  const keys = (onEnter: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  };

  const addRow = (parentId: number | null, depth: number) => (
    <li className="flex items-center gap-1.5 rounded-lg bg-emerald-50/70 py-1.5 pr-1.5" style={{ paddingLeft: `${0.5 + depth * 1.4}rem` }}>
      <FontAwesomeIcon icon={faFolderPlus} className="shrink-0 text-xs text-[#176b52]" />
      <input
        autoFocus
        value={text}
        maxLength={100}
        onChange={e => setText(e.target.value)}
        onKeyDown={keys(() => void saveAdd(parentId))}
        placeholder={parentId ? `Tên danh mục con của "${byId(parentId)?.name}"` : 'Tên danh mục mới'}
        aria-label={parentId ? `Tên danh mục con của ${byId(parentId)?.name}` : 'Tên danh mục mới'}
        className={input}
      />
      <button type="button" disabled={busy || !text.trim()} onClick={() => void saveAdd(parentId)} className={`${btn} bg-[#176b52] text-white`}>Thêm</button>
      <button type="button" onClick={cancel} className={`${btn} border border-[#d2ddd5] bg-white text-slate-600`}>Xong</button>
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="cat-title" onClick={e => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={e => { if (e.key === 'Escape' && !mode) onClose(); }}>
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 id="cat-title" className="flex items-center gap-2 text-base font-extrabold text-[#1a2d24]"><FontAwesomeIcon icon={faFolderTree} className="text-[#176b52]" /> Danh mục sản phẩm</h3>
            <p className="mt-0.5 text-xs text-slate-500">Bấm vào tên để đổi tên. “+ Con” thêm danh mục con ngay bên dưới.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><FontAwesomeIcon icon={faXmark} /></button>
        </div>

        <div className="flex shrink-0 gap-2 border-y border-[#edf2ee] bg-[#f8fbf9] px-5 py-2.5">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Tìm danh mục</span>
            <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm danh mục…" className="h-9 w-full rounded-lg border border-[#d2ddd5] bg-white pl-8 pr-3 text-xs focus:border-[#176b52] focus:outline-none" />
          </label>
          <button type="button" onClick={() => { setSearch(''); start({ kind: 'add', parentId: null }); }} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#176b52] px-3 text-xs font-bold text-white hover:bg-[#125340]">
            <FontAwesomeIcon icon={faPlus} /> Danh mục mới
          </button>
        </div>

        {error && <p role="alert" className="mx-5 mt-2 shrink-0 rounded-lg bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{error}</p>}

        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {mode?.kind === 'add' && mode.parentId === null && addRow(null, 0)}
          {rows.map(({ cat, depth, path }) => {
            const kids = childCount(cat.id);
            const count = productCounts[cat.name] || 0;
            const isCollapsed = collapsed.has(cat.id);
            const editing = mode && 'id' in mode && mode.id === cat.id ? mode.kind : null;
            const parent = byId(cat.parent_id);
            return (
              <li key={cat.id}>
                <div className={`group flex items-center gap-1 rounded-lg py-1 pr-1 ${editing ? 'bg-emerald-50/70' : 'hover:bg-[#f5f8f6]'}`} style={{ paddingLeft: `${0.25 + depth * 1.4}rem` }}>
                  {/* expand / collapse */}
                  {kids > 0 && !path ? (
                    <button type="button" onClick={() => setCollapsed(prev => { const s = new Set(prev); if (s.has(cat.id)) s.delete(cat.id); else s.add(cat.id); return s; })} aria-label={isCollapsed ? `Mở ${cat.name}` : `Thu gọn ${cat.name}`} aria-expanded={!isCollapsed} className="flex h-7 w-6 shrink-0 items-center justify-center text-slate-400 hover:text-[#176b52]">
                      <FontAwesomeIcon icon={faChevronRight} className={`text-[10px] transition ${isCollapsed ? '' : 'rotate-90'}`} />
                    </button>
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}
                  <FontAwesomeIcon icon={kids > 0 ? (isCollapsed ? faFolder : faFolderOpen) : faFolder} className={`shrink-0 text-xs ${depth === 0 ? 'text-[#176b52]' : 'text-[#7fae95]'}`} />

                  {editing === 'rename' ? (
                    <span className="ml-1.5 flex min-w-0 flex-1 items-center gap-1.5">
                      <input autoFocus value={text} maxLength={100} onChange={e => setText(e.target.value)} onKeyDown={keys(() => void saveRename(cat.id))} aria-label={`Tên mới của ${cat.name}`} className={input} />
                      <button type="button" disabled={busy || !text.trim()} onClick={() => void saveRename(cat.id)} className={`${btn} bg-[#176b52] text-white`}>Lưu</button>
                      <button type="button" onClick={cancel} className={`${btn} border border-[#d2ddd5] bg-white text-slate-600`}>Hủy</button>
                    </span>
                  ) : (
                    <>
                      <button type="button" onClick={() => start({ kind: 'rename', id: cat.id })} title="Bấm để đổi tên" className={`ml-1.5 min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-xs hover:bg-white ${depth === 0 ? 'font-extrabold text-[#1e2d25]' : 'font-semibold text-[#3d5045]'}`}>
                        {cat.name}
                        {path && path !== cat.name && <span className="ml-1.5 text-[10px] font-normal text-slate-400">{path}</span>}
                      </button>
                      <span className={`shrink-0 rounded-full px-1.5 text-[10px] font-bold ${count ? 'bg-slate-100 text-slate-600' : 'text-slate-300'}`} title="Số sản phẩm trong danh mục">{count} sp</span>
                      <span className="flex shrink-0 items-center">
                        <button type="button" onClick={() => start({ kind: 'add', parentId: cat.id })} aria-label={`Thêm danh mục con vào ${cat.name}`} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-[#176b52] hover:bg-emerald-50">
                          <FontAwesomeIcon icon={faPlus} className="text-[10px]" /><span className="hidden sm:inline">Con</span>
                        </button>
                        <button type="button" onClick={() => start({ kind: 'move', id: cat.id })} aria-label={`Chuyển ${cat.name} sang danh mục khác`} title="Chuyển vào danh mục khác" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                          <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-[11px]" />
                        </button>
                        <button type="button" onClick={() => start({ kind: 'delete', id: cat.id })} aria-label={`Xóa ${cat.name}`} title="Xóa" className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50">
                          <FontAwesomeIcon icon={faTrash} className="text-[11px]" />
                        </button>
                      </span>
                    </>
                  )}
                </div>

                {/* move: pick the new parent right here */}
                {editing === 'move' && (
                  <div className="my-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-50/70 p-2" style={{ marginLeft: `${1.75 + depth * 1.4}rem` }}>
                    <span className="text-[11px] font-semibold text-slate-600">Chuyển “{cat.name}” vào:</span>
                    <select autoFocus value={moveTo} onChange={e => setMoveTo(e.target.value ? Number(e.target.value) : '')} aria-label={`Danh mục cha mới của ${cat.name}`} className="h-9 min-w-0 flex-1 rounded-lg border border-[#d2ddd5] bg-white px-2 text-xs">
                      <option value="">— Cấp cao nhất —</option>
                      {parentChoices(cat.id).map(t => <option key={t.cat.id} value={t.cat.id}>{'— '.repeat(t.depth)}{t.cat.name}</option>)}
                    </select>
                    <button type="button" disabled={busy} onClick={() => void saveMove(cat.id)} className={`${btn} bg-[#176b52] text-white`}>Chuyển</button>
                    <button type="button" onClick={cancel} className={`${btn} border border-[#d2ddd5] bg-white text-slate-600`}>Hủy</button>
                  </div>
                )}

                {/* delete: explain what happens, confirm here */}
                {editing === 'delete' && (
                  <div className="my-1 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px]" style={{ marginLeft: `${1.75 + depth * 1.4}rem` }}>
                    {!parent && count > 0 ? (
                      <>
                        <p className="text-rose-800">“{cat.name}” còn <b>{count} sản phẩm</b> nên chưa xóa được. Hãy chuyển các sản phẩm sang danh mục khác, hoặc đặt “{cat.name}” vào một danh mục cha (sản phẩm sẽ theo lên danh mục cha khi xóa).</p>
                        <div className="mt-2 flex gap-1.5">
                          <button type="button" onClick={() => start({ kind: 'move', id: cat.id })} className={`${btn} h-8 bg-white text-[#176b52] ring-1 ring-[#cfe3d6]`}>Đặt vào danh mục cha…</button>
                          <button type="button" onClick={cancel} className={`${btn} h-8 border border-[#d2ddd5] bg-white text-slate-600`}>Đóng</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-rose-800">
                          Xóa “<b>{cat.name}</b>”?
                          {parent && count > 0 && <> {count} sản phẩm sẽ chuyển lên “{parent.name}”.</>}
                          {kids > 0 && <> {kids} danh mục con sẽ chuyển {parent ? `lên “${parent.name}”` : 'lên cấp cao nhất'}.</>}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <button type="button" disabled={busy} onClick={() => void confirmDelete(cat)} className={`${btn} h-8 bg-rose-600 text-white`}>Xóa danh mục</button>
                          <button type="button" onClick={cancel} className={`${btn} h-8 border border-[#d2ddd5] bg-white text-slate-600`}>Hủy</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {mode?.kind === 'add' && mode.parentId === cat.id && <ul>{addRow(cat.id, depth + 1)}</ul>}
              </li>
            );
          })}
          {rows.length === 0 && <li className="p-6 text-center text-xs text-slate-400">{search ? 'Không có danh mục phù hợp.' : 'Chưa có danh mục.'}</li>}
        </ul>

        <div className="shrink-0 border-t border-[#edf2ee] px-5 py-2.5 text-[11px] text-slate-500">
          {categories.length} danh mục · {tree.filter(t => t.depth === 0).length} danh mục gốc
        </div>
      </div>
    </div>
  );
}
