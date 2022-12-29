import { defineConfig } from 'astro/config';
import { remarkReadingTime } from './src/utils/remark-reading-time.mjs';

export default defineConfig({
  markdown: {
    // Applied to .md and .mdx files
    remarkPlugins: [remarkReadingTime],
    // Preserves remark-gfm and remark-smartypants
    extendDefaultPlugins: true,

    shikiConfig: {
      theme: 'nord',
      wrap: true,
    }
  }}
)
