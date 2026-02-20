#!/usr/bin/env python3
"""Helper script for sessions.py fzf reload commands.

Called by fzf bind strings to list session files with active markers.
Kept as a separate file to avoid single-quote issues in inline shell commands
(meow.py raises ValueError on single quotes in bind strings).

Usage:
    python3 _sessions_list.py all       # list all sessions with [*]/[ ] markers
    python3 _sessions_list.py active    # list only active sessions
"""

import json
import os
import subprocess
import sys
from pathlib import Path


SESSIONS_DIR = Path(os.path.expanduser("~/.config/kitty/sessions"))


def get_active_names() -> set:
    """Get tab titles from kitty @ ls."""
    try:
        result = subprocess.run(
            ["kitty", "@", "ls"], capture_output=True, text=True
        )
        data = json.loads(result.stdout)
        names = set()
        for os_window in data:
            for tab in os_window.get("tabs", []):
                title = tab.get("title", "")
                if title:
                    names.add(title)
        return names
    except Exception:
        return set()


def get_session_files():
    """Return sorted .kitty-session files excluding template."""
    if not SESSIONS_DIR.exists():
        return []
    return sorted(
        p
        for p in SESSIONS_DIR.glob("*.kitty-session")
        if p.name != "template.kitty-session"
    )


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"
    active_names = get_active_names()
    session_files = get_session_files()

    for p in session_files:
        name = p.stem
        is_active = name in active_names

        if mode == "active" and not is_active:
            continue

        marker = "[*]" if is_active else "[ ]"
        print(f"{marker} {name}  {p}")


if __name__ == "__main__":
    main()
