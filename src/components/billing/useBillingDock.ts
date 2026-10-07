import { useLayoutEffect, type RefObject } from 'react';

// A body portal keeps the floating checkout out of animated/transformed page
// ancestors. Measure the actual content column instead of assuming a sidebar width.
export function useBillingDock(container: RefObject<HTMLElement>, dock: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const content = container.current;
    const floating = dock.current;
    if (!content || !floating) return;
    const page = content.closest<HTMLElement>('.billing-team') ?? content;
    let scrollRoot: HTMLElement | null = content.parentElement;
    while (scrollRoot && !/(auto|scroll)/.test(getComputedStyle(scrollRoot).overflowY)) scrollRoot = scrollRoot.parentElement;
    scrollRoot ??= document.scrollingElement as HTMLElement ?? document.documentElement;
    const previousPadding = scrollRoot.style.scrollPaddingBottom;
    let frame = 0;
    function measure() {
      frame = 0;
      const bounds = content!.getBoundingClientRect();
      if (bounds.width > 0) {
        floating!.style.left = `${Math.max(8, bounds.left)}px`;
        floating!.style.width = `${Math.min(bounds.width, window.innerWidth - Math.max(8, bounds.left) - 8)}px`;
        floating!.style.right = 'auto';
      }
      const viewport = window.visualViewport;
      const obscured = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const keyboard = obscured > 120;
      floating!.dataset.keyboard = String(keyboard);
      floating!.style.setProperty('--billing-keyboard', `${keyboard ? obscured : 0}px`);
      const height = Math.ceil(floating!.getBoundingClientRect().height);
      const bottom = parseFloat(getComputedStyle(floating!).bottom) || 0;
      const existingPadding = scrollRoot ? parseFloat(getComputedStyle(scrollRoot).paddingBottom) || 0 : 0;
      page.style.setProperty('--billing-checkout-height', `${height}px`);
      page.style.setProperty('--billing-checkout-space', `${Math.max(0, height + bottom - existingPadding) + 20}px`);
      if (scrollRoot) scrollRoot.style.scrollPaddingBottom = `${height + 120}px`;
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(content); observer.observe(floating);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    measure();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      page.style.removeProperty('--billing-checkout-height');
      page.style.removeProperty('--billing-checkout-space');
      if (scrollRoot) scrollRoot.style.scrollPaddingBottom = previousPadding;
    };
  }, [container, dock]);
}
