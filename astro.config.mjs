import { defineConfig } from 'astro/config';
import { remarkReadingTime } from './src/utils/remark-reading-time.mjs';

export default defineConfig({
  site: 'https://www.mperez.io',
  markdown: {
    // Applied to .md and .mdx files
    remarkPlugins: [remarkReadingTime],
    // Preserves remark-gfm and remark-smartypants
    extendDefaultPlugins: true,

    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    }
  }}
)
