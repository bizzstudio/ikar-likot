// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",

  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },

  server: {
    historyApiFallback: true,
  },

  // טעינת @zxing מהמקומי – מונע 504 ובעיות עם הסורק הישן
  optimizeDeps: {
    include: ['@zxing/browser', '@zxing/library'],
    exclude: ['@yudiel/react-qr-scanner'],
  },
});