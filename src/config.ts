// 全站唯一配置:站名/域名/价格只动这个文件。
// 域名 tailorresume.dev 已注册(2026-10-10,Cloudflare Registrar),BRAND 与域名一致。
export const BRAND = 'TailorResume';
export const TAGLINE = 'Tailor your resume to any job description — free, instant, no sign-up';

// 检测器 100% 浏览器端运行,零上传;API 用于付费 AI 改写(生产=api.tailorresume.dev 自定义域)
export const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3001'
  : 'https://api.tailorresume.dev';

export const PAYMENTS_LIVE = false; // 骨架阶段无支付;Creem 独立账号待开
// 免注册免费无限是楔子 A 的核心承诺;检测器无配额。改写免费次数的权威值在服务端,这里只是兜底展示
// (不要用裸 Infinity,Rollup 会把导出丢掉)
export const FREE_DETECTOR_LIMIT = Number.POSITIVE_INFINITY;
export const FREE_REWRITE_LIMIT = 3;
