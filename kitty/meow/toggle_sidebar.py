"""Kitten to toggle the notification sidebar as a vsplit pane."""

import json
import os
import subprocess
import sys
from typing import List, Optional

SIDEBAR_VAR = "is_sidebar"
SIDEBAR_TITLE = "notifications"
KITTY_APP_BIN = "/Applications/kitty.app/Contents/MacOS/kitty"


def _run_kitty(*args: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["kitty", *args], capture_output=True, text=True, check=False,
        )
    except FileNotFoundError:
        return subprocess.run(
            [KITTY_APP_BIN, *args], capture_output=True, text=True, check=False,
        )


def _find_sidebar_in_current_tab() -> Optional[int]:
    result = _run_kitty("@", "ls")
    if result.returncode != 0:
        return None
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    for os_window in data:
        if not os_window.get("is_focused"):
            continue
        for tab in os_window.get("tabs", []):
            if not tab.get("is_focused"):
                continue
            for window in tab.get("windows", []):
                for key, val in window.get("user_vars", {}).items():
                    if key == SIDEBAR_VAR and val == "1":
                        return window.get("id")
    return None


from kitty.boss import Boss


def main(args: List[str]) -> str:
    wid = _find_sidebar_in_current_tab()
    if wid is not None:
        return f"close:{wid}"
    return "open"


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    if answer.startswith("close:"):
        wid = answer[6:]
        boss.call_remote_control(None, ("close-window", "--match", f"id:{wid}"))
    elif answer == "open":
        sidebar_path = os.path.join(os.path.dirname(__file__), "sidebar.py")
        boss.call_remote_control(None, (
            "launch",
            "--location=vsplit",
            "--bias=20",
            f"--var={SIDEBAR_VAR}=1",
            f"--title={SIDEBAR_TITLE}",
            "--keep-focus",
            sys.executable, sidebar_path,
        ))
