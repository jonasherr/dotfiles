#!/usr/bin/env python3
"""Kitty sidebar panel — session list with notification badges."""

import curses
import glob
import importlib
import json
import os
import socket
import subprocess
import sys
import threading
import time
from typing import Optional, cast

sys.path.insert(0, os.path.dirname(__file__))
notification_schema = importlib.import_module("notification_schema")
MAIN_KITTY_SOCKET_GLOB = cast(str, notification_schema.MAIN_KITTY_SOCKET_GLOB)
MSG_CLEAR = cast(str, notification_schema.MSG_CLEAR)
MSG_GET_STATE = cast(str, notification_schema.MSG_GET_STATE)
PANEL_SOCKET_PATH = cast(str, notification_schema.PANEL_SOCKET_PATH)

KITTY_APP_BIN = "/Applications/kitty.app/Contents/MacOS/kitty"
SESSIONS_DIR = os.path.expanduser("~/.config/kitty/sessions")
POLL_INTERVAL = 2.0
BADGE = "🔴"
UNREAD_COLOR = "#e67e80"

# Color pairs
PAIR_HEADER = 1
PAIR_ACTIVE = 2
PAIR_BADGE = 3
PAIR_TAB = 4
PAIR_FOOTER = 5
PAIR_SELECTED = 6


def run_kitty(*args: str) -> subprocess.CompletedProcess[str]:
    """Run kitty command, trying PATH first then app bundle."""
    try:
        return subprocess.run(
            ["kitty", *args],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return subprocess.run(
            [KITTY_APP_BIN, *args],
            capture_output=True,
            text=True,
            check=False,
        )


def apply_tab_color(main_socket: Optional[str], session_name: str, color: Optional[str]) -> None:
    """Apply or reset tab color for a session."""
    if not main_socket:
        return

    if color:
        _ = run_kitty(
            "@",
            "--to",
            main_socket,
            "set-tab-color",
            "--match",
            f"session:{session_name}",
            f"active_bg={color}",
        )
        return

    _ = run_kitty(
        "@",
        "--to",
        main_socket,
        "set-tab-color",
        "--match",
        f"session:{session_name}",
        "active_bg=NONE",
        "inactive_bg=NONE",
    )


def init_colors() -> None:
    """Initialize curses color pairs using Everforest Dark Soft palette."""
    curses.start_color()
    curses.use_default_colors()

    if curses.COLORS >= 256:
        curses.init_pair(PAIR_HEADER, 187, -1)
        curses.init_pair(PAIR_ACTIVE, 223, -1)
        curses.init_pair(PAIR_BADGE, 196, -1)
        curses.init_pair(PAIR_TAB, 245, -1)
        curses.init_pair(PAIR_FOOTER, 187, 238)
        curses.init_pair(PAIR_SELECTED, 108, -1)
    else:
        curses.init_pair(PAIR_HEADER, curses.COLOR_WHITE, -1)
        curses.init_pair(PAIR_ACTIVE, curses.COLOR_YELLOW, -1)
        curses.init_pair(PAIR_BADGE, curses.COLOR_RED, -1)
        curses.init_pair(PAIR_TAB, curses.COLOR_WHITE, -1)
        curses.init_pair(PAIR_FOOTER, curses.COLOR_WHITE, curses.COLOR_BLACK)
        curses.init_pair(PAIR_SELECTED, curses.COLOR_GREEN, -1)


class SidebarApp:
    def __init__(self):
        self.sessions: list[dict[str, object]] = []
        self.unread_sessions: set[str] = set()
        self.current_session: Optional[str] = None
        self.selected_idx: int = 0
        self.main_socket: Optional[str] = None
        self._lock: threading.Lock = threading.Lock()
        self._stop_event: threading.Event = threading.Event()
        self._poll_thread: Optional[threading.Thread] = None

    def _query_server(self, msg: dict[str, object]) -> dict[str, object]:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            sock.settimeout(1.0)
            sock.connect(PANEL_SOCKET_PATH)
            sock.sendall((json.dumps(msg) + "\n").encode("utf-8"))
            payload = sock.recv(65536).decode("utf-8").strip()
            if not payload:
                return {}
            parsed = cast(object, json.loads(payload))
            return cast(dict[str, object], parsed) if isinstance(parsed, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}
        finally:
            sock.close()

    def _get_session_files(self) -> list[tuple[str, str]]:
        pattern = os.path.join(SESSIONS_DIR, "*.kitty-session")
        results: list[tuple[str, str]] = []
        for full_path in sorted(glob.glob(pattern)):
            basename = os.path.basename(full_path)
            if basename == "template.kitty-session":
                continue
            name = basename.removesuffix(".kitty-session")
            results.append((name, full_path))
        return results

    def _poll_sessions(self) -> list[dict[str, object]]:
        loaded_sessions: list[dict[str, object]] = []
        for name, path in self._get_session_files():
            result = run_kitty("@", "ls", "--match", f"session:{name}")
            if result.returncode != 0:
                continue

            try:
                parsed = cast(object, json.loads(result.stdout.strip("\n")))
            except json.JSONDecodeError:
                continue

            tab_ids: list[int] = []
            active_window_id: Optional[int] = None
            if isinstance(parsed, list):
                for os_window_obj in cast(list[object], parsed):
                    if not isinstance(os_window_obj, dict):
                        continue
                    os_window = cast(dict[str, object], os_window_obj)
                    tabs_obj = os_window.get("tabs", [])
                    if not isinstance(tabs_obj, list):
                        continue
                    for tab_obj in cast(list[object], tabs_obj):
                        if not isinstance(tab_obj, dict):
                            continue
                        tab = cast(dict[str, object], tab_obj)
                        tab_id = tab.get("id")
                        if isinstance(tab_id, int):
                            tab_ids.append(tab_id)
                        windows_obj = tab.get("windows", [])
                        if not isinstance(windows_obj, list):
                            continue
                        for window_obj in cast(list[object], windows_obj):
                            if not isinstance(window_obj, dict):
                                continue
                            window = cast(dict[str, object], window_obj)
                            window_id = window.get("id")
                            if isinstance(window_id, int) and (window.get("is_active") or window.get("is_focused")):
                                active_window_id = window_id

            if tab_ids:
                loaded_sessions.append({"name": name, "path": path, "tab_ids": tab_ids, "active_window_id": active_window_id})

        return loaded_sessions

    def poll(self) -> None:
        """Poll sessions and re-apply unread tab colors."""
        sessions = self._poll_sessions()
        state = self._query_server({"type": MSG_GET_STATE})
        notifications = state.get("notifications", {})
        unread: set[str] = set()
        if isinstance(notifications, dict):
            for name, items in cast(dict[object, object], notifications).items():
                if isinstance(name, str) and isinstance(items, list) and items:
                    unread.add(name)

        current: Optional[str] = None
        for session in sessions:
            if session.get("active_window_id") is not None:
                current = str(session.get("name"))
                break

        with self._lock:
            self.sessions = sessions
            self.unread_sessions = unread
            if current:
                self.current_session = current
            elif self.current_session is not None and not any(s.get("name") == self.current_session for s in sessions):
                self.current_session = None

            if self.sessions:
                self.selected_idx = max(0, min(self.selected_idx, len(self.sessions) - 1))
            else:
                self.selected_idx = 0

            main_socket = self.main_socket

        for session in sessions:
            name = str(session.get("name", ""))
            if name and name in unread:
                apply_tab_color(main_socket, name, UNREAD_COLOR)

    def start_polling(self) -> None:
        """Start background polling thread."""

        def loop() -> None:
            while not self._stop_event.is_set():
                self.poll()
                _ = self._stop_event.wait(POLL_INTERVAL)

        sockets = glob.glob(MAIN_KITTY_SOCKET_GLOB)
        self.main_socket = sockets[0] if sockets else None
        self.poll()
        self._poll_thread = threading.Thread(target=loop, daemon=True)
        self._poll_thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._poll_thread and self._poll_thread.is_alive():
            self._poll_thread.join(timeout=1.0)

    def switch_to_selected(self) -> None:
        """Switch to selected session and clear notifications."""
        with self._lock:
            if not self.sessions:
                return
            selected = self.sessions[self.selected_idx]
            session_name = str(selected.get("name", ""))

        if not session_name:
            return

        session_file = os.path.join(SESSIONS_DIR, f"{session_name}.kitty-session")
        if not os.path.exists(session_file):
            return

        _ = run_kitty("@", "action", "goto_session", session_file)
        _ = self._query_server({"type": MSG_CLEAR, "session_name": session_name})
        apply_tab_color(self.main_socket, session_name, None)

        with self._lock:
            self.current_session = session_name

    def draw(self, stdscr: "curses.window") -> None:
        """Draw sidebar list with badges and active session tabs."""
        stdscr.erase()
        max_y, max_x = stdscr.getmaxyx()
        if max_y < 4 or max_x < 20:
            try:
                stdscr.addstr(0, 0, "Terminal too small")
                stdscr.refresh()
            except curses.error:
                pass
            return

        with self._lock:
            sessions = list(self.sessions)
            current_session = self.current_session
            selected_idx = self.selected_idx
            unread = set(self.unread_sessions)

        def safe_addstr(row: int, col: int, text: str, attr: int = 0) -> None:
            try:
                stdscr.addstr(row, col, text[: max(0, max_x - col - 1)], attr)
            except curses.error:
                pass

        # Header
        title = "Sessions"
        safe_addstr(0, 0, f"┌─ {title} " + "─" * max(0, max_x - len(title) - 5) + "┐", curses.color_pair(PAIR_HEADER) | curses.A_BOLD)

        row = 1
        body_bottom = max_y - 2
        for idx, session in enumerate(sessions):
            if row > body_bottom:
                break

            name = str(session.get("name", ""))
            is_selected = idx == selected_idx
            is_active = name == current_session
            badge = f" {BADGE}" if name in unread else ""

            if is_selected:
                name_attr = curses.color_pair(PAIR_SELECTED) | curses.A_BOLD
            elif is_active:
                name_attr = curses.color_pair(PAIR_ACTIVE) | curses.A_BOLD
            else:
                name_attr = curses.color_pair(PAIR_HEADER)

            safe_addstr(row, 0, "│")
            label = f" {name}"[: max(1, max_x - 4)]
            safe_addstr(row, 1, label, name_attr)

            if badge:
                badge_col = min(max_x - 3, 1 + len(label))
                safe_addstr(row, badge_col, badge, curses.color_pair(PAIR_BADGE) | curses.A_BOLD)

            safe_addstr(row, max_x - 1, "│")
            row += 1

            if is_active:
                tab_ids = cast(list[int], session.get("tab_ids", []))
                for tab_id in tab_ids:
                    if row > body_bottom:
                        break
                    safe_addstr(row, 0, "│")
                    tab_label = f"   └ tab {tab_id}"
                    safe_addstr(row, 1, tab_label[: max(1, max_x - 3)], curses.color_pair(PAIR_TAB))
                    safe_addstr(row, max_x - 1, "│")
                    row += 1

        while row <= body_bottom:
            safe_addstr(row, 0, "│")
            safe_addstr(row, max_x - 1, "│")
            row += 1

        safe_addstr(max_y - 2, 0, "└" + "─" * max(0, max_x - 2) + "┘")

        footer = "j/k: navigate  Enter: switch  q: quit"
        footer_attr = curses.color_pair(PAIR_FOOTER)
        safe_addstr(max_y - 1, 0, " " * (max_x - 1), footer_attr)
        safe_addstr(max_y - 1, 0, footer[: max_x - 1], footer_attr)
        stdscr.refresh()

    def run(self, stdscr: "curses.window") -> None:
        """Main curses event loop."""
        _ = curses.curs_set(0)
        stdscr.keypad(True)
        stdscr.nodelay(True)
        stdscr.timeout(200)
        init_colors()

        while True:
            self.draw(stdscr)
            key = stdscr.getch()

            if key == -1:
                continue
            if key in (ord("q"), 27):
                return

            with self._lock:
                total = len(self.sessions)
                if key in (ord("j"), curses.KEY_DOWN):
                    if total:
                        self.selected_idx = (self.selected_idx + 1) % total
                elif key in (ord("k"), curses.KEY_UP):
                    if total:
                        self.selected_idx = (self.selected_idx - 1) % total
                elif key in (10, 13, curses.KEY_ENTER):
                    pass
                else:
                    continue

            if key in (10, 13, curses.KEY_ENTER):
                self.switch_to_selected()


def main() -> None:
    if not is_daemon_running():
        _ = subprocess.Popen(
            [sys.executable, os.path.join(os.path.dirname(__file__), "sidebar_daemon.py")],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(0.5)

    app = SidebarApp()
    app.start_polling()
    try:
        curses.wrapper(app.run)
    finally:
        app.stop()


def is_daemon_running() -> bool:
    if not os.path.exists(PANEL_SOCKET_PATH):
        return False

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.settimeout(1.0)
        sock.connect(PANEL_SOCKET_PATH)
        sock.sendall((json.dumps({"type": MSG_GET_STATE}) + "\n").encode("utf-8"))
        data = sock.recv(4096)
        return bool(data)
    except OSError:
        return False
    finally:
        sock.close()


if __name__ == "__main__":
    main()
