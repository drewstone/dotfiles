#!/usr/bin/env bash
# Notify when Claude Code completes a task.
# macOS: native notification center. Linux: notify-send if available.
case "$(uname -s)" in
  Darwin)
    osascript -e 'display notification "Task finished" with title "Claude Code"' 2>/dev/null
    ;;
  Linux)
    command -v notify-send &>/dev/null && notify-send "Claude Code" "Task finished" 2>/dev/null
    ;;
esac
exit 0
