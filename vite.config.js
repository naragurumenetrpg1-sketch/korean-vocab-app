import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages ではリポジトリ名がURLのパスになるため、
// "your-repo-name" の部分を実際のリポジトリ名に書き換えてください。
// 例: リポジトリ名が "korean-vocab-app" なら base: "/korean-vocab-app/"
export default defineConfig({
  plugins: [react()],
  base: "/your-repo-name/",
});
