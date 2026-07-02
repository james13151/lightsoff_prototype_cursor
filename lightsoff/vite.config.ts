import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Allow serving through tunnel domains (e.g. Cloudflare quick tunnels) for shareable previews
  preview: { allowedHosts: ['.trycloudflare.com'] },
  server: { allowedHosts: ['.trycloudflare.com'] },
})
