import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: { '@': '/src' },
    dedupe: ['tailwindcss'],
  },
  server: { port: 3001 },
  preview: { port: 3001 },
});
