import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // react-grid-layout (react-draggable) tarayıcıda process.env okur;
    // Vite Node global'lerini polyfill'lemediği için tanımlıyoruz.
    'process.env': {},
  },
})
