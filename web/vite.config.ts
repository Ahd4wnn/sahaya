import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: 5173,
    proxy: {
      // Keeps the browser on one origin in development, so cookies and CORS
      // behave the same locally as they will behind a reverse proxy. `ws` is
      // what lets the realtime socket at /api/v1/ws through the same proxy.
      "/api": { target: "http://localhost:8010", changeOrigin: true, ws: true },
      "/media": { target: "http://localhost:8010", changeOrigin: true },
    },
  },
});
