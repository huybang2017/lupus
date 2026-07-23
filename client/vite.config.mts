import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Plain admin dashboard: no Lupus vite plugin, no virtual modules.
// Dev proxies API calls to the lupus backend at :9001; production builds
// use same-origin relative URLs and are served by the backend at /app.
// With base "/app/", Vite rejects a bare "/app" with its "public base URL"
// message, so the small plugin below redirects it to "/app/".
export default defineConfig({
  base: "/app/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [
    react(),
    {
      name: "redirect-bare-base",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/app" || req.url?.startsWith("/app?")) {
            res.statusCode = 302
            res.setHeader("Location", req.url.replace("/app", "/app/"))
            res.end()
            return
          }
          next()
        })
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5099,
    proxy: {
      "/auth": "http://localhost:9001",
      "/admin": "http://localhost:9001",
      "/store": "http://localhost:9001",
      "/hooks": "http://localhost:9001",
      "/uploads": "http://localhost:9001",
    },
  },
})
