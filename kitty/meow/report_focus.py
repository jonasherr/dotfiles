#!/usr/bin/env python3
import json
import os
import socket
import subprocess
from typing import Optional, cast

PANEL_SOCKET_PATH = "/tmp/kitty-sidebar.sock"
MSG_SET_ACTIVE_WINDOW = "set_active_window"
KITTY_APP_BIN = "/Applications/kitty.app/Contents/MacOS/kitty"
SESSIONS_DIR = os.path.expanduser("~/.config/kitty/sessions")
SESSION_SUFFIX = ".kitty-session"


def get_window_id() -> Optional[int]:
    raw_window_id = os.environ.get("KITTY_WINDOW_ID")
    if not raw_window_id:
        return None

    try:
        return int(raw_window_id)
    except ValueError:
        return None


def run_kitty_ls(*args: str) -> Optional[list[dict[str, object]]]:
    for command in (("kitty", "@", *args), (KITTY_APP_BIN, "@", *args)):
        try:
            result = subprocess.run(
                list(command),
                capture_output=True,
                text=True,
                check=False,
                timeout=1.0,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

        if result.returncode != 0:
            continue

        try:
            data = cast(object, json.loads(result.stdout.strip()))
        except json.JSONDecodeError:
            continue

        if not isinstance(data, list):
            continue

        parsed: list[dict[str, object]] = []
        for item_object in cast(list[object], data):
            if not isinstance(item_object, dict):
                parsed = []
                break
            parsed.append(cast(dict[str, object], item_object))

        if parsed:
            return parsed

    return None


def get_session_names() -> list[str]:
    if not os.path.isdir(SESSIONS_DIR):
        return []

    session_names: list[str] = []
    for entry in sorted(os.listdir(SESSIONS_DIR)):
        if not entry.endswith(SESSION_SUFFIX) or entry == f"template{SESSION_SUFFIX}":
            continue
        session_names.append(entry.removesuffix(SESSION_SUFFIX))
    return session_names


def find_tab_for_window(
    data: list[dict[str, object]], window_id: int
) -> tuple[Optional[int], Optional[str]]:
    for os_window in data:
        tabs_object = os_window.get("tabs")
        if not isinstance(tabs_object, list):
            continue

        for tab_object in cast(list[object], tabs_object):
            if not isinstance(tab_object, dict):
                continue
            tab = cast(dict[str, object], tab_object)

            windows_object = tab.get("windows")
            if not isinstance(windows_object, list):
                continue

            for window_object in cast(list[object], windows_object):
                if not isinstance(window_object, dict):
                    continue
                window = cast(dict[str, object], window_object)
                if window.get("id") != window_id:
                    continue

                tab_id = tab.get("id")
                tab_title = tab.get("title")
                return (
                    tab_id if isinstance(tab_id, int) else None,
                    tab_title if isinstance(tab_title, str) else None,
                )

    return None, None


def candidate_session_names(tab_title: Optional[str]) -> list[str]:
    if not tab_title:
        return []

    candidates: list[str] = []
    for candidate in (tab_title.strip(), os.path.basename(tab_title.strip())):
        if candidate and candidate not in candidates:
            candidates.append(candidate)
    return candidates


def data_contains_window(
    data: list[dict[str, object]], window_id: int, tab_id: Optional[int]
) -> bool:
    for os_window in data:
        tabs_object = os_window.get("tabs")
        if not isinstance(tabs_object, list):
            continue

        for tab_object in cast(list[object], tabs_object):
            if not isinstance(tab_object, dict):
                continue
            tab = cast(dict[str, object], tab_object)

            current_tab_id = tab.get("id")
            if tab_id is not None and current_tab_id == tab_id:
                return True

            windows_object = tab.get("windows")
            if not isinstance(windows_object, list):
                continue

            for window_object in cast(list[object], windows_object):
                if not isinstance(window_object, dict):
                    continue
                window = cast(dict[str, object], window_object)
                if window.get("id") == window_id:
                    return True

    return False


def resolve_session_name(window_id: int) -> Optional[str]:
    all_windows = run_kitty_ls("ls")
    if all_windows is None:
        return None

    tab_id, tab_title = find_tab_for_window(all_windows, window_id)
    if tab_id is None and tab_title is None:
        return None

    session_names = get_session_names()
    if not session_names:
        return None

    session_set = set(session_names)
    for name in candidate_session_names(tab_title):
        if name in session_set:
            return name

    for session_name in session_names:
        matched = run_kitty_ls("ls", "--match", f"session:{session_name}")
        if matched is None:
            continue
        if data_contains_window(matched, window_id, tab_id):
            return session_name

    return None


def send_active_window(session_name: str, window_id: int) -> None:
    payload = {
        "type": MSG_SET_ACTIVE_WINDOW,
        "session_name": session_name,
        "window_id": window_id,
    }

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.settimeout(0.5)
        sock.connect(PANEL_SOCKET_PATH)
        sock.sendall((json.dumps(payload) + "\n").encode("utf-8"))
    except OSError:
        return
    finally:
        sock.close()


def main() -> None:
    try:
        window_id = get_window_id()
        if window_id is None:
            return

        session_name = resolve_session_name(window_id)
        if session_name is None:
            return

        send_active_window(session_name, window_id)
    except Exception:
        return


if __name__ == "__main__":
    main()
