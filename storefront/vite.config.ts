import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Backend the dev server proxies to (override to point at another instance)
const API = process.env.VITE_API_PROXY ?? "http://localhost:9001"

const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url))

export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": src("."),
    },
  },
  server: {
    port: 8000,
    proxy: {
      "/auth": API,
      "/admin": API,
      "/store": API,
      "/hooks": API,
      "/uploads": API,
    },
  },
})
