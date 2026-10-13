import { useEffect, useMemo, useState } from 'react';
import { matchResumeToJob } from '../lib/matcher';
import { API_BASE, BRAND, FREE_REWRITE_LIMIT } from '../config';
import { track } from '../lib/analytics';

// AI 改写面板:配额=登录账号级 3 次免费,匿名设备 3 次;用完扣 credits(付费层)。
// 隐私边界要诚实:检测器 100% 本地;改写会把简历+JD 发到我们的 API 和 DeepSeek 处理。
interface RewriteResult {
  rewritten: string;
  changes: { what: string; why: string }[];
  unmatched: string[];
  used: number;
  limit: number;
  credits?: number;
  billed?: string;
}

function getDeviceToken(): string {
  const KEY = 'rt_device';
  let t = localStorage.getItem(KEY);
  if (!t || !/^[0-9a-f-]{8,64}$/i.test(t)) {
    t = crypto.randomUUID();
    localStorage.setItem(KEY, t);
  }
  return t;
}

function download(filename: string, content: string | Blob, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 纯文本→简洁 .docx(ATS 友好排版):首行=姓名标题,全大写短行=节标题,- 开头=项目符号
async function downloadDocx(text: string) {
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx');
  const children = text.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t) return new Paragraph('');
    if (i === 0) return new Paragraph({ text: t, heading: HeadingLevel.HEADING_1 });
    if (i === 1) return new Paragraph({ text: t, heading: HeadingLevel.HEADING_3 });
    if (t.startsWith('-') || t.startsWith('•')) {
      return new Paragraph({ text: t.replace(/^[-•]\s*/, ''), bullet: { level: 0 } });
    }
    if (t === t.toUpperCase() && t.length < 50) return new Paragraph({ text: t, heading: HeadingLevel.HEADING_2 });
    return new Paragraph({ text: t });
  });
  const doc = new Document({ sections: [{ children }] });
  download('tailored-resume.docx', await Packer.toBlob(doc), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

export default function RewritePanel({ resume, jd }: { resume: string; jd: string }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const limit = FREE_REWRITE_LIMIT;
  const [loggedIn, setLoggedIn] = useState(false);
  const [packsOpen, setPacksOpen] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  useEffect(() => {
    fetch(`${API_BASE}/api/quota`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceToken: getDeviceToken() }),
    })
      .then((r) => r.json() as Promise<{ used?: number; limit?: number; loggedIn?: boolean; credits?: number }>)
      .then((d) => {
        const credits = d.credits ?? 0;
        setRemaining(Math.max(0, (d.limit ?? limit) - (d.used ?? 0)));
        setCredits(d.credits ?? 0);
        setLoggedIn(Boolean(d.loggedIn));
      })
      .catch(() => setRemaining(null));
    window.addEventListener('rt:auth', () => window.location.reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  async function buy(product: 'pack5' | 'pack30') {
    setBuying(product);
    setError(null);
    track('checkout_click', { product });
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
        data.error === 'payments_not_configured'
          ? 'Payments are being set up — they will appear here shortly.'
          : `Checkout failed (${data.error ?? res.status}). Please try again.`,
      );
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBuying(null);
    }
  }

  async function rewrite() {
    setLoading(true);
    setError(null);
    track('rewrite_click');
    try {
      const res = await fetch(`${API_BASE}/api/rewrite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume, jd, deviceToken: getDeviceToken() }),
      });
      const data = await res.json();
      if (res.status === 429 || data.error === 'quota_exhausted') {
        setRemaining(0);
        setPacksOpen(Boolean(data.loggedIn));
        setError(
          data.loggedIn
            ? `You've used all ${data.limit ?? limit} free AI rewrites on this account. Grab a credit pack to keep going — 1 credit = 1 rewrite.`
            : `You've used all ${data.limit ?? limit} free AI rewrites on this device. Sign in (top right) to get 3 more, tied to your account.`,
        );
        track('quota_exhausted', { loggedIn: Boolean(data.loggedIn) });
      } else if (!res.ok) {
        setError(`Something went wrong (${data.error ?? res.status}). Please try again.`);
      } else {
        setResult(data);
        track('rewrite_success');
      }
    } catch {
      setError('Network error — is the API running?');
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.rewritten);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const noneLeft = remaining === 0 && credits === 0 && !result;
  // before/after 分数:改写稿回本地 matcher 重跑(检测+改写同产品的独有闭环)
  const afterScore = useMemo(
    () => (result ? matchResumeToJob(result.rewritten, jd).score : null),
    [result, jd]
  );

  return (
    <div className="rewrite">
      <div className="rewrite-head">
        <button className="btn btn-primary" onClick={rewrite} disabled={loading || noneLeft}>
          {loading
            ? 'Rewriting… (5–20s)'
            : noneLeft
              ? 'Free rewrites used up'
              : `✨ Rewrite my resume for this job${remaining !== null ? (remaining > 0 ? ` — ${remaining} free left` : ` — ${credits} credit${credits === 1 ? '' : 's'} left`) : ''}`}
        </button>
        <span className="rewrite-note">
          AI rewrites truthfully: it reuses your facts in the job's wording and flags requirements you can't support. Sends your resume + JD to our API (DeepSeek) — the free matcher above stays 100% local.
        </span>
      </div>

      {error && <p className="warn rewrite-error">{error}</p>}

      {packsOpen && (
        <div className="pack-cta">
          <button type="button" className="btn btn-primary" disabled={buying !== null} onClick={() => buy('pack5')}>
            {buying === 'pack5' ? 'Opening checkout…' : '5 credits — $1.99'}
          </button>
          <button type="button" className="btn btn-primary" disabled={buying !== null} onClick={() => buy('pack30')}>
            {buying === 'pack30' ? 'Opening checkout…' : '30 credits — $9 · best value'}
          </button>
          <span className="rewrite-note">
            1 credit = 1 rewrite · never expires · secure checkout by Creem · <a href="/pricing">pricing details</a>
          </span>
        </div>
      )}

      {result && (
        <div className="rewrite-result">
          <div className="ba-score">
            <span className="ba-num">{matchResumeToJob(resume, jd).score}</span>
            <span className="ba-arrow">→</span>
            <span className="ba-num ba-after">{afterScore}</span>
            <span className="ba-label">match score before → after (re-checked locally, same scoring as the free tool above)</span>
          </div>
          <h3>Your tailored resume</h3>
          <textarea className="rewrite-text" value={result.rewritten} onChange={() => {}} rows={16} readOnly />
          <div className="tool-actions">
            <button className="btn btn-primary" onClick={copy}>{copied ? '✓ Copied' : 'Copy text'}</button>
            <button className="btn btn-ghost" onClick={() => { track('download_resume', { format: 'txt' }); download('tailored-resume.txt', result.rewritten); }}>Download .txt</button>
            <button className="btn btn-ghost" onClick={() => { track('download_resume', { format: 'docx' }); downloadDocx(result.rewritten); }}>Download .docx</button>
            <button className="btn btn-ghost" onClick={() => { track('download_resume', { format: 'pdf' }); window.print(); }}>Save as PDF (print)</button>
          </div>
          <div id="print-area" className="print-only"><pre>{result.rewritten}</pre></div>
          <div className="tool-actions">
            <button className="btn btn-primary" onClick={copy}>{copied ? '✓ Copied' : 'Copy text'}</button>
            <button className="btn btn-ghost" onClick={() => download('tailored-resume.txt', result.rewritten)}>Download .txt</button>
            <button className="btn btn-ghost" onClick={() => downloadDocx(result.rewritten)}>Download .docx</button>
          </div>

          {result.changes.length > 0 && (
            <>
              <h3>What changed ({result.changes.length})</h3>
              <ul className="tips">
                {result.changes.map((c, i) => (
                  <li key={i}><b>{c.what}</b>{c.why ? ` — ${c.why}` : ''}</li>
                ))}
              </ul>
            </>
          )}
          {result.unmatched.length > 0 && (
            <>
              <h3>Job requirements your resume can't support — don't fabricate these</h3>
              <ul className="tips">
                {result.unmatched.map((u, i) => <li key={i} className="warn">{u}</li>)}
              </ul>
            </>
          )}
          <p className="result-foot">
            {BRAND} rewrites only what your resume supports. Review every line before sending — you own the truth of this document.
          </p>
        </div>
      )}
    </div>
  );
}
