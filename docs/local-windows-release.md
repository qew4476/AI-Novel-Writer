# 本地發布 Windows / Local Windows release

先安裝 GitHub CLI 並執行 `gh auth login`。提高 `package.json` 的版本號，提交並推送所有變更到自己的 GitHub 倉庫，再執行：

```powershell
pnpm run release:win
```

指令會沿用 `electron-builder.json5` 的 Windows GitHub 目標，執行完整 `build:win` 發行檢查，再上傳安裝檔、blockmap 和 latest.yml，發布正式最新版並核對公開檔案。版本或 tag 已存在時會停止，不會覆蓋現有版本。

若上傳或發布中斷，請到 GitHub Releases 檢查並處理留下的草稿後再重試。若發布後的驗證失敗，Release 可能已公開，請先確認遠端狀態。

Install GitHub CLI and run `gh auth login`. Increase the version in `package.json`, commit and push all changes, then run the command above. It builds and verifies Windows locally, uploads the installer and update assets to the configured GitHub repository, publishes the latest release, and verifies the public files. Existing versions are never overwritten. Inspect any leftover draft before retrying; a failed post-publication check can leave an already published release.
