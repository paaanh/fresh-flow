'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

/**
 * A row of chips that scrolls sideways: swipe (touch), drag or wheel (mouse, see lib/drag-scroll),
 * and ‹ › buttons that appear only on the side where chips are hidden.
 */
export default function ScrollRow({
  children,
  className = '',
  label,
  role = 'tablist',
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
  /** 'tablist' for tabs / filters; pass undefined for a plain list (as="ul"). */
  role?: string;
  as?: 'div' | 'ul';
}) {
  const ref = useRef<HTMLElement>(null);
  const Row = as as 'div';
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < el.scrollWidth - el.clientWidth - 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [measure, children]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className="relative min-w-0 flex-1">
      <Row
        ref={ref as React.RefObject<HTMLDivElement>}
        onScroll={measure}
        role={role}
        aria-label={label}
        className={`flex min-w-0 overflow-x-auto scrollbar-hide ${/gap-/.test(className) ? '' : 'gap-1.5'} ${edges.left || edges.right ? 'cursor-grab' : ''} ${className}`}
      >
        {children}
      </Row>
      {edges.left && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white to-transparent" />
          <button
            type="button"
            onClick={() => page(-1)}
            aria-label="Xem các mục phía trước"
            className="absolute left-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#dfe7e1] bg-white text-[#176b52] shadow-sm hover:bg-emerald-50 sm:flex"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="text-[11px]" />
          </button>
        </>
      )}
      {edges.right && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" />
          <button
            type="button"
            onClick={() => page(1)}
            aria-label="Xem thêm các mục phía sau"
            className="absolute right-0 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#dfe7e1] bg-white text-[#176b52] shadow-sm hover:bg-emerald-50 sm:flex"
          >
            <FontAwesomeIcon icon={faChevronRight} className="text-[11px]" />
          </button>
        </>
      )}
    </div>
  );
}
