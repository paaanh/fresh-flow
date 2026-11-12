'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faTrash } from '@fortawesome/free-solid-svg-icons';
import UserAvatar from '@/components/user-avatar';
import { freshflow } from '@/lib/api';
import type { Post, PostComment, User } from '@/types/domain';
import { relativeTime } from './utils';

export type PostCommentsHandle = { focus: () => void };

/**
 * Comments shown directly under a post (like Facebook): the latest comments are always
 * visible together with the input; "Xem tất cả" loads the full thread. Both follow the
 * post data, which the feed refreshes through realtime events / polling, so new comments
 * from other people appear without clicking anything.
 */
const GROUP_TONES = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-800',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
];
/** Same group, same colour everywhere. */
const groupTone = (code: string) => GROUP_TONES[[...code].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % GROUP_TONES.length];

const PostComments = forwardRef<PostCommentsHandle, { post: Post; currentUser?: User; groupLabel?: (code?: string | null) => string; onCountChange: (count: number) => void }>(
  function PostComments({ post, currentUser, groupLabel, onCountChange }, ref) {
    const [all, setAll] = useState<PostComment[] | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [mine, setMine] = useState<PostComment[]>([]); // just sent, until the next refresh includes them
    const [removed, setRemoved] = useState<number[]>([]);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const input = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

    const total = post.comment_count || 0;

    // Full thread: (re)load when opened and whenever the number of comments changes
    useEffect(() => {
      if (!expanded) return;
      let alive = true;
      freshflow
        .postComments<PostComment>(post.id)
        .then(list => {
          if (!alive) return;
          setAll(list);
          setMine([]);
        })
        .catch(e => alive && setError(e instanceof Error ? e.message : 'Không tải được bình luận'));
      return () => {
        alive = false;
      };
    }, [expanded, post.id, total]);

    const base = expanded && all ? all : post.recent_comments || [];
    const seen = new Set(base.map(c => c.id));
    const shown = [...base, ...mine.filter(c => !seen.has(c.id))].filter(c => !removed.includes(c.id));
    const hidden = Math.max(0, total - shown.length);

    const send = async (e: React.FormEvent) => {
      e.preventDefault();
      const content = text.trim();
      if (!content) return;
      setBusy(true);
      setError('');
      try {
        const created = await freshflow.addPostComment<PostComment>(post.id, content);
        setMine(v => [...v, created]);
        onCountChange(total + 1);
        setText('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không gửi được bình luận');
      } finally {
        setBusy(false);
      }
    };

    const remove = async (c: PostComment) => {
      try {
        await freshflow.deletePostComment(post.id, c.id);
        setRemoved(v => [...v, c.id]);
        onCountChange(Math.max(0, total - 1));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không xóa được bình luận');
      }
    };

    const canDelete = (c: PostComment) =>
      currentUser && (currentUser.role === 'ADMIN' || c.user_id === currentUser.id || post.author_id === currentUser.id);

    if (!currentUser && shown.length === 0) return null;

    return (
      <div className="space-y-2 border-t border-[#edf2ee] bg-[#fbfdfb] px-3 py-2.5 sm:px-4">
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className="text-[11px] font-bold text-slate-500 hover:text-[#176b52]">
            Xem tất cả {total} bình luận
          </button>
        )}
        {shown.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {shown.map(c => (
              <li key={c.id} className="flex items-start gap-2">
                <UserAvatar name={c.author_name} avatarUrl={c.author_avatar_url} size="xs" />
                <div className="min-w-0 flex-1 rounded-2xl bg-[#f1f5f2] px-3 py-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <b className="text-[11px] text-[#1e2d25]">{c.author_name}</b>
                    {c.author_role === 'SHOP' && <span className="rounded bg-emerald-100 px-1 text-[10px] font-bold text-[#176b52]">Shop</span>}
                    {c.author_role === 'ADMIN' && <span className="rounded bg-slate-200 px-1 text-[10px] font-bold text-slate-700">Quản trị</span>}
                    {c.author_group && (
                      <span className={`rounded px-1.5 text-[10px] font-bold ${groupTone(c.author_group)}`} title="Nhóm khách hàng">
                        {groupLabel?.(c.author_group) || c.author_group}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{relativeTime(c.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-line break-words text-xs text-[#33463c]">{c.content}</p>
                </div>
                {canDelete(c) && (
                  <button type="button" onClick={() => void remove(c)} aria-label="Xóa bình luận" className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-300 hover:text-rose-500">
                    <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {expanded && total > 2 && (
          <button type="button" onClick={() => setExpanded(false)} className="text-[11px] font-bold text-slate-500 hover:text-[#176b52]">Thu gọn bình luận</button>
        )}
        {error && <p role="alert" className="text-[11px] font-semibold text-rose-600">{error}</p>}
        {currentUser && (
          <form onSubmit={send} className="flex items-center gap-2">
            <input
              ref={input}
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={1000}
              placeholder="Viết bình luận hoặc hỏi nguồn hàng…"
              aria-label="Viết bình luận"
              enterKeyHint="send"
              className="min-w-0 flex-1 rounded-full border border-[#d2ddd5] bg-white px-3.5 py-2 text-base focus:border-[#176b52] focus:outline-none sm:text-xs"
            />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Gửi bình luận" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#176b52] text-white disabled:opacity-40">
              <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
            </button>
          </form>
        )}
      </div>
    );
  },
);

export default PostComments;
