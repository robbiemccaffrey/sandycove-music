import { defineConfig, passthroughImageService } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://sandycoveschoolofmusic.com',
  image: {
    service: passthroughImageService(),
  },
  integrations: [
    tailwind(),
    sitemap(),
  ],
});
