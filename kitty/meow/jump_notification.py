"""Kitten to jump to the session with the most recent unread notification."""

import json
import os
import socket
import sys
from typing import List

sys.path.insert(0, os.path.dirname(__file__))
from notification_schema import PANEL_SOCKET_PATH, MSG_GET_STATE

from kitty.boss import Boss


def main(args: List[str]) -> str:
    """Connect to panel socket, find session with latest unread notification."""
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(2.0)
        try:
            sock.connect(PANEL_SOCKET_PATH)
            msg = json.dumps({"type": MSG_GET_STATE}) + "\n"
            sock.sendall(msg.encode())
            # Read response
            data = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                data += chunk
                if b"\n" in data:
                    break
        finally:
            sock.close()

        response = json.loads(data.decode().strip())
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
