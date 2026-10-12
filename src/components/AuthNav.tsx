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

  const refresh = useCallback(() => {
    fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' })
      .then((r) => r.json() as Promise<Me>)
      .then(setMe)
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
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

  if (!google) return null;

  if (me?.user) {
    return (
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
    );
  }

  return (
    <a
      className="auth-link auth-signin"
      href={`${API_BASE}/api/auth/google`}
      onClick={() => track('login_click', { method: 'google' })}
    >
      Sign in
    </a>
  );
}
