import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const hostsPermitidos = (process.env["ALLOWED_HOSTS"] ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter((h) => h !== "");

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env["WEB_PORT"] ?? 5174),
    strictPort: true,
    ...(hostsPermitidos.length > 0 ? { allowedHosts: hostsPermitidos } : {}),
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
