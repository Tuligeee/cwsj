#!/bin/bash
# 保存并上传当前改动到 GitHub
#   ./scripts/save.sh "改了什么"
# 会自动：git add -A → commit（中文说明）→ push main
set -euo pipefail
APP="${APP:-/opt/cwsj}"
cd "$APP"

MSG="${1:-}"
[ -n "$MSG" ] || { echo "用法: $0 \"这次改了什么\""; exit 1; }

git add -A
if git diff --cached --quiet; then
  echo "没有改动需要提交"
  exit 0
fi
git -c user.name=Tuligeee -c user.email=Tuligeee@users.noreply.github.com commit -qm "$MSG"
git push -q origin main
echo "已提交并推送: $(git log -1 --pretty='%h %s')"
