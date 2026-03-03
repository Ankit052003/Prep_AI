import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const backendTarget = env.VITE_BACKEND_URL || "http://localhost:5000"

  return {
    plugins: [
      tailwindcss(),
      react(),
    ],
    server: {
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
