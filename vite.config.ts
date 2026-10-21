import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 单文件产物：全部 JS/CSS 内联进 dist/index.html，
// 既可通过任意静态服务器访问，也支持在本地直接双击打开（配合 Hash 路由）。
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: { port: 5173, host: true },
  build: { chunkSizeWarningLimit: 4000 },
});