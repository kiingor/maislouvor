// Stripe's embedded checkout in purchases-js 1.68 omits a visible close control.
// Keep the SDK's own history cancellation so its purchase promise, listeners and
// Stripe elements are cleaned up together. Never remove an active iframe ourselves.
export async function withWebCheckoutBack<T>(purchase: () => Promise<T>): Promise<T> {
  const bar = document.createElement('nav');
  bar.className = 'billing-web-checkout-navigation';
  bar.setAttribute('aria-label', 'Navegação do pagamento');
  bar.hidden = true;
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = '‹ Voltar aos planos';
  back.onclick = () => {
    if (window.history.state?.checkoutOpen === true) window.history.back();
  };
  bar.append(back);
  const style = document.createElement('style');
  style.textContent = `
    body.billing-web-checkout-open .rcb-ui-container.fullscreen {
      top: calc(64px + env(safe-area-inset-top, 0px)) !important;
    }
    .billing-web-checkout-navigation:not([hidden]) {
      position: fixed; inset: 0 0 auto; z-index: 1000002; display: flex;
      align-items: center; height: calc(64px + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 16px 0; background: #f5f5f5;
      border-bottom: 1px solid #dedede; color: #1c1b17;
    }
    .billing-web-checkout-navigation button {
      min-height: 44px; padding: 0 16px; border-radius: 24px; border: 1px solid #e7e7e7;
      background: #fff; color: #1c1b17; font: 500 15px -apple-system, BlinkMacSystemFont, sans-serif;
      cursor: pointer; box-shadow: 0 2px 8px #00000008;
    }
    .billing-web-checkout-navigation button:focus-visible { outline: 2px solid #1c1b17; outline-offset: 2px; }
  `;
  document.head.append(style);
  document.body.append(bar);
  let visible = false;
  const observer = new MutationObserver(() => {
    if (!visible && window.history.state?.checkoutOpen === true && document.querySelector('.rcb-ui-container.fullscreen')) {
      visible = true; bar.hidden = false;
      document.body.classList.add('billing-web-checkout-open');
      back.focus({ preventScroll: true });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  try { return await purchase(); }
  finally {
    observer.disconnect(); bar.remove(); style.remove();
    document.body.classList.remove('billing-web-checkout-open');
  }
}
