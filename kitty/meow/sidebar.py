#!/usr/bin/env python3
"""Persistent notification sidebar — runs in a vsplit pane."""

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

_schema_dir = os.path.dirname(__file__)
if _schema_dir not in sys.path:
    sys.path.insert(0, _schema_dir)
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

PAIR_HEADER = 1
PAIR_ACTIVE = 2
PAIR_BADGE = 3
PAIR_TAB = 4
PAIR_FOOTER = 5
PAIR_SELECTED = 6


def run_kitty(*args: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            ["kitty", *args], capture_output=True, text=True, check=False,
        )
    except FileNotFoundError:
        return subprocess.run(
            [KITTY_APP_BIN, *args], capture_output=True, text=True, check=False,
        )


def query_daemon(msg: dict[str, object]) -> dict[str, object]:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.settimeout(1.0)
        sock.connect(PANEL_SOCKET_PATH)
        sock.sendall((json.dumps(msg) + "\n").encode("utf-8"))
        payload = sock.recv(65536).decode("utf-8").strip()
        if not payload:
            return {}
        parsed = json.loads(payload)
        return parsed if isinstance(parsed, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}
    finally:
        sock.close()


def ensure_daemon() -> None:
    if os.path.exists(PANEL_SOCKET_PATH):
        try:
            if query_daemon({"type": MSG_GET_STATE}):
                return
        except Exception:
            pass
    subprocess.Popen(
        [sys.executable, os.path.join(os.path.dirname(__file__), "sidebar_daemon.py")],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(0.5)


def apply_tab_color(main_socket: Optional[str], session_name: str, color: Optional[str]) -> None:
    if not main_socket:
        return
    if color:
        run_kitty("@", "--to", main_socket, "set-tab-color",
                  "--match", f"session:{session_name}", f"active_bg={color}")
    else:
        run_kitty("@", "--to", main_socket, "set-tab-color",
                  "--match", f"session:{session_name}", "active_bg=NONE", "inactive_bg=NONE")


def get_session_files() -> list[tuple[str, str]]:
    pattern = os.path.join(SESSIONS_DIR, "*.kitty-session")
    results: list[tuple[str, str]] = []
    for full_path in sorted(glob.glob(pattern)):
        base = os.path.basename(full_path)
        if base == "template.kitty-session":
            continue
        results.append((base.removesuffix(".kitty-session"), full_path))
    return results


def poll_sessions() -> list[dict[str, object]]:
    loaded: list[dict[str, object]] = []
    for name, path in get_session_files():
        result = run_kitty("@", "ls", "--match", f"session:{name}")
        if result.returncode != 0:
            continue
        try:
            data = json.loads(result.stdout.strip("\n"))
        except json.JSONDecodeError:
            continue
        if not isinstance(data, list):
            continue
        tab_ids: list[int] = []
        active_window_id: Optional[int] = None
        for os_win in data:
            for tab in os_win.get("tabs", []):
                tid = tab.get("id")
                if isinstance(tid, int):
                    tab_ids.append(tid)
                for win in tab.get("windows", []):
                    wid = win.get("id")
                    if isinstance(wid, int) and (win.get("is_active") or win.get("is_focused")):
                        active_window_id = wid
        if tab_ids:
            loaded.append({"name": name, "path": path, "tab_ids": tab_ids, "active_window_id": active_window_id})
    return loaded


def get_unread() -> set[str]:
    state = query_daemon({"type": MSG_GET_STATE})
    notifications = state.get("notifications", {})
    unread: set[str] = set()
    if isinstance(notifications, dict):
        for name, items in notifications.items():
            if isinstance(name, str) and isinstance(items, list) and items:
                unread.add(name)
    return unread


def init_colors() -> None:
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
    def __init__(self) -> None:
        self.sessions: list[dict[str, object]] = []
        self.unread: set[str] = set()
        self.current_session: Optional[str] = None
        self.selected_idx: int = 0
        self.main_socket: Optional[str] = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def refresh(self) -> None:
        sessions = poll_sessions()
        unread = get_unread()
        current: Optional[str] = None
        for s in sessions:
            if s.get("active_window_id") is not None:
                current = str(s.get("name"))
                break
        with self._lock:
            self.sessions = sessions
            self.unread = unread
            if current:
                self.current_session = current
            if self.sessions:
                self.selected_idx = max(0, min(self.selected_idx, len(self.sessions) - 1))
            else:
                self.selected_idx = 0

        sockets = glob.glob(MAIN_KITTY_SOCKET_GLOB)
        self.main_socket = sockets[0] if sockets else None
        for s in sessions:
            name = str(s.get("name", ""))
            if name and name in unread:
                apply_tab_color(self.main_socket, name, UNREAD_COLOR)

    def start_polling(self) -> None:
        self.refresh()
        def loop() -> None:
            while not self._stop.is_set():
                self._stop.wait(POLL_INTERVAL)
                if not self._stop.is_set():
                    self.refresh()
        self._thread = threading.Thread(target=loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)

    def switch_to_selected(self) -> None:
        with self._lock:
            if not self.sessions:
                return
            selected = self.sessions[self.selected_idx]
            name = str(selected.get("name", ""))
        if not name:
            return
        session_file = os.path.join(SESSIONS_DIR, f"{name}.kitty-session")
        if not os.path.exists(session_file):
            return
        run_kitty("@", "action", "goto_session", session_file)
        run_kitty("@", "set-tab-color", "--match", f"session:{name}",
                  "active_bg=NONE", "inactive_bg=NONE")
        query_daemon({"type": MSG_CLEAR, "session_name": name})
        apply_tab_color(self.main_socket, name, None)

    def draw(self, stdscr: "curses.window") -> None:
        stdscr.erase()
        max_y, max_x = stdscr.getmaxyx()
        if max_y < 4 or max_x < 10:
            try:
                stdscr.addstr(0, 0, "too small")
                stdscr.refresh()
            except curses.error:
                pass
            return

        with self._lock:
            sessions = list(self.sessions)
            current_session = self.current_session
            selected_idx = self.selected_idx
            unread = set(self.unread)

        def safe(row: int, col: int, text: str, attr: int = 0) -> None:
            try:
                stdscr.addstr(row, col, text[: max(0, max_x - col)], attr)
            except curses.error:
                pass

        safe(0, 0, " Notifications", curses.color_pair(PAIR_HEADER) | curses.A_BOLD)
        safe(1, 0, "─" * max_x, curses.color_pair(PAIR_TAB))

        row = 2
        body_bottom = max_y - 2
        for idx, session in enumerate(sessions):
            if row > body_bottom:
                break
            name = str(session.get("name", ""))
            is_selected = idx == selected_idx
            is_active = name == current_session
            badge = f" {BADGE}" if name in unread else ""

            if is_selected:
                attr = curses.color_pair(PAIR_SELECTED) | curses.A_BOLD
            elif is_active:
                attr = curses.color_pair(PAIR_ACTIVE) | curses.A_BOLD
            else:
                attr = curses.color_pair(PAIR_HEADER)

            prefix = "▸ " if is_selected else "  "
            label = f"{prefix}{name}"[: max(1, max_x - 3)]
            safe(row, 0, label, attr)
            if badge:
                safe(row, len(label), badge, curses.color_pair(PAIR_BADGE) | curses.A_BOLD)
            row += 1

            if is_active:
                for tid in cast(list[int], session.get("tab_ids", [])):
                    if row > body_bottom:
                        break
                    safe(row, 0, f"    └ tab {tid}"[: max_x],
                         curses.color_pair(PAIR_TAB))
                    row += 1

        safe(max_y - 1, 0, " " * (max_x - 1), curses.color_pair(PAIR_FOOTER))
        footer = "j/k ↑↓  ⏎ switch"
        safe(max_y - 1, 0, footer[: max_x - 1], curses.color_pair(PAIR_FOOTER))
        stdscr.refresh()

    def run(self, stdscr: "curses.window") -> None:
        curses.curs_set(0)
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
    ensure_daemon()
    app = SidebarApp()
    app.start_polling()
    try:
        curses.wrapper(app.run)
    finally:
        app.stop()


if __name__ == "__main__":
    main()
