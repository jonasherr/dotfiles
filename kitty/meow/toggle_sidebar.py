"""Kitten to toggle the notification sidebar as a vsplit pane."""

import os
from typing import List

from kitty.boss import Boss
from kitty.layout.splits import Pair

SIDEBAR_VAR = "is_sidebar"
SIDEBAR_BIAS = 0.2


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
    layout = tab.current_layout
    if not hasattr(layout, "pairs_root"):
        return

    # Record tree state before launch
    ids_before = set(layout.pairs_root.all_window_ids())

    # Launch sidebar
    sidebar_path = os.path.expanduser("~/.config/kitty/meow/sidebar.py")
    boss.call_remote_control(boss.active_window, (
        "launch",
        "--location=vsplit",
        f"--var={SIDEBAR_VAR}=1",
        "python3", sidebar_path,
    ))

    # Find the new group ID by diffing the tree
    ids_after = set(layout.pairs_root.all_window_ids())
    new_ids = ids_after - ids_before
    if not new_ids:
        return
    sidebar_gid = new_ids.pop()

    # Restructure: remove sidebar from wherever it landed,
    # then make it the root-level left column
    layout.remove_windows(sidebar_gid)
    old_root = layout.pairs_root
    new_root = Pair(horizontal=True)
    new_root.one = sidebar_gid
    new_root.two = old_root
    new_root.bias = SIDEBAR_BIAS
    layout.pairs_root = new_root

    tab.relayout()

    # Focus the sidebar
    for window in tab:
        if _is_sidebar_window(window):
            boss.call_remote_control(None, (
                "focus-window", "--match", f"id:{window.id}",
            ))
            break
