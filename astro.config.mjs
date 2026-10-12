import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // 生产域名 2026-10-10 已定并注册,硬编码避免环境变量遗漏
  site: 'https://tailorresume.dev',
  integrations: [
    react(),
    sitemap(),
  ],
});
