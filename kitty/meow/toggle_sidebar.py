"""Kitten to toggle the notification sidebar as a vsplit pane."""

import os
from typing import List

from kitty.boss import Boss

SIDEBAR_VAR = "is_sidebar"


def main(args: List[str]) -> str:
    return "toggle"


def _is_sidebar_window(window) -> bool:
    wd = window.as_dict()
    if wd.get("user_vars", {}).get(SIDEBAR_VAR) == "1":
        return True
    cmdline = wd.get("cmdline", [])
    for arg in cmdline:
        s = str(arg)
        if s.endswith("/sidebar.py") or s == "sidebar.py":
            return True
    return False


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    tab = boss.active_tab
    if tab is None:
        return

    # Check if sidebar already exists in this tab — close it
    for window in tab:
        if _is_sidebar_window(window):
            window.close()
            return

    # Sidebar not found — open it
    sidebar_path = os.path.expanduser("~/.config/kitty/meow/sidebar.py")
    boss.call_remote_control(boss.active_window, (
        "launch",
        "--location=vsplit",
        "--bias=20",
        f"--var={SIDEBAR_VAR}=1",
        "python3", sidebar_path,
    ))

    # Focus sidebar, then move it to the left edge (move_to_screen_edge
    # operates on the ACTIVE window, so we must focus it first)
    for window in tab:
        if _is_sidebar_window(window):
            boss.call_remote_control(None, (
                "focus-window", "--match", f"id:{window.id}",
            ))
            boss.call_remote_control(None, (
                "action", "layout_action", "splits", "move_to_screen_edge", "left",
            ))
            break
