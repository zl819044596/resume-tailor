import { useState } from 'react';
import { API_BASE } from '../config';
import { track } from '../lib/analytics';

// pricing 页购买按钮:与 RewritePanel.buy 同一条链路(POST /api/checkout → 跳 Creem)。
// 未登录给出明确指引而不是让用户"再试一次"。product 省略时渲染两个 pack。
interface Props {
  product?: 'pack5' | 'pack30';
}

export default function BuyButtons({ product: single }: Props = {}) {
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(product: 'pack5' | 'pack30') {
    setBuying(product);
    setError(null);
    track('checkout_click', { product, from: 'pricing' });
    try {
      const res = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      });
      const data = (await res.json()) as { payUrl?: string; error?: string };
      if (res.ok && data.payUrl) {
        window.location.href = data.payUrl;
        return;
      }
      setError(
        data.error === 'login_required'
          ? 'Please sign in first (top right) — credits are tied to your account, so checkout needs you logged in.'
          : data.error === 'payments_not_configured'
            ? 'Payments are being set up — they will appear here shortly.'
            : `Checkout failed (${data.error ?? res.status}). Please try again.`,
      );
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBuying(null);
    }
  }

  const btn = (product: 'pack5' | 'pack30', label: string) => (
    <button type="button" className="btn btn-primary" disabled={buying !== null} onClick={() => buy(product)}>
      {buying === product ? 'Opening checkout…' : label}
    </button>
  );

  return (
    <div className="pricing-buy">
      {single === 'pack5' && btn('pack5', 'Buy 5 credits — $1.99')}
      {single === 'pack30' && btn('pack30', 'Buy 30 credits — $9')}
      {!single && (
        <>
          {btn('pack5', 'Buy 5 credits — $1.99')}
          {btn('pack30', 'Buy 30 credits — $9 · best value')}
        </>
      )}
      {error && <p className="warn rewrite-error">{error}</p>}
    </div>
  );
}
