import { useMemo, useState } from 'react';
import { matchResumeToJob, type MatchResult } from '../lib/matcher';
import { BRAND } from '../config';
import { track } from '../lib/analytics';
import RewritePanel from './RewritePanel';

// 检测器 UI:双栏粘贴 → 本地打分。整条链路无网络请求(除 GA),隐私承诺真实成立。
const SAMPLE = {
  resume: `Maria Lopez, RN, BSN
Registered Nurse — Medical-Surgical Unit

SUMMARY
RN with 4 years of medical-surgical experience in a 400-bed teaching hospital. Epic certified, precepted 6 new graduate nurses.

EXPERIENCE
Staff Nurse, Med-Surg, St. Mary Hospital, 2021-present
- Care for 5-6 patients per shift: assessment, medication administration, IV therapy, wound care
- Charted in Epic EHR daily; unit super-user for charting workflows
- Responded to rapid response and code blue events; ACLS and BLS certified
- Precepted new graduate nurses and led fall-prevention huddles`,
  jd: `Job Title: Registered Nurse (RN) — Medical-Surgical Unit

Responsibilities
- Assess, plan and evaluate nursing care for up to 6 patients per shift
- Administer IV therapy, wound care and medication administration
- Chart in Epic EHR and maintain accurate patient records
- Educate patients and families on discharge planning
- Respond to rapid response and code blue events

Requirements
- Current RN license, BLS and ACLS certification required
- 2+ years of med-surg or acute care experience
- Strong EHR charting skills (Epic preferred), BSN preferred`,
};

function scoreLabel(score: number): { label: string; tone: 'good' | 'mid' | 'low' } {
  if (score >= 75) return { label: 'Strong match', tone: 'good' };
  if (score >= 55) return { label: 'Good match', tone: 'good' };
  if (score >= 35) return { label: 'Needs work', tone: 'mid' };
  return { label: 'Weak match', tone: 'low' };
}

const DISPLAY_LIMIT = 15;

export default function Matcher() {
  const [resume, setResume] = useState('');
  const [jd, setJd] = useState('');
  const [result, setResult] = useState<MatchResult | null>(null);

  const ready = useMemo(() => resume.trim().length > 40 && jd.trim().length > 40, [resume, jd]);

  function analyze() {
    if (!ready) return;
    const r = matchResumeToJob(resume, jd);
    setResult(r);
    track('analyze_match', { score: r.score });
    // 结果出来后滚到结果区(纯本地行为)
    requestAnimationFrame(() => document.getElementById('match-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function reset() {
    setResume('');
    setJd('');
    setResult(null);
  }

  function loadSample() {
    setResume(SAMPLE.resume);
    setJd(SAMPLE.jd);
    setResult(null);
  }

  const tone = result ? scoreLabel(result.score) : null;

  return (
    <div className="tool">
      <div className="tool-note">
        🔒 Runs entirely in your browser — your resume and the job description never leave your device.
      </div>
      <div className="tool-grid">
        <label className="field">
          <span className="field-label">1 · Paste your resume</span>
          <textarea
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="Paste your full resume text here…"
            rows={12}
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span className="field-label">2 · Paste the job description</span>
          <textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="Paste the job posting you're targeting…"
            rows={12}
            spellCheck={false}
          />
        </label>
      </div>
      <div className="tool-actions">
        <button className="btn btn-primary" onClick={analyze} disabled={!ready}>
          Analyze match — free, instant
        </button>
        <button className="btn btn-ghost" onClick={loadSample}>Try a sample</button>
        {result && <button className="btn btn-ghost" onClick={reset}>Start over</button>}
      </div>

      {result && tone && (
        <div id="match-result" className="result">
          <div className="result-head">
            <div className={`score score-${tone.tone}`}>
              <span className="score-num">{result.score}</span>
              <span className="score-label">{tone.label}</span>
            </div>
            <div className="result-meta">
              {result.jdTitle && (
                <div className={result.titleMatched ? 'ok' : 'warn'}>
                  {result.titleMatched ? '✓' : '⚠'} Job title{result.titleMatched ? ' found in your resume headline' : ` not reflected in your resume: "${result.jdTitle}"`}
                </div>
              )}
              <div>{result.resumeWordCount} resume words · {result.jdWordCount} JD words · nothing was uploaded</div>
            </div>
          </div>

          {result.missing.length > 0 && (
            <>
              <h3>Missing from your resume ({result.missing.length})</h3>
              <div className="chips">
                {result.missing.slice(0, DISPLAY_LIMIT).map((h) => (
                  <span key={h.kind + h.term} className={`chip chip-missing ${h.kind === 'phrase' ? 'chip-phrase' : ''}`}>
                    {h.term}{h.jdCount > 1 && <em>×{h.jdCount}</em>}
                  </span>
                ))}
              </div>
            </>
          )}
          {result.missing.length === 0 && (
            <p className="ok">No missing keywords — your resume covers every term in this job description.</p>
          )}

          {result.matched.length > 0 && (
            <>
              <h3>Already covered ({result.matched.length})</h3>
              <div className="chips">
                {result.matched.slice(0, DISPLAY_LIMIT).map((h) => (
                  <span key={h.kind + h.term} className={`chip chip-ok ${h.kind === 'phrase' ? 'chip-phrase' : ''}`}>
                    {h.term}{h.jdCount > 1 && <em>×{h.jdCount}</em>}
                  </span>
                ))}
              </div>
            </>
          )}

          <h3>How to improve</h3>
          <ul className="tips">
            {result.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>

          <RewritePanel resume={resume} jd={jd} />

          <p className="result-foot">
            {BRAND} matches keywords it finds in the job description against your resume — it never invents
            experience for you. Tailoring means choosing honest words, not fabricating them.
          </p>
        </div>
      )}
    </div>
  );
}
