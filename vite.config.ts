import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) } },
  },
  server: { host: true },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'], testTimeout: 120000 },
} as any);
