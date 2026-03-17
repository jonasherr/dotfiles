"""Kitten to toggle the notification sidebar as a vsplit pane."""

import os
import sys
from typing import List

from kitty.boss import Boss

SIDEBAR_TITLE = "notifications"


def main(args: List[str]) -> str:
    return "toggle"


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    tab = boss.active_tab
    if tab is None:
        return

    # Check if sidebar already exists in this tab
    for window in tab:
        if window.title == SIDEBAR_TITLE:
            boss.call_remote_control(None, ("close-window", "--match", f"id:{window.id}"))
            return

    # Sidebar not found — open it
    sidebar_path = os.path.expanduser("~/.config/kitty/meow/sidebar.py")
    boss.call_remote_control(None, (
        "launch",
        "--location=vsplit",
        "--bias=20",
        f"--title={SIDEBAR_TITLE}",
        "--dont-take-focus",
        sys.executable, sidebar_path,
    ))
