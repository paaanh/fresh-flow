'use client';

import dynamic from 'next/dynamic';
import DOMPurify from 'dompurify';
import { useMemo, type ComponentType } from 'react';

/* TinyMCE is self-hosted under /public/tinymce (copied by scripts/copy-tinymce.cjs) — no API key, no CDN. */
// (cast: the wrapper's legacy propTypes do not match next/dynamic's typing)
const Editor = dynamic<any>(() => import('@tinymce/tinymce-react').then(m => m.Editor as unknown as ComponentType<any>), {
  ssr: false,
  loading: () => <div className="h-[240px] animate-pulse rounded-xl border border-[#d2ddd5] bg-[#f6f9f7]" aria-hidden />,
});

/** Tags / attributes a post description may contain (everything else is stripped). */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ul', 'ol', 'li', 'a', 'h2', 'h3', 'h4', 'blockquote', 'hr'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'style'];

const looksLikeHtml = (text: string) => /<\/?[a-z][\s\S]*>/i.test(text);
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Safe HTML for a description: old plain-text posts keep their line breaks. */
export function toSafeHtml(content: string): string {
  const raw = looksLikeHtml(content || '') ? content : escapeHtml(content || '').replace(/\n/g, '<br>');
  if (typeof window === 'undefined') return '';
  const clean = DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
  // links open in a new tab and cannot reach back into the app
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer nofollow" ');
}

/** Plain text of a description (length checks, previews, sharing). */
export function toPlainText(content: string): string {
  if (!looksLikeHtml(content || '')) return content || '';
  if (typeof window === 'undefined') return content.replace(/<[^>]+>/g, ' ');
  const div = document.createElement('div');
  div.innerHTML = DOMPurify.sanitize(content);
  return (div.textContent || '').replace(/\s+\n/g, '\n').trim();
}

export function RichTextView({ content, className = '' }: { content: string; className?: string }) {
  const html = useMemo(() => toSafeHtml(content), [content]);
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  height = 260,
  label,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  height?: number;
  label?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d2ddd5] focus-within:border-[#176b52]" aria-label={label}>
      <Editor
        tinymceScriptSrc="/tinymce/tinymce.min.js"
        licenseKey="gpl"
        value={value}
        onEditorChange={(html: string) => onChange(html)}
        init={{
          height,
          menubar: false,
          statusbar: false,
          branding: false,
          promotion: false,
          placeholder,
          language: undefined,
          plugins: 'lists link autolink emoticons autoresize',
          toolbar: 'blocks | bold italic underline forecolor | bullist numlist | link emoticons | removeformat',
          toolbar_mode: 'sliding',
          block_formats: 'Đoạn văn=p; Tiêu đề lớn=h2; Tiêu đề nhỏ=h3',
          // keep Vietnamese letters as they are (not &agrave; …): readable data, and word filters keep working
          entity_encoding: 'raw',
          link_default_target: '_blank',
          link_assume_external_targets: true,
          autoresize_bottom_margin: 12,
          min_height: height,
          max_height: 560,
          content_style:
            "body{font-family:'Be Vietnam Pro',system-ui,sans-serif;font-size:14px;line-height:1.6;color:#1e2d25;margin:10px 12px} p{margin:0 0 .5em} h2{font-size:1.15em;margin:.6em 0 .3em} h3{font-size:1.02em;margin:.5em 0 .3em}",
        }}
      />
    </div>
  );
}
