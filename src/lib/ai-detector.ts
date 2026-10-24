// AI 简历检测:从 textverdict 移植(2026-10-24 合并),逻辑未改,仅换配置来源。
// 模型分发:textverdict-model-gateway worker(R2 桶 textverdict-models,只读,CORS 全开)。
// 本地想离线开发时:把模型放到 public/models/ 并设 PUBLIC_MODEL_BASE_URL=/models/。
import { pipeline, env } from "@huggingface/transformers";

const MODEL_BASE: string = (
  import.meta.env.PUBLIC_MODEL_BASE_URL ||
  "https://textverdict-model-gateway.zl18672545321.workers.dev"
).replace(/\/?$/, "/");
const MODEL_DIR = "hc3-detector"; // Hello-SimpleAI/chatgpt-detector-roberta 的 onnx-community int8 转换版

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = MODEL_BASE;

// label 映射(HC3 版按 config.json 实测为 "Human"/"ChatGPT";兼容 Fake/Real 与 LABEL_N 命名)
const AI_LABEL_RE = /fake|chatgpt|label_1|^ai$|machine/i;

export type Phase =
  | { stage: "idle" }
  | { stage: "loading-model"; pct: number; file?: string }
  | { stage: "analyzing"; done: number; total: number }
  | { stage: "done" }
  | { stage: "error"; message: string };

export type SentenceScore = { text: string; aiPct: number; words: number };

export type Verdict = "human" | "mixed" | "ai";

export type DetectResult = {
  aiPct: number;
  verdict: Verdict;
  sentences: SentenceScore[];
  elapsedMs: number;
};

type ProgressEvent = { status: string; file?: string; progress?: number };

let classifierPromise: Promise<unknown> | null = null;

export async function loadModel(onProgress: (p: Phase) => void) {
  if (!classifierPromise) {
    classifierPromise = pipeline("text-classification", MODEL_DIR, {
      dtype: "q8",
      progress_callback: (e: ProgressEvent) => {
        if (e.status === "progress" && typeof e.progress === "number") {
          onProgress({ stage: "loading-model", pct: Math.round(e.progress), file: e.file });
        }
      },
    });
  }
  return classifierPromise;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

export async function detect(
  text: string,
  onProgress: (p: Phase) => void
): Promise<DetectResult> {
  const started = performance.now();
  const classifier = (await loadModel(onProgress)) as (
    input: string
  ) => Promise<Array<{ label: string; score: string }>>;

  const sentences = splitSentences(text).slice(0, 200);
  const results: SentenceScore[] = [];
  let totalWords = 0;
  let weighted = 0;

  const toScore = sentences.filter((s) => countWords(s) >= 4);
  if (toScore.length === 0) {
    throw new Error("Text is too short to analyze. Please paste at least a few sentences.");
  }

  for (let i = 0; i < toScore.length; i++) {
    const s = toScore[i].slice(0, 1200); // 单句超长截断,roberta 上限 512 token
    const out = await classifier(s);
    const top = out?.[0];
    const ai = AI_LABEL_RE.test(top?.label ?? "") ? Number(top.score) : 1 - Number(top.score ?? 0.5);
    const words = countWords(toScore[i]);
    results.push({ text: toScore[i], aiPct: Math.round(ai * 100), words });
    weighted += ai * words;
    totalWords += words;
    onProgress({ stage: "analyzing", done: i + 1, total: toScore.length });
  }

  const aiPct = Math.round((weighted / Math.max(totalWords, 1)) * 100);
  const verdict: Verdict = aiPct >= 70 ? "ai" : aiPct >= 35 ? "mixed" : "human";
  return {
    aiPct,
    verdict,
    sentences: results,
    elapsedMs: Math.round(performance.now() - started),
  };
}
