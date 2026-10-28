import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const proxy = {
  "/api": { target: "http://127.0.0.1:5000", changeOrigin: false },
};
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
