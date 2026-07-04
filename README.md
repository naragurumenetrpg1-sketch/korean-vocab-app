# 한국어 단어장 (韓国語単語帳)

React + Vite で作った韓国語学習用フラッシュカードアプリです。

## ローカルで動かす

```bash
npm install
npm run dev
```

## GitHub Pages にデプロイする手順

1. **GitHubに新しいリポジトリを作る**（例: `korean-vocab-app`）

2. **`vite.config.js` の base を書き換える**
   `base: "/your-repo-name/"` の `your-repo-name` を、実際のリポジトリ名に変更してください。
   例: リポジトリ名が `korean-vocab-app` なら `base: "/korean-vocab-app/"`

3. **このフォルダをGitに登録してpush**
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git branch -M main
   git remote add origin https://github.com/【あなたのユーザー名】/【リポジトリ名】.git
   git push -u origin main
   ```

4. **gh-pages パッケージでデプロイ**
   ```bash
   npm install
   npm run deploy
   ```
   これで自動的に `dist` フォルダの内容が `gh-pages` ブランチにpushされます。

5. **GitHub側の設定**
   リポジトリの `Settings` → `Pages` を開き、
   `Source` を `Deploy from a branch`、`Branch` を `gh-pages` / `root` に設定して保存。
   数分後に `https://【あなたのユーザー名】.github.io/【リポジトリ名】/` で公開されます。

## データの保存について

単語データはブラウザの `localStorage` に保存されます。
そのため、同じ端末・同じブラウザでアクセスした時だけ単語が保持されます
（別の端末やブラウザからは見えません）。複数端末で同期したい場合は、
Firebase や Supabase のような外部データベースへの接続が別途必要になります。
