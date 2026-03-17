"""Unix socket IPC server for kitty sidebar notifications."""

import atexit
import glob
import importlib
import json
import os
import socketserver
import subprocess
import threading
import time
from typing import Any, Dict, List, Optional, Tuple, cast

import sys

sys.path.insert(0, os.path.dirname(__file__))

notification_schema = importlib.import_module("notification_schema")

PANEL_SOCKET_PATH = notification_schema.PANEL_SOCKET_PATH
MAIN_KITTY_SOCKET_GLOB = notification_schema.MAIN_KITTY_SOCKET_GLOB
Notification = notification_schema.Notification
NotificationType = notification_schema.NotificationType
notification_to_dict = notification_schema.notification_to_dict
dict_to_notification = notification_schema.dict_to_notification
MSG_NOTIFY = notification_schema.MSG_NOTIFY
MSG_GET_STATE = notification_schema.MSG_GET_STATE
MSG_CLEAR = notification_schema.MSG_CLEAR
MSG_CLEAR_ALL = notification_schema.MSG_CLEAR_ALL


class SidebarRequestHandler(socketserver.StreamRequestHandler):
    """Handle newline-delimited JSON requests over Unix stream sockets."""

    def handle(self) -> None:
        while True:
            raw = self.rfile.readline()
            if not raw:
                break

            try:
                payload = json.loads(raw.decode("utf-8").strip())
            except (json.JSONDecodeError, UnicodeDecodeError):
                self._write_response({"ok": False, "error": "invalid_json"})
                continue

            server = cast("ThreadedUnixServer", self.server)
            if server.sidebar_server is None:
                response = {"ok": False, "error": "server_not_initialized"}
            else:
                response = server.sidebar_server.handle_message(payload)
            self._write_response(response)

    def _write_response(self, response: Dict[str, Any]) -> None:
        data = (json.dumps(response) + "\n").encode("utf-8")
        try:
            self.wfile.write(data)
            self.wfile.flush()
        except (BrokenPipeError, OSError):
            pass


class ThreadedUnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    """Threaded Unix domain socket server."""

    sidebar_server: Optional["SidebarServer"] = None
    daemon_threads = True
    allow_reuse_address = True


class SidebarServer:
    """IPC server backing kitty sidebar state and notification storage."""

    def __init__(self) -> None:
        self._notifications: Dict[str, List[Notification]] = {}
        self._lock = threading.Lock()
        self._server: Optional[ThreadedUnixServer] = None
        self._thread: Optional[threading.Thread] = None
        self._atexit_registered = False

    def start(self) -> None:
        if self._server is not None:
            return

        self._unlink_socket_if_present()

        server = ThreadedUnixServer(PANEL_SOCKET_PATH, SidebarRequestHandler)
        server.sidebar_server = self  # type: ignore[attr-defined]

        self._server = server
        self._thread = threading.Thread(target=server.serve_forever, daemon=True)
        self._thread.start()

        if not self._atexit_registered:
            atexit.register(self.stop)
            self._atexit_registered = True

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
            self._server = None

        self._thread = None
        self._unlink_socket_if_present()

    def handle_message(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        msg_type = payload.get("type")

        if msg_type == MSG_NOTIFY:
            session_name = payload.get("session_name")
            notification_type = payload.get("notification_type")
            message = payload.get("message")
            if not isinstance(session_name, str) or not isinstance(notification_type, str) or not isinstance(message, str):
                return {"ok": False, "error": "invalid_notify_payload"}

            try:
                normalized_type = NotificationType(notification_type).value
            except ValueError:
                return {"ok": False, "error": "invalid_notification_type"}

            self.add_notification(session_name, normalized_type, message)
            return {"ok": True}

        if msg_type == MSG_GET_STATE:
            return self.get_state()

        if msg_type == MSG_CLEAR:
            session_name = payload.get("session_name")
            if not isinstance(session_name, str):
                return {"ok": False, "error": "invalid_clear_payload"}

            self.clear_session(session_name)
            return {"ok": True}

        if msg_type == MSG_CLEAR_ALL:
            self.clear_all()
            return {"ok": True}

        return {"ok": False, "error": "unknown_message_type"}

    def add_notification(self, session_name: str, notification_type: str, message: str) -> None:
        notification = Notification(
            session_name=session_name,
            type=notification_type,
            message=message,
            timestamp=time.time(),
            read=False,
        )
        with self._lock:
            self._notifications.setdefault(session_name, []).append(notification)

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "notifications": {
                    session_name: [notification_to_dict(n) for n in notifications]
                    for session_name, notifications in self._notifications.items()
                }
            }

    def clear_session(self, session_name: str) -> None:
        with self._lock:
            self._notifications.pop(session_name, None)

    def clear_all(self) -> None:
        with self._lock:
            self._notifications.clear()

    def get_unread_sessions(self) -> List[str]:
        with self._lock:
            return [
                session_name
                for session_name, notifications in self._notifications.items()
                if any(not n.read for n in notifications)
            ]

    def get_latest_unread_session(self) -> Optional[str]:
        latest: Optional[Tuple[str, float]] = None
        with self._lock:
            for session_name, notifications in self._notifications.items():
                for notification in notifications:
                    if notification.read:
                        continue
                    if latest is None or notification.timestamp > latest[1]:
                        latest = (session_name, notification.timestamp)

        return latest[0] if latest else None

    def find_main_kitty_socket(self) -> Optional[str]:
        sockets = glob.glob(MAIN_KITTY_SOCKET_GLOB)
        if not sockets:
            return None
        return sockets[0]

    def poll_sessions(self) -> List[Dict[str, Any]]:
        session_files = self._get_session_files()
        loaded_sessions: List[Dict[str, Any]] = []

        for name, path in session_files:
            try:
                result = subprocess.run(
                    ["kitty", "@", "ls", "--match", f"session:{name}"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
            except FileNotFoundError:
                result = subprocess.run(
                    ["/Applications/kitty.app/Contents/MacOS/kitty", "@", "ls", "--match", f"session:{name}"],
                    capture_output=True,
                    text=True,
                    check=False,
                )

            if result.returncode != 0:
                continue

            try:
                data = json.loads(result.stdout.strip("\n"))
            except json.JSONDecodeError:
                continue

            tab_ids: List[int] = []
            active_window_id: Optional[int] = None
            for os_window in data:
                for tab in os_window.get("tabs", []):
                    tab_ids.append(tab["id"])
                    for window in tab.get("windows", []):
                        if window.get("is_active") or window.get("is_focused"):
                            active_window_id = window["id"]

            if tab_ids:
                loaded_sessions.append(
                    {
                        "name": name,
                        "path": path,
                        "tab_ids": tab_ids,
                        "active_window_id": active_window_id,
                    }
                )

        return loaded_sessions

    def _get_session_files(self) -> List[Tuple[str, str]]:
        sessions_dir = os.path.expanduser("~/.config/kitty/sessions")
        pattern = os.path.join(sessions_dir, "*.kitty-session")
        results: List[Tuple[str, str]] = []

        for full_path in sorted(glob.glob(pattern)):
            basename = os.path.basename(full_path)
            if basename == "template.kitty-session":
                continue
            name = basename.removesuffix(".kitty-session")
            results.append((name, full_path))

        return results

    def _unlink_socket_if_present(self) -> None:
        if not os.path.exists(PANEL_SOCKET_PATH):
            return
        try:
            os.unlink(PANEL_SOCKET_PATH)
        except OSError:
            pass


def deserialize_notifications(raw_state: Dict[str, Any]) -> Dict[str, List[Notification]]:
    """Helper for tests/consumers to rehydrate notifications from get_state payloads."""
    notifications = raw_state.get("notifications", {})
    result: Dict[str, List[Notification]] = {}
    for session_name, items in notifications.items():
        if not isinstance(session_name, str) or not isinstance(items, list):
            continue
        result[session_name] = [dict_to_notification(item) for item in items if isinstance(item, dict)]
    return result
