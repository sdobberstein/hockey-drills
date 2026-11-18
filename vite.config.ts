import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths. A project on GitHub Pages is served from a sub-path
  // (/hockey-drills/), not from the root, so absolute paths like /assets/x.js would
  // 404 there. The app uses hash routing, so every route is the same page and
  // relative paths are all it needs, on Pages or any other static host.
  base: './',
})
