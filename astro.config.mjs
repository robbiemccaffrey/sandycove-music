import { defineConfig, passthroughImageService } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://sandycoveschoolofmusic.com',
  image: {
    service: passthroughImageService(),
  },
  integrations: [
    tailwind(),
  ],
});
