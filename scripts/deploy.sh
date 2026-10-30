#!/bin/bash
# ============================================================
# cwsj 部署 / 回退（基于 GitHub 版本标签）
#
#   ./scripts/deploy.sh list                列出所有版本
#   ./scripts/deploy.sh status              当前线上版本
#   ./scripts/deploy.sh v1.0.0              部署指定版本（只换代码，数据不动）
#   ./scripts/deploy.sh v1.0.0 --with-data  连数据一起回到"该版本部署时"的数据库
#   ./scripts/deploy.sh rollback            退回上一个版本（只换代码）
#
# 每次部署都会把当时的数据库存一份到 /opt/cwsj-backups/deploy-<tag>-<时间>/
# 所以任何一次部署的"代码 + 当时数据"都能整体还原。
# ============================================================
set -euo pipefail

APP="${APP:-/opt/cwsj}"
SERVICE="${SERVICE:-cwsj}"
PORT="${PORT:-8789}"
NODE="/opt/node-v22.14.0-linux-x64/bin/node"
BK_ROOT="${BK_ROOT:-/opt/cwsj-backups}"
TS="$(date +%Y%m%d-%H%M%S)"

cd "$APP"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
cur_tag() { git describe --tags --abbrev=0 2>/dev/null || echo "untagged"; }
health() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/health" || echo 000; }

case "${1:-}" in
list)
  git fetch -q --tags
  echo "可用版本（新 → 旧）："
  git for-each-ref --sort=-creatordate --format='  %(refname:short)  %(creatordate:short)  %(contents:subject)' refs/tags
  echo
  echo "当前线上：$(cur_tag)"
  ;;

status)
  echo "当前版本 : $(cur_tag)"
  echo "服务状态 : $(systemctl is-active "$SERVICE")"
  echo "健康检查 : $(health)"
  echo "最近提交 : $(git log -1 --pretty='%h %s')"
  echo "部署历史 : $(tail -3 "$APP/data/deploy-history.log" 2>/dev/null | tr '\n' ' ' || echo 无)"
  ;;

rollback)
  HIST="$APP/data/deploy-history.log"
  [ -f "$HIST" ] || { echo "还没有部署历史（先执行一次 deploy <版本>）"; exit 1; }
  CUR="$(cur_tag)"
  # 历史里最后一个不是当前版本的标签，才是"上一版"
  PREV="$(awk '{print $1}' "$HIST" | awk -v cur="$CUR" '$0!=cur' | tail -1)"
  [ -n "$PREV" ] || PREV="$(awk '{print $1}' "$HIST" | tail -2 | head -1)"
  [ -n "$PREV" ] || { echo "没有上一个版本可退"; exit 1; }
  log "回退：$CUR → $PREV（依据部署历史）"
  exec "$0" "$PREV"
  ;;

""|*--help|-h)
  sed -n '2,20p' "$0"
  exit 0
  ;;

*)
  TAG="$1"
  WITH_DATA="no"
  [ "${2:-}" = "--with-data" ] && WITH_DATA="yes"

  git fetch -q --tags
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null || { echo "版本不存在: $TAG（用 list 查看）"; exit 1; }

  OLD_TAG="$(cur_tag)"
  log "部署 $TAG（当前 $OLD_TAG，$([ "$WITH_DATA" = yes ] && echo '含数据' || echo '仅代码')）"

  log "1/6 备份当前状态"
  mkdir -p "$BK_ROOT/deploy-$TAG-$TS"
  cp "$APP/data/cwsj.db" "$BK_ROOT/deploy-$TAG-$TS/cwsj.db"
  echo "$OLD_TAG" > "$BK_ROOT/deploy-$TAG-$TS/from-tag.txt"
  echo "$TAG" > "$BK_ROOT/deploy-$TAG-$TS/to-tag.txt"
  echo "  → $BK_ROOT/deploy-$TAG-$TS（代码版本 $OLD_TAG + 当时的数据库）"

  log "2/6 停服务"
  systemctl stop "$SERVICE"
  sleep 1

  restore_old() {
    log "❗ 部署失败，回退代码到 $OLD_TAG"
    git checkout -fq "$OLD_TAG" 2>/dev/null || true
    systemctl start "$SERVICE" || true
    sleep 3
    echo "  回退后健康检查: $(health)"
    exit 1
  }
  trap 'restore_old' ERR

  log "3/6 切换代码 → $TAG"
  git checkout -fq "$TAG"

  if [ "$WITH_DATA" = "yes" ]; then
    log "3.5/6 还原数据（该版本最近一次部署时点的数据库）"
    SRC_DB="$(ls -1t "$BK_ROOT"/deploy-"$TAG"-*/cwsj.db 2>/dev/null | head -1 || true)"
    if [ -n "$SRC_DB" ]; then
      cp "$APP/data/cwsj.db" "$BK_ROOT/deploy-$TAG-$TS/cwsj.db.before-restore"
      cp "$SRC_DB" "$APP/data/cwsj.db"
      echo "  使用了: $SRC_DB"
    else
      echo "  ⚠ 该版本没有历史数据库快照，仅回退代码"
    fi
  fi

  log "4/6 起服务"
  systemctl start "$SERVICE"
  sleep 3
  systemctl is-active "$SERVICE"

  log "5/6 健康检查"
  H="$(health)"
  echo "  health: $H"
  [ "$H" = "200" ] || restore_old

  log "6/6 数据一致性"
  "$NODE" -e '
    try {
      const S=require("./src/db.js"); const sp=require("./src/split.js");
      const j=S.getState().state, t=sp.readState();
      const n=x=>(x||[]).length;
      const a=[n(j.tasks),n(j.demands),n(j.contacts)];
      const b=[n(t.tasks),n(t.demands),n(t.contacts)];
      console.log("  JSON:",JSON.stringify(a),"表:",JSON.stringify(b), JSON.stringify(a)===JSON.stringify(b)?"✅":"⚠ 不一致（旧版本无表结构时正常）");
    } catch(e){ console.log("  （该版本无拆表结构，跳过）"); }
  '

  trap - ERR
  mkdir -p "$APP/data"
  echo "$TAG $(date +%Y-%m-%dT%H:%M:%S)" >> "$APP/data/deploy-history.log"
  log "完成：现在线上是 $TAG"
  echo "  备份目录: $BK_ROOT/deploy-$TAG-$TS"
  echo "  如需回退: $0 rollback"
  ;;
esac
