import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://brownspacecow.github.io/billpath',
  base: '/billpath',
  output: 'static',
  integrations: [react(), tailwind(), sitemap()],
  prefetch: true,
});
