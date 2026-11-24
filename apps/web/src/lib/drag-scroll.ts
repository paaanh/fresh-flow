/**
 * Horizontal chip rows (tabs, filters, categories) scroll sideways with a swipe on phones,
 * but a mouse cannot swipe and their scrollbar is hidden. This makes every such row:
 *   - draggable with the mouse (press, drag sideways; the click after a drag is ignored),
 *   - scrollable with the mouse wheel (vertical wheel → sideways while the row can still move).
 * Installed once for the whole app; applies to `.scrollbar-hide` rows and `[data-drag-scroll]`.
 */
const SELECTOR = '.scrollbar-hide, [data-drag-scroll]';
const THRESHOLD = 5;

const scrollableRow = (target: EventTarget | null): HTMLElement | null => {
  const el = target instanceof Element ? (target.closest(SELECTOR) as HTMLElement | null) : null;
  return el && el.scrollWidth > el.clientWidth + 1 ? el : null;
};

let installed = false;

export function installDragScroll() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  let row: HTMLElement | null = null;
  let startX = 0;
  let startScroll = 0;
  let dragging = false;

  const end = () => {
    if (row && dragging) {
      row.style.cursor = '';
      row.style.userSelect = '';
      row.style.scrollSnapType = '';
      // the click that ends a drag must not press the chip under the mouse
      const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }
    row = null;
    dragging = false;
  };

  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scrollableRow(e.target);
    if (!el) return;
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return;
    row = el;
    startX = e.clientX;
    startScroll = el.scrollLeft;
    dragging = false;
  });

  document.addEventListener('pointermove', e => {
    if (!row) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > THRESHOLD) {
      dragging = true;
      row.style.cursor = 'grabbing';
      row.style.userSelect = 'none';
      row.style.scrollSnapType = 'none'; // snapping fights a smooth drag
    }
    if (dragging) {
      row.scrollLeft = startScroll - dx;
      e.preventDefault();
    }
  });

  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  // links / images inside a row must not start a native drag-and-drop
  document.addEventListener('dragstart', e => { if (scrollableRow(e.target)) e.preventDefault(); });

  document.addEventListener(
    'wheel',
    e => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // zoom / trackpad sideways: leave alone
      const el = scrollableRow(e.target);
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      const canMove = (e.deltaY > 0 && el.scrollLeft < max - 1) || (e.deltaY < 0 && el.scrollLeft > 0);
      if (!canMove) return; // at the end: let the page scroll as usual
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    },
    { passive: false }
  );
}
