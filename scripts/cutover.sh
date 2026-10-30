#!/bin/bash
# ============================================================
# 门店任务管理平台 · 切换脚本（拆表版上线）
#   用法：
#     ./cutover.sh dry     # 演练：不改任何东西，只打印将执行的动作
#     ./cutover.sh apply   # 正式切换（停机约 1 分钟）
#     ./cutover.sh rollback <备份时间戳>   # 回退
#
#   目标：把 SOURCE（新代码）切到 TARGET（正式），并迁移数据库结构
#   数据来源：TARGET 自己的库（不用测试库，避免带入测试数据）
#   全程可回退：备份目录保留代码 + 数据库
# ============================================================
set -euo pipefail

MODE="${1:-dry}"
TARGET="${TARGET:-/opt/cwsj}"
SOURCE="${SOURCE:-/opt/cwsj-stg}"
SERVICE="${SERVICE:-cwsj}"
PORT="${PORT:-8789}"
NODE="/opt/node-v22.14.0-linux-x64/bin/node"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="/opt/cwsj-backups"
BACKUP="$BACKUP_ROOT/$STAMP"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

case "$MODE" in
dry)
  log "演练模式（不会改动任何文件）"
  echo "  目标目录 : $TARGET"
  echo "  代码来源 : $SOURCE"
  echo "  服务名   : $SERVICE (端口 $PORT)"
  echo "  备份目录 : $BACKUP"
  echo
  echo "将执行："
  echo "  1) 检查前置条件（服务存在、目录存在、node 可用）"
  echo "  2) 备份 $TARGET → $BACKUP（代码 + 数据库）"
  echo "  3) 停服务"
  echo "  4) 复制新代码到 $TARGET（保留 data/ 与 logs/）"
  echo "  5) 对 $TARGET/data/cwsj.db 执行拆表迁移"
  echo "  6) 起服务并核对（health / 数据条数 / 页面 200 / 表与 JSON 一致）"
  echo "  7) 任一步失败 → 自动回退到备份"
  ;;

apply)
  log "前置检查"
  systemctl cat "$SERVICE" >/dev/null 2>&1 || { echo "服务 $SERVICE 不存在"; exit 1; }
  [ -d "$TARGET" ] || { echo "目标目录不存在: $TARGET"; exit 1; }
  [ -d "$SOURCE" ] || { echo "来源目录不存在: $SOURCE"; exit 1; }
  [ -x "$NODE" ] || { echo "node 不存在: $NODE"; exit 1; }
  mkdir -p "$BACKUP_ROOT"

  fail_rollback() {
    log "❗ 失败，开始回退"
    systemctl stop "$SERVICE" || true
    rm -rf "$TARGET"
    cp -a "$BACKUP/cwsj" "$TARGET"
    cp -a "$BACKUP/cwsj.db" "$TARGET/data/cwsj.db"
    systemctl start "$SERVICE" || true
    sleep 3
    echo "回退后服务状态: $(systemctl is-active "$SERVICE")"
    exit 1
  }
  trap 'fail_rollback' ERR

  log "1/7 备份 → $BACKUP"
  mkdir -p "$BACKUP"
  cp -a "$TARGET" "$BACKUP/cwsj"
  cp -a "$TARGET/data/cwsj.db" "$BACKUP/cwsj.db"
  echo "  备份完成：$(du -sh "$BACKUP" | cut -f1)"

  log "2/7 停服务"
  systemctl stop "$SERVICE"
  sleep 1

  log "3/7 换代码（保留 data 与 logs）"
  mkdir -p "$TARGET/data" "$TARGET/logs"
  for f in src web scripts package.json; do
    [ -e "$SOURCE/$f" ] || continue
    rm -rf "$TARGET/$f"
    cp -a "$SOURCE/$f" "$TARGET/$f"
  done
  echo "  已替换：src web scripts package.json"

  # 去掉测试环境横幅（否则会跟着上线）
  if grep -q 'stg-banner' "$TARGET/web/index.html" 2>/dev/null; then
    sed -i '/测试环境横幅/d; /id="stg-banner"/d' "$TARGET/web/index.html"
    echo "  已移除测试环境横幅"
  fi
  if grep -q 'stg-banner' "$TARGET/web/index.html" 2>/dev/null; then
    echo "  ❌ 横幅未移除干净，中止"; false
  fi
  # 生产必须打开资源接口开关（拆表后的写路径依赖它）
  if ! grep -q '__TASK_API__' "$TARGET/web/index.html"; then
    sed -i 's#<script src="js/app.js#<script>window.__TASK_API__ = true; window.__DEMAND_API__ = true; window.__CONTACT_API__ = true;</script>\n  <script src="js/app.js#' "$TARGET/web/index.html"
    echo "  已写入资源接口开关"
  fi

  log "4/7 迁移数据库（拆表）"
  cd "$TARGET"
  "$NODE" scripts/migrate_split.js

  log "5/7 起服务"
  systemctl start "$SERVICE"
  sleep 3
  systemctl is-active "$SERVICE"

  log "6/7 核对"
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || echo 000)
  echo "  health: $code"
  [ "$code" = "200" ] || { echo "  健康检查失败"; false; }
  page=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || echo 000)
  echo "  首页: $page"
  [ "$page" = "200" ] || { echo "  首页异常"; false; }
  "$NODE" -e '
    const S=require("./src/db.js");const sp=require("./src/split.js");
    const j=S.getState().state, t=sp.readState();
    const n=x=>(x||[]).length;
    const a=[n(j.tasks),n(j.demands),n(j.contacts),n(j.stores)];
    const b=[n(t.tasks),n(t.demands),n(t.contacts),n(t.stores)];
    console.log("  JSON:", JSON.stringify(a), "表:", JSON.stringify(b));
    if (JSON.stringify(a)!==JSON.stringify(b)) { console.error("  ❌ 数据不一致"); process.exit(1); }
    console.log("  ✅ 数据一致");
  '

  log "7/7 完成"
  trap - ERR
  echo
  echo "  备份位置: $BACKUP"
  echo "  回退命令: TARGET=$TARGET SERVICE=$SERVICE $0 rollback $STAMP"
  ;;

rollback)
  TS="${2:-}"
  [ -n "$TS" ] || { echo "用法: $0 rollback <备份时间戳>"; ls -1 "$BACKUP_ROOT" 2>/dev/null | tail -5; exit 1; }
  B="$BACKUP_ROOT/$TS"
  [ -d "$B/cwsj" ] || { echo "备份不存在: $B"; exit 1; }
  log "回退到 $TS"
  systemctl stop "$SERVICE" || true
  rm -rf "$TARGET"
  cp -a "$B/cwsj" "$TARGET"
  cp -a "$B/cwsj.db" "$TARGET/data/cwsj.db"
  systemctl start "$SERVICE"
  sleep 3
  echo "  服务: $(systemctl is-active "$SERVICE")"
  echo "  health: $(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health")"
  ;;

*)
  echo "用法: $0 {dry|apply|rollback <时间戳>}"
  exit 1
  ;;
esac
