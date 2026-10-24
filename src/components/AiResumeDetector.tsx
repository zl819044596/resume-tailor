import { useCallback, useRef, useState } from "react";
import { detect, type Phase, type DetectResult } from "../lib/ai-detector";
import { track } from "../lib/analytics";

const MAX_CHARS = 8000;

const VERDICT_TEXT: Record<string, { title: string; tone: string }> = {
  human: { title: "Likely human-written", tone: "good" },
  mixed: { title: "Mixed signals", tone: "warn" },
  ai: { title: "Likely AI-generated", tone: "low" },
};

function Gauge({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const filled = (pct / 100) * c;
  const color = pct >= 70 ? "var(--low)" : pct >= 35 ? "var(--warn)" : "var(--good)";
  return (
    <div className="gauge" role="img" aria-label={`AI score ${pct}%`}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line-2)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={`${filled} ${c}`}
        />
      </svg>
      <div className="num">
        <b style={{ color }}>{pct}%</b>
        <span>AI score</span>
      </div>
    </div>
  );
}

// 深色主题下的句子高亮:半透明 tint(浅色 pastel 在暖炭底上不可读)
function sentenceColor(pct: number) {
  return pct >= 70 ? "rgba(201, 111, 90, 0.38)" : pct >= 35 ? "rgba(201, 161, 90, 0.30)" : "rgba(121, 168, 120, 0.26)";
}

export default function AiResumeDetector() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });
  const [result, setResult] = useState<DetectResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const run = useCallback(async () => {
    if (!text.trim() || phase.stage === "loading-model" || phase.stage === "analyzing") return;
    setResult(null);
    track("detector_run", { chars: text.length });
    try {
      const r = await detect(text, setPhase);
      setResult(r);
      setPhase({ stage: "done" });
      track("detector_verdict", { ai_pct: r.aiPct, verdict: r.verdict, sentences: r.sentences.length });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setPhase({ stage: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }, [text, phase.stage]);

  const busy = phase.stage === "loading-model" || phase.stage === "analyzing";
  const chars = text.length;

  return (
    <div className="detector">
      <textarea
        value={text}
        maxLength={MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your resume (or the summary / experience section of it) — at least a few sentences…"
        rows={9}
        aria-label="Resume text to analyze"
      />
      <div className="detector-bar">
        <span className="count">{chars.toLocaleString()} / {MAX_CHARS.toLocaleString()} chars</span>
        <button className="detect-btn" onClick={run} disabled={busy || !text.trim()}>
          {busy ? "Analyzing…" : "Check if it reads as AI ✦"}
        </button>
      </div>

      <p className="privacy-note">
        🔒 Your resume never leaves your browser — the detection model runs 100% on your device.
      </p>

      {phase.stage === "loading-model" && (
        <div className="progress-box" role="status">
          <p>Loading detection model ({phase.pct}%) — first time only, cached afterwards…</p>
          <div className="progress"><div style={{ width: `${phase.pct}%` }} /></div>
        </div>
      )}
      {phase.stage === "analyzing" && (
        <div className="progress-box" role="status">
          <p>Analyzing sentence {phase.done} / {phase.total}…</p>
          <div className="progress">
            <div style={{ width: `${Math.round((phase.done / phase.total) * 100)}%` }} />
          </div>
        </div>
      )}
      {phase.stage === "error" && (
        <div className="error-box" role="alert">
          <p>{phase.message}</p>
          <p className="muted">If this is your first visit, the model file may still be syncing — please retry in a minute.</p>
        </div>
      )}

      {result && (
        <div className="result" ref={resultRef}>
          <div className="result-head">
            <Gauge pct={result.aiPct} />
            <div>
              <h2 className={`verdict ${VERDICT_TEXT[result.verdict].tone}`}>
                {VERDICT_TEXT[result.verdict].title}
              </h2>
              <p className="r-sub">
                {result.sentences.length} sentences analyzed in {(result.elapsedMs / 1000).toFixed(1)}s · nothing uploaded
              </p>
            </div>
          </div>

          <div className="highlight-box">
            {result.sentences.map((s, i) => (
              <mark key={i} style={{ backgroundColor: sentenceColor(s.aiPct) }} title={`AI score: ${s.aiPct}%`}>
                {s.text}{" "}
              </mark>
            ))}
          </div>
          <p className="legend">
            <span><i className="dot" style={{ background: "var(--good)" }} /> likely human</span>
            <span><i className="dot" style={{ background: "var(--warn)" }} /> mixed</span>
            <span><i className="dot" style={{ background: "var(--low)" }} /> likely AI</span>
          </p>

          {result.aiPct >= 35 && (
            <div className="cta-box">
              <p>
                <strong>Reading as machine-written?</strong> The fix is intent, not tricks: anchor every
                bullet in something only you did.
              </p>
              <p className="cta-links">
                <a href="/tailor-resume-to-job-description">Rewrite it against the job description →</a>
                <a href="/ats-resume-checker">Run the ATS keyword check →</a>
              </p>
            </div>
          )}

          <div className="disclaimer">
            <p>
              <strong>Disclaimer:</strong> this score is a statistical estimate from an open-source
              model — not a Turnitin or employer report. AI detectors (including commercial ones)
              produce false positives, especially for non-native English writers. Recruiters do not
              reject resumes on a detector score alone, and neither should you panic over one.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
