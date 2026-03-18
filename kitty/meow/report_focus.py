"""Kitty watcher: report focused window to the sidebar daemon.

Loaded as a global watcher via `watcher meow/report_focus.py` in kitty.conf.
On every focus change, sends `set_active_window` to the daemon so it knows
which window was last active in each session.
"""

import json
import os
import socket
import threading
from typing import Any, Optional

from kitty.boss import Boss
from kitty.window import Window

PANEL_SOCKET_PATH = "/tmp/kitty-sidebar.sock"
SESSIONS_DIR = os.path.expanduser("~/.config/kitty/sessions")
SESSION_SUFFIX = ".kitty-session"

# Cache session cd paths: session_name -> resolved directory
_session_dirs: dict[str, str] = {}
_session_dirs_mtime: float = 0.0


def _load_session_dirs() -> dict[str, str]:
    """Read session files and extract the cd path from each."""
    global _session_dirs, _session_dirs_mtime
    try:
        current_mtime = os.path.getmtime(SESSIONS_DIR)
    except OSError:
        return _session_dirs
    if current_mtime == _session_dirs_mtime and _session_dirs:
        return _session_dirs

    home = os.path.expanduser("~")
    dirs: dict[str, str] = {}
    try:
        for entry in os.listdir(SESSIONS_DIR):
            if not entry.endswith(SESSION_SUFFIX) or entry == f"template{SESSION_SUFFIX}":
                continue
            name = entry.removesuffix(SESSION_SUFFIX)
            path = os.path.join(SESSIONS_DIR, entry)
            try:
                with open(path) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("cd "):
                            cd_path = line[3:].strip().replace("~", home, 1)
                            dirs[name] = cd_path
                            break
            except OSError:
                continue
    except OSError:
        return _session_dirs

    _session_dirs = dirs
    _session_dirs_mtime = current_mtime
    return dirs


def _resolve_session_from_cwd(cwd: str) -> Optional[str]:
    """Match a window's cwd to a session by checking session cd paths."""
    dirs = _load_session_dirs()
    for name, session_dir in dirs.items():
        if cwd == session_dir or cwd.startswith(session_dir + "/"):
            return name
    return None


def _send_active_window(session_name: str, window_id: int) -> None:
    """Fire-and-forget send to daemon socket."""
    payload = json.dumps({
        "type": "set_active_window",
        "session_name": session_name,
        "window_id": window_id,
    })
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.settimeout(0.5)
        sock.connect(PANEL_SOCKET_PATH)
        sock.sendall((payload + "\n").encode("utf-8"))
    except OSError:
        pass
    finally:
        sock.close()


def on_focus_change(boss: Boss, window: Window, data: dict[str, Any]) -> None:
    """Called by kitty on every window focus change."""
    if not data.get("focused"):
        return
    if not os.path.exists(PANEL_SOCKET_PATH):
        return

    window_id = window.id
    cwd = window.cwd_of_child

    if not cwd:
        return

    # Run resolution + send in a background thread to avoid blocking kitty
    def _report() -> None:
        try:
            session_name = _resolve_session_from_cwd(cwd)
            if session_name:
                _send_active_window(session_name, window_id)
        except Exception:
            pass

    threading.Thread(target=_report, daemon=True).start()
