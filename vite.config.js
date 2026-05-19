import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Firebase gets its own chunk — it's large and rarely changes
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase';
          }
          // Framer Motion physics engine in its own chunk
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          // React core + React Router in a shared vendor chunk
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react-router-dom')
          ) {
            return 'vendor-core';
          }
        },
      },
    },
  },
})
