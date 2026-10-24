import { useCallback, useEffect, useState } from 'react';
import { API_BASE, BRAND } from '../config';
import { track } from '../lib/analytics';

// 顶部登录组件:Google 登录(storyboard 同款 redirect 模式)+ credits 展示。
// 未配置 OAuth(api/auth/config 返回 google:false)时整个组件不渲染——渐进增强。
interface Me {
  user: { email: string; name: string | null; picture: string | null; credits: number; plan: string } | null;
  used?: number;
  limit?: number;
}

export default function AuthNav() {
  const [google, setGoogle] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [paid, setPaid] = useState(false);

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then((r) => r.json() as Promise<Me>)
      .then(setMe)
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    // 支付回流:首页内联脚本在解析期已清掉 ?payment=success 并留下 sessionStorage 标记,
    // 这里读标记出到账提示(URL 此时必为空,不能读 URL)
    try {
      if (sessionStorage.getItem('rt:paid') === '1') {
        sessionStorage.removeItem('rt:paid');
        setPaid(true);
        track('payment_success');
        // webhook 加积分可能滞后几秒:补刷一次,横幅随 me 更新
        setTimeout(refresh, 3000);
        setTimeout(() => setPaid(false), 12000);
      }
    } catch {
      /* sessionStorage 不可用(隐私模式等)则跳过提示 */
    }
    fetch(`${API_BASE}/api/auth/config`)
      .then((r) => r.json() as Promise<{ google: boolean }>)
      .then((d) => setGoogle(Boolean(d.google)))
      .catch(() => setGoogle(false));
    refresh();
    window.addEventListener('rt:auth', refresh);
    return () => window.removeEventListener('rt:auth', refresh);
  }, [refresh]);

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setMe({ user: null });
    window.dispatchEvent(new Event('rt:auth'));
  }

  const paidToast = paid && (
    <div className="paid-toast" role="status">
      ✓ Payment received —{' '}
      {me?.user
        ? `${me.user.credits} credit${me.user.credits === 1 ? '' : 's'} ready to use.`
        : 'credits have been added to your account.'}
    </div>
  );

  // OAuth 未配置时登录 UI 隐藏,但支付回流提示不依赖 OAuth——单独放行
  if (!google) {
    return paid ? paidToast : null;
  }

  if (me?.user) {
    return (
      <>
      {paidToast}
      <span className="auth-chip">
        <span className="auth-credits">
          {me.user.credits} credit{me.user.credits === 1 ? '' : 's'}
        </span>
        <span className="auth-email" title={me.user.email}>
          {me.user.name ?? me.user.email}
        </span>
        <button type="button" className="auth-link" onClick={logout}>
          Log out
        </button>
      </span>
      </>
    );
  }

  return (
    <>
      {paidToast}
      <a
        className="auth-link auth-signin"
        href={`${API_BASE}/api/auth/google`}
        onClick={() => track('login_click', { method: 'google' })}
      >
        Sign in
      </a>
    </>
  );
}
