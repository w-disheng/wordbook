#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
WORDBOOK_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "$WORDBOOK_NODE" ]]; then WORDBOOK_NODE="$(command -v node)"; fi
if [[ -z "$WORDBOOK_NODE" ]]; then print '需要 Node.js 22 或更新版本。'; read '?按 Enter 关闭。'; exit 1; fi
print '本机词本默认地址：http://127.0.0.1:4173/'
print '请保留终端窗口，并在浏览器打开上面的地址。Ctrl+C 停止。'
"$WORDBOOK_NODE" server.mjs
