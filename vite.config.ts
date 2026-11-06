import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // a new version on every build for the files in public/assets (src/asset.ts)
  define: { __V__: JSON.stringify(Date.now().toString(36)) },
  build: {
    target: 'es2019',
    // the bundles with a hash in the name go to build/ (cached for a year); public/assets keeps its fixed names and is revalidated
    assetsDir: 'build',
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) } },
  },
  server: { host: true },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'], testTimeout: 120000 },
} as any);
