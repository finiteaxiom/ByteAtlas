import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  const nonce = randomBytes(16).toString('base64');
  return {
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts'), backend: resolve('src/backend/index.ts') },
        output: { entryFileNames: '[name].js' }
      }
    }
  },
  preload: {},
  renderer: {
    optimizeDeps: { include: ['react', 'react-dom/client', 'three', 'three/addons/controls/OrbitControls.js'] },
    html: command === 'serve' ? { cspNonce: nonce } : undefined,
    plugins: [react(), {
      name: 'byteatlas-dev-csp',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replace("script-src 'self';", `script-src 'self' 'nonce-${nonce}';`)
      }
    }]
  }
  };
});
