#!/bin/zsh
# Enter the existing API key locally; it is never sent through the chat or browser.
cd -- "$(dirname -- "$0")" || exit 1
if [[ -e .env ]]; then
  read 'WORDBOOK_REPLACE?.env 已存在。要替换当前 AI 配置吗？输入 yes 确认：'
  [[ "$WORDBOOK_REPLACE" == 'yes' ]] || exit 0
fi
print '请粘贴你在 OpenAI API Platform 创建的 API key（输入不显示）：'
read -rs WORDBOOK_API_KEY
print ''
if [[ "$WORDBOOK_API_KEY" != sk-* ]]; then print '未保存：这看起来不是 OpenAI API key。'; read '?按 Enter 关闭。'; exit 1; fi
umask 077
printf 'OPENAI_API_KEY=%s\nOPENAI_MODEL=gpt-6-luna\nPORT=4173\n' "$WORDBOOK_API_KEY" > .env
unset WORDBOOK_API_KEY
print '已保存到本机 .env。请重新打开 Start.command。'
read '?按 Enter 关闭。'
