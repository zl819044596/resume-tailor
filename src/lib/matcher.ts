// 纯前端"简历 vs JD"匹配打分:零上传、零 LLM、零边际成本。
// 打分 = 70% 关键词覆盖(词频加权,封顶 3 次) + 30% 关键词组(连续二元词组)覆盖。
// 设计约束见 docs/specs/ai-resume-tailor-site.md:免注册免费无限是楔子 A 的核心;
// 打分必须可解释(每个关键词在 JD 出现几次、简历有没有),不许黑箱。
// 匹配用词干(复数/时态归一),展示用 JD 原词;刻意不做深还原——administer vs
// administration 这类措辞差异就该被指出来,用 JD 原话正是产品要教的事。

export interface KeywordHit {
  term: string;    // JD 原词(展示用)
  jdCount: number; // 在 JD 中出现的次数
  weight: number;  // 词 = min(jdCount,3);词组在此基础上 ×2(多词技能更具体、更值钱)
  kind: 'word' | 'phrase';
}

export interface MatchResult {
  score: number; // 0-100
  matched: KeywordHit[];  // 权重降序
  missing: KeywordHit[];  // 权重降序(用户最该看的清单)
  jdTitle: string;        // 启发式提取的 JD 职位名,展示用(空串=没识别出)
  titleMatched: boolean;  // 职位名关键词是否出现在简历头部
  resumeWordCount: number;
  jdWordCount: number;
  tips: string[];
}

// 停用词:冠词/介词/泛化招聘话术等,不参与关键词;技能词(figma/npm/flutter 等)不在表内
const STOPWORDS = new Set(
  `a an the and or but if then else for to of in on at by with from as is are was were be been being
  this that these those it its we our you your they their he she his her i me my mine do does did done
  not no nor so such than too very can will just should now also about into over under again further
  has have had having im youd well theyre what which who whom when where why how all any both each
  few more most other some own same dont wont must may might shall upon while via able across against
  among around before behind below beneath beside between beyond during except inside however therefore
  thus etc eg ie per plus regarding throughout toward towards within without work working works role
  roles job jobs position positions company companies team teams year years experience experiences
  new good great strong excellent ideal perfect candidate candidates opportunity opportunities
  benefits salary equal employer diverse inclusive apply application please us using use used
  qualified successful responsible responsibilities required require requires requirement requirements
  preferred prefer prefers bonus must need needs looking seeking hiring join joining offer offers
  provide provides providing support supporting day days time times full part remote hybrid onsite
  based location locations world leading fastpaced environment culture mission vision values include
  includes including ensure ensuring help helps helping make makes making take takes taking get gets
  getting give gives given least skills accurate current up title`
    .split(/\s+/)
    .filter(Boolean)
);

// 职位名词表(启发式提取 JD 职位名用;不求穷尽,匹配不到就降级不显示)
const ROLE_NOUNS = `engineer developer programmer manager nurse designer analyst consultant specialist
  administrator architect scientist teacher professor assistant associate coordinator technician
  writer marketer accountant recruiter advisor attorney paralegal chef driver operator mechanic
  dentist pharmacist therapist counselor librarian director president lead intern translator
  interpreter electrician plumber welder underwriter adjuster bookkeeper dispatcher paramedic`
  .split(/\s+/)
  .filter(Boolean);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s/-]/g, ' ') // 保留 c++ / c# / node.js / ci-cd 类写法
    .replace(/(?<![a-z0-9])[.\-]+(?![a-z0-9])/g, ' ') // 孤立的点和横杠(句首)变空格
    .replace(/[.\-]+(?=\s|$)/g, ' ') // 词尾的点和横杠("managers."→"managers")变空格
    .replace(/\s+/g, ' ')
    .trim();
}

// 剥掉 JD 尾部的福利/EEO 样板段——那是给候选人看的,不是要匹配的关键词
function stripBoilerplate(jd: string): string {
  const cutRe = /^(benefits|compensation|pay( &| and)? benefits|what we offer|perks|why join( us)?|equal opportunity|eeo)\b/i;
  const eeoLineRe = /equal (opportunity|employer)|eeo|affirmative action|veteran status|gender identity|sexual orientation|race, |religion|national origin|reasonable accommodation/i;
  const out: string[] = [];
  for (const line of jd.split('\n')) {
    if (cutRe.test(line.trim())) break; // 这类段落总在 JD 尾部,见即截断
    if (!eeoLineRe.test(line)) out.push(line);
  }
  return out.join('\n');
}

// 轻量词形还原(只做高频安全变换:复数/进行时/过去时),让 charting↔charted 能对上
function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ings')) return t.slice(0, -4);
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 5 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function isKeyword(t: string): boolean {
  return t.length >= 2 && t.length <= 30 && !STOPWORDS.has(t) && !/^[0-9]/.test(t);
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(isKeyword);
}

// 词组 = 原文同一小句里相邻的两个实词(按行切,行内再按逗号/分号等子句切,两边都过关键词过滤)。
// 不在"滤停用词后的流"上拼(会造出 "closely physicians" 假相邻),也不跨子句拼("IV therapy, wound care" 不该产生 "therapy wound")。
function phraseBigrams(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    for (const clause of line.split(/[,;:()·|–—]/)) {
      const raw = normalize(clause).split(' ').filter(Boolean);
      for (let i = 0; i < raw.length - 1; i++) {
        if (isKeyword(raw[i]) && isKeyword(raw[i + 1])) out.push(`${raw[i]} ${raw[i + 1]}`);
      }
    }
  }
  return out;
}

function freqMap(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return m;
}

function makeWeight(count: number, kind: 'word' | 'phrase'): number {
  return Math.min(count, 3) * (kind === 'phrase' ? 2 : 1);
}

// 启发式提取 JD 职位名:前 15 行里第一行"短(≤80 字符)且含职位名词"的行
function extractTitle(jd: string): string {
  const roleRe = new RegExp(`\\b(${ROLE_NOUNS.join('|')})s?\\b`, 'i');
  const lines = jd
    .split(/\n/)
    .slice(0, 15)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length <= 80 && roleRe.test(line)) {
      return line.replace(/^(job title|title|position|role)\s*[:\-]\s*/i, '');
    }
  }
  return '';
}

const sumWeight = (hs: KeywordHit[]) => hs.reduce((s, h) => s + h.weight, 0);

export function matchResumeToJob(resume: string, jd: string): MatchResult {
  const resumeToks = tokenize(resume);
  const jdToks = tokenize(stripBoilerplate(jd));

  // 展示层:JD 原词/原词组的频次
  const jdUni = freqMap(jdToks);
  const jdPhr = freqMap(phraseBigrams(stripBoilerplate(jd)));
  // 匹配层:双侧词干
  const resumeStemUni = new Set(resumeToks.map(stem));
  const resumeStemPhr = new Set(phraseBigrams(resume).map((p) => p.split(' ').map(stem).join(' ')));

  const classify = (
    jdFreq: Map<string, number>,
    kind: 'word' | 'phrase'
  ): { matched: KeywordHit[]; missing: KeywordHit[] } => {
    const matched: KeywordHit[] = [];
    const missing: KeywordHit[] = [];
    for (const [term, jdCount] of jdFreq) {
      const key = kind === 'phrase' ? term.split(' ').map(stem).join(' ') : stem(term);
      const hit: KeywordHit = { term, jdCount, weight: makeWeight(jdCount, kind), kind };
      ((kind === 'word' ? resumeStemUni : resumeStemPhr).has(key) ? matched : missing).push(hit);
    }
    const byWeight = (a: KeywordHit, b: KeywordHit) => b.weight - a.weight || a.term.localeCompare(b.term);
    matched.sort(byWeight);
    missing.sort(byWeight);
    return { matched, missing };
  };

  const words = classify(jdUni, 'word');
  const phrases = classify(jdPhr, 'phrase');

  const wordTotal = sumWeight(words.matched) + sumWeight(words.missing);
  const phrTotal = sumWeight(phrases.matched) + sumWeight(phrases.missing);
  const wordScore = wordTotal > 0 ? sumWeight(words.matched) / wordTotal : 0;
  const phraseScore = phrTotal > 0 ? sumWeight(phrases.matched) / phrTotal : 0;
  const score = Math.round(100 * (0.7 * wordScore + 0.3 * phraseScore));

  const jdTitle = extractTitle(jd);
  const titleTokens = new Set(tokenize(jdTitle).map(stem));
  const headStems = new Set(tokenize(resume.split(/\n/).slice(0, 8).join(' ')).map(stem));
  const titleHits = [...titleTokens].filter((t) => headStems.has(t)).length;
  const titleMatched = titleTokens.size > 0 && titleHits >= Math.ceil(titleTokens.size / 2);

  const tips: string[] = [];
  if (phrases.missing.length > 0) {
    const top = phrases.missing.slice(0, 3).map((h) => `"${h.term}"`).join(', ');
    tips.push(`The job description keeps returning to these phrases: ${top}. If any of them describe work you've actually done, use that exact wording in your resume — ATS filters often match phrases literally.`);
  }
  if (words.missing.length > 0) {
    const top = words.missing.slice(0, 5).map((h) => h.term).join(', ');
    tips.push(`Highest-value missing keywords: ${top}. Weave them in where they truthfully apply — skills line, bullet points, or summary.`);
  }
  if (!titleMatched && jdTitle) {
    tips.push(`Mirror the job title "${jdTitle}" in your resume headline (the line under your name). Recruiters and filters look for it first.`);
  }
  if (resumeToks.length < 250) {
    tips.push('Your resume looks short. One or two lines per achievement with a number (%, $, time saved) gives the algorithm — and the human — more to match on.');
  }
  if (score >= 75) {
    tips.push('Strong match. Tailor 2-3 bullet points to echo the job description\'s priorities and this application is in good shape.');
  }
  tips.push('One rule: only add keywords that are genuinely true for you. The matcher shows gaps — you decide what\'s honest to fill. Interviewers probe every line.');

  return {
    score,
    matched: [...words.matched, ...phrases.matched],
    missing: [...words.missing, ...phrases.missing],
    jdTitle,
    titleMatched,
    resumeWordCount: resumeToks.length,
    jdWordCount: jdToks.length,
    tips,
  };
}
