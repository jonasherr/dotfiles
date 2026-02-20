import curses
import json
import os
import subprocess
import sys
from typing import Dict, List, Optional, Tuple



def get_session_files() -> List[Tuple[str, str]]:
    """
    Scan session directory for .kitty-session files.
    Returns list of (name, full_path) tuples, excluding template.
    """
    sessions_dir = os.path.expanduser("~/.config/kitty/sessions")
    if not os.path.isdir(sessions_dir):
        return []

    results = []
    for entry in os.listdir(sessions_dir):
        if entry.endswith(".kitty-session") and entry != "template.kitty-session":
            name = entry.removesuffix(".kitty-session")
            full_path = os.path.join(sessions_dir, entry)
            results.append((name, full_path))
    results.sort(key=lambda x: x[0])
    return results


def get_loaded_sessions(
    session_files: List[Tuple[str, str]],
) -> List[Dict]:
    """
    Check which session files are currently loaded in kitty.
    Returns list of dicts with keys: name, path, tab_ids, active_window_id.
    """
    loaded = []
    for name, path in session_files:
        try:
            result = subprocess.run(
                ["kitty", "@", "ls", "--match", f"session:{name}"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                continue
            data = json.loads(result.stdout.strip("\n"))
            tab_ids = []
            active_window_id = None
            for os_window in data:
                for tab in os_window.get("tabs", []):
                    tab_ids.append(tab["id"])
                    for window in tab.get("windows", []):
                        if window.get("is_active") or window.get("is_focused"):
                            active_window_id = window["id"]
            if tab_ids:
                loaded.append({
                    "name": name,
                    "path": path,
                    "tab_ids": tab_ids,
                    "active_window_id": active_window_id,
                })
        except Exception:
            # Session not loaded or parse error — skip
            continue
    return loaded


def find_current_session(
    loaded_sessions: List[Dict],
) -> Optional[str]:
    """
    Find which session the current window (is_self=True) belongs to.
    Returns the session name or None.
    """
    try:
        result = subprocess.run(
            ["kitty", "@", "ls"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return None
        data = json.loads(result.stdout.strip("\n"))

        # Find the tab containing is_self=True
        self_tab_id = None
        for os_window in data:
            for tab in os_window.get("tabs", []):
                for window in tab.get("windows", []):
                    if window.get("is_self"):
                        self_tab_id = tab["id"]
                        break
                if self_tab_id is not None:
                    break
            if self_tab_id is not None:
                break

        if self_tab_id is None:
            return None

        # Match tab ID to a session
        for session in loaded_sessions:
            if self_tab_id in session["tab_ids"]:
                return session["name"]
    except Exception:
        pass
    return None


def get_mru_order(
    loaded_sessions: List[Dict],
    current_session: Optional[str],
) -> List[Dict]:
    """
    Order sessions by MRU using active_tab_history from the OS window.
    Current session goes last, previous session first (pre-highlighted).
    """
    try:
        result = subprocess.run(
            ["kitty", "@", "ls"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return loaded_sessions
        data = json.loads(result.stdout.strip("\n"))

        # Get active_tab_history from the first OS window
        tab_history = []
        if data:
            tab_history = data[0].get("active_tab_history", [])

        # Build a map from tab_id to session
        tab_to_session: Dict[int, Dict] = {}
        for session in loaded_sessions:
            for tid in session["tab_ids"]:
                tab_to_session[tid] = session

        # Order by MRU: most recently active tab's session first
        seen_sessions = set()
        ordered = []
        for tid in tab_history:
            session = tab_to_session.get(tid)
            if session and session["name"] not in seen_sessions:
                seen_sessions.add(session["name"])
                ordered.append(session)

        # Add any sessions not in history
        for session in loaded_sessions:
            if session["name"] not in seen_sessions:
                seen_sessions.add(session["name"])
                ordered.append(session)

        # Move current session to the end
        if current_session:
            ordered = [s for s in ordered if s["name"] != current_session] + [
                s for s in ordered if s["name"] == current_session
            ]

        return ordered
    except Exception:
        return loaded_sessions


def fetch_preview(window_id: Optional[int]) -> str:
    """
    Fetch terminal text from a window via kitty @ get-text.
    Returns the screen text or an error placeholder.
    """
    if window_id is None:
        return "(no windows)"
    try:
        result = subprocess.run(
            [
                "kitty", "@", "get-text",
                "--match", f"id:{window_id}",
                "--extent", "screen",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return "(preview unavailable)"
        text = result.stdout
        if not text.strip():
            return "(empty screen)"
        return text
    except Exception:
        return "(preview unavailable)"


def sanitize_session_name(value: str) -> str:
    normalized = value.strip().replace(" ", "-")
    while "--" in normalized:
        normalized = normalized.replace("--", "-")
    return normalized


def load_sessions_state() -> Tuple[List[Dict], Optional[str]]:
    session_files = get_session_files()
    if not session_files:
        return [], None
    loaded_sessions = get_loaded_sessions(session_files)
    if not loaded_sessions:
        return [], None
    current_session = find_current_session(loaded_sessions)
    sessions = get_mru_order(loaded_sessions, current_session)
    return sessions, current_session


def prompt_confirm(stdscr: "curses.window", message: str) -> bool:
    max_y, max_x = stdscr.getmaxyx()
    prompt = f"{message} [y/N]"
    try:
        stdscr.addstr(max_y - 1, 0, " " * (max_x - 1), curses.A_REVERSE)
        stdscr.addstr(max_y - 1, 0, prompt[: max_x - 1], curses.A_REVERSE)
        stdscr.refresh()
    except curses.error:
        pass

    while True:
        key = stdscr.getch()
        if key in (ord("y"), ord("Y")):
            return True
        if key in (ord("n"), ord("N"), 27, ord("q")):
            return False


def prompt_input(stdscr: "curses.window", message: str) -> str:
    max_y, max_x = stdscr.getmaxyx()
    curses.curs_set(1)
    curses.echo()
    try:
        stdscr.addstr(max_y - 1, 0, " " * (max_x - 1), curses.A_REVERSE)
        stdscr.addstr(max_y - 1, 0, message[: max_x - 1], curses.A_REVERSE)
        stdscr.refresh()
        value = stdscr.getstr(max_y - 1, len(message), max_x - len(message) - 1)
    except curses.error:
        value = b""
    finally:
        curses.noecho()
        curses.curs_set(0)

    try:
        return value.decode().strip()
    except Exception:
        return ""


def close_session_tabs(session_name: str) -> None:
    subprocess.run(
        ["kitty", "@", "close-tab", "--match", f"session:{session_name}"],
        capture_output=True,
        text=True,
    )


def show_message(stdscr: "curses.window", message: str) -> None:
    max_y, max_x = stdscr.getmaxyx()
    try:
        stdscr.addstr(max_y - 1, 0, " " * (max_x - 1), curses.A_REVERSE)
        stdscr.addstr(max_y - 1, 0, message[: max_x - 1], curses.A_REVERSE)
        stdscr.refresh()
    except curses.error:
        pass
    stdscr.getch()


def draw_ui(
    stdscr: "curses.window",
    sessions: List[Dict],
    current_session: Optional[str],
    selected_idx: int,
    preview_text: str,
) -> None:
    """Draw the two-column TUI layout."""
    stdscr.erase()
    max_y, max_x = stdscr.getmaxyx()

    if max_y < 5 or max_x < 30:
        stdscr.addstr(0, 0, "Terminal too small")
        stdscr.refresh()
        return

    # Layout: left column ~1/3, right column ~2/3
    left_width = max(20, max_x // 3)
    right_start = left_width + 1
    right_width = max_x - right_start - 1

    # Header
    header = " Session Switcher"
    try:
        stdscr.addstr(0, 0, header[:max_x - 1], curses.A_BOLD | curses.A_REVERSE)
        stdscr.addstr(0, len(header), " " * max(0, max_x - len(header) - 1), curses.A_REVERSE)
    except curses.error:
        pass

    # Draw vertical separator
    for y in range(1, max_y - 1):
        try:
            stdscr.addch(y, left_width, "│")
        except curses.error:
            pass

    # Draw session list (left column)
    list_start_y = 2
    for i, session in enumerate(sessions):
        if list_start_y + i >= max_y - 1:
            break

        name = session["name"]
        is_current = name == current_session
        is_selected = i == selected_idx

        # Build display string
        marker = "▶ " if is_selected else "  "
        suffix = " *" if is_current else ""
        display = f"{marker}{name}{suffix}"

        # Truncate to fit
        display = display[:left_width - 1]

        attrs = curses.A_NORMAL
        if is_selected:
            attrs = curses.A_BOLD | curses.A_REVERSE

        try:
            stdscr.addstr(list_start_y + i, 0, display, attrs)
            if is_selected:
                # Fill the rest of the line for the highlight bar
                padding = left_width - len(display) - 1
                if padding > 0:
                    stdscr.addstr(list_start_y + i, len(display), " " * padding, attrs)
        except curses.error:
            pass

    # Draw preview (right column)
    preview_lines = preview_text.split("\n")
    for i, line in enumerate(preview_lines):
        row = 2 + i
        if row >= max_y - 1:
            break
        # Truncate line to fit right column
        display_line = line[:right_width]
        try:
            stdscr.addstr(row, right_start, display_line)
        except curses.error:
            pass

    # Footer
    footer = " Tab/↓: next  Shift+Tab/↑: prev  Enter: switch  d: delete  r: rename  Esc/q: cancel"
    try:
        stdscr.addstr(
            max_y - 1, 0,
            footer[:max_x - 1],
            curses.A_REVERSE,
        )
        padding = max_x - len(footer) - 1
        if padding > 0:
            stdscr.addstr(max_y - 1, len(footer), " " * padding, curses.A_REVERSE)
    except curses.error:
        pass

    stdscr.refresh()


def run_switcher(
    stdscr: "curses.window",
    sessions: List[Dict],
    current_session: Optional[str],
) -> str:
    """
    Main curses loop. Returns selected session name or empty string.
    """
    curses.curs_set(0)
    curses.use_default_colors()

    # Pre-highlight index 0 which is the previous session (MRU order)
    selected_idx = 0
    preview_cache: Dict[str, str] = {}

    while True:
        if not sessions:
            return ""

        selected_idx = min(selected_idx, len(sessions) - 1)

        # Fetch preview for highlighted session (lazy, cached)
        highlighted = sessions[selected_idx]
        highlighted_name = highlighted["name"]
        if highlighted_name not in preview_cache:
            preview_cache[highlighted_name] = fetch_preview(
                highlighted.get("active_window_id")
            )

        draw_ui(stdscr, sessions, current_session, selected_idx, preview_cache[highlighted_name])

        key = stdscr.getch()

        if key == 27 or key == ord("q"):
            # Escape or q — cancel
            return ""
        elif key in (10, 13, curses.KEY_ENTER):
            # Enter — select
            return highlighted_name
        elif key in (9, curses.KEY_DOWN):
            # Tab or Down arrow — next
            selected_idx = (selected_idx + 1) % len(sessions)
        elif key in (curses.KEY_BTAB, 353, curses.KEY_UP):
            # Shift+Tab or Up arrow — previous
            selected_idx = (selected_idx - 1) % len(sessions)
        elif key in (ord("d"), ord("D")):
            name = highlighted["name"]
            if not prompt_confirm(
                stdscr, f"Delete '{name}'? This will close the session"
            ):
                continue
            close_session_tabs(name)
            try:
                if os.path.exists(highlighted["path"]):
                    os.remove(highlighted["path"])
            except Exception as exc:
                show_message(stdscr, f"Delete failed: {exc}")
                continue
            sessions, current_session = load_sessions_state()
            preview_cache = {}
            if not sessions:
                return ""
            if len(sessions) <= 1:
                show_message(stdscr, "Only one session open")
                return ""
            selected_idx = 0
        elif key in (ord("r"), ord("R")):
            name = highlighted["name"]
            if not prompt_confirm(
                stdscr, f"Rename '{name}'? This will close and reload"
            ):
                continue
            new_name = sanitize_session_name(prompt_input(stdscr, "Rename to: "))
            if not new_name:
                show_message(stdscr, "Rename cancelled")
                continue
            if new_name == name:
                continue
            new_path = os.path.join(
                os.path.dirname(highlighted["path"]),
                f"{new_name}.kitty-session",
            )
            if os.path.exists(new_path):
                show_message(stdscr, "Session name already exists")
                continue
            close_session_tabs(name)
            try:
                os.rename(highlighted["path"], new_path)
            except Exception as exc:
                show_message(stdscr, f"Rename failed: {exc}")
                continue
            subprocess.run(
                ["kitty", "@", "action", "goto_session", new_path],
                capture_output=True,
                text=True,
            )
            sessions, current_session = load_sessions_state()
            preview_cache = {}
            if not sessions:
                return ""
            if len(sessions) <= 1:
                show_message(stdscr, "Only one session open")
                return ""
            selected_idx = 0


def main(args: List[str]) -> str:
    """
    Kitten entry point. Discovers sessions, shows TUI, returns selection.
    """
    sessions, current_session = load_sessions_state()
    if not sessions:
        return ""
    if len(sessions) <= 1:
        print("Only one session open", file=sys.stderr)
        return ""

    if "--previous" in args:
        return sessions[0]["name"]

    # Run curses TUI
    result = curses.wrapper(run_switcher, sessions, current_session)
    return result


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss
) -> None:
    """
    Handle the selected session. Switch to it and reset tab colors.
    """
    if not answer:
        return

    # Find the session file path
    sessions_dir = os.path.expanduser("~/.config/kitty/sessions")
    session_file = os.path.join(sessions_dir, f"{answer}.kitty-session")

    if not os.path.exists(session_file):
        return

    # Switch to the selected session
    boss.call_remote_control(
        None, ("action", "goto_session", session_file)
    )

    # Reset tab color (clear opencode attention indicator)
    boss.call_remote_control(
        None,
        ("set-tab-color", "--self", "active_bg=NONE", "inactive_bg=NONE"),
    )
