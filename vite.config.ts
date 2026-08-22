import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    allowedHosts: ["cylon", "cylon.tail9f83da.ts.net"],
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
