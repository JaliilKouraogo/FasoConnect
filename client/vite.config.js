import { defineConfig } from "vite";
export default defineConfig({
  base: "/service/",
  build: { target: "es2022", sourcemap: false },
});
