"""Kitten to jump to the session with the most recent unread notification."""

import json
import os
import socket
import sys
from typing import List

# Import notification constants — use importlib to avoid polluting sys.path
# before kitty.boss is resolved.
import importlib

_schema_dir = os.path.dirname(__file__)
if _schema_dir not in sys.path:
    sys.path.insert(0, _schema_dir)
notification_schema = importlib.import_module("notification_schema")
PANEL_SOCKET_PATH: str = notification_schema.PANEL_SOCKET_PATH
MSG_GET_STATE: str = notification_schema.MSG_GET_STATE
MSG_CLEAR: str = notification_schema.MSG_CLEAR

from kitty.boss import Boss


def _query_socket(msg: dict) -> dict:
    """Send a JSON message to the panel socket and return the response."""
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(2.0)
    try:
        sock.connect(PANEL_SOCKET_PATH)
        sock.sendall((json.dumps(msg) + "\n").encode())
        data = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"\n" in data:
                break
        return json.loads(data.decode().strip())
    finally:
        sock.close()


def main(args: List[str]) -> str:
    """Connect to panel socket, find session with latest unread notification."""
    try:
        response = _query_socket({"type": MSG_GET_STATE})
        notifications = response.get("notifications", {})

        # Find session with latest unread notification
        latest_session = None
        latest_ts = 0.0
        for session_name, notifs in notifications.items():
            for n in notifs:
                if not n.get("read", False) and n.get("timestamp", 0) > latest_ts:
                    latest_ts = n["timestamp"]
                    latest_session = session_name

        if latest_session:
            # Clear the notification since we're jumping to it
            try:
                _query_socket({"type": MSG_CLEAR, "session_name": latest_session})
            except Exception:
                pass
            return os.path.expanduser(
                f"~/.config/kitty/sessions/{latest_session}.kitty-session"
            )
        return ""
    except Exception:
        return ""


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    """Jump to the session if one was found."""
    if not answer:
        return
    boss.call_remote_control(None, ("action", "goto_session", answer))
    boss.call_remote_control(
        None,
        ("set-tab-color", "--self", "active_bg=NONE", "inactive_bg=NONE"),
    )
