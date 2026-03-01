import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/auth": {
        target: "http://localhost:4001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""), // /api/auth/login -> /auth/login
      },
      "/api/payments": {
        target: "http://localhost:4002",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""), // /api/payments/invoices -> /payments/invoices
      },
      "/api/verify": {
        target: "http://localhost:4003",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
