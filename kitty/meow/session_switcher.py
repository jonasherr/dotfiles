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


def switch_to_session(session_name: str) -> None:
    """Switch to session and reset tab colors via kitty remote control."""
    sessions_dir = os.path.expanduser("~/.config/kitty/sessions")
    session_file = os.path.join(sessions_dir, f"{session_name}.kitty-session")
    if not os.path.exists(session_file):
        return
    subprocess.run(
        ["kitty", "@", "action", "goto_session", session_file],
        capture_output=True,
        text=True,
    )
    subprocess.run(
        ["kitty", "@", "set-tab-color", "--self",
         "active_bg=NONE", "inactive_bg=NONE"],
        capture_output=True,
        text=True,
    )


# -- Color pairs --
PAIR_BORDER = 1
PAIR_BORDER_SEL = 2
PAIR_HEADER = 3
PAIR_HEADER_SEL = 4
PAIR_PREVIEW = 5
PAIR_FOOTER = 6
PAIR_HEADER_CUR = 7


def init_colors() -> None:
    """Initialize color pairs using Everforest Dark Soft palette."""
    curses.start_color()
    curses.use_default_colors()

    if curses.COLORS >= 256:
        curses.init_pair(PAIR_BORDER, 245, -1)        # visible grey border
        curses.init_pair(PAIR_BORDER_SEL, 108, -1)    # bright green border
        curses.init_pair(PAIR_HEADER, 187, -1)        # bright header
        curses.init_pair(PAIR_HEADER_SEL, 108, -1)    # bright green header
        curses.init_pair(PAIR_PREVIEW, 249, -1)       # light grey preview
        curses.init_pair(PAIR_FOOTER, 187, 238)       # footer bar
        curses.init_pair(PAIR_HEADER_CUR, 223, -1)    # warm yellow for current
    else:
        curses.init_pair(PAIR_BORDER, curses.COLOR_WHITE, -1)
        curses.init_pair(PAIR_BORDER_SEL, curses.COLOR_GREEN, -1)
        curses.init_pair(PAIR_HEADER, curses.COLOR_WHITE, -1)
        curses.init_pair(PAIR_HEADER_SEL, curses.COLOR_GREEN, -1)
        curses.init_pair(PAIR_PREVIEW, curses.COLOR_WHITE, -1)
        curses.init_pair(PAIR_FOOTER, curses.COLOR_WHITE, curses.COLOR_BLACK)
        curses.init_pair(PAIR_HEADER_CUR, curses.COLOR_YELLOW, -1)


def prompt_confirm(stdscr: "curses.window", message: str, max_y: int, max_x: int) -> bool:
    prompt = f"{message} [y/N]"
    try:
        stdscr.addstr(max_y - 1, 0, " " * (max_x - 1), curses.color_pair(PAIR_FOOTER))
        stdscr.addstr(max_y - 1, 0, prompt[: max_x - 1], curses.color_pair(PAIR_FOOTER))
        stdscr.refresh()
    except curses.error:
        pass

    while True:
        key = stdscr.getch()
        if key in (ord("y"), ord("Y")):
            return True
        if key in (ord("n"), ord("N"), 27, ord("q")):
            return False


def prompt_input(stdscr: "curses.window", message: str, max_y: int, max_x: int) -> str:
    curses.curs_set(1)
    curses.echo()
    try:
        stdscr.addstr(max_y - 1, 0, " " * (max_x - 1), curses.color_pair(PAIR_FOOTER))
        stdscr.addstr(max_y - 1, 0, message[: max_x - 1], curses.color_pair(PAIR_FOOTER))
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


def show_message(stdscr: "curses.window", message: str, max_y: int, max_x: int) -> None:
    try:
        stdscr.addstr(max_y - 1, 0, " " * (max_x - 1), curses.color_pair(PAIR_FOOTER))
        stdscr.addstr(max_y - 1, 0, message[: max_x - 1], curses.color_pair(PAIR_FOOTER))
        stdscr.refresh()
    except curses.error:
        pass
    stdscr.getch()


def draw_card(
    stdscr: "curses.window",
    x: int,
    y: int,
    width: int,
    height: int,
    name: str,
    preview: str,
    is_selected: bool,
    is_current: bool,
) -> None:
    """Draw a single session card with border, name header, and preview."""
    border_pair = PAIR_BORDER_SEL if is_selected else PAIR_BORDER
    if is_selected:
        header_pair = PAIR_HEADER_SEL
    elif is_current:
        header_pair = PAIR_HEADER_CUR
    else:
        header_pair = PAIR_HEADER
    border_attr = curses.color_pair(border_pair)
    header_attr = curses.color_pair(header_pair) | curses.A_BOLD
    if is_current and not is_selected:
        header_attr |= curses.A_UNDERLINE

    if is_selected:
        border_attr |= curses.A_BOLD

    inner_w = width - 2  # space inside the vertical borders
    def safe_addstr(row: int, col: int, text: str, attr: int) -> None:
        try:
            stdscr.addstr(row, col, text, attr)
        except curses.error:
            pass

    def safe_addch(row: int, col: int, ch: int, attr: int) -> None:
        try:
            stdscr.addch(row, col, ch, attr)
        except curses.error:
            pass

    def draw_hline(row: int, col: int, length: int, attr: int) -> None:
        try:
            stdscr.hline(row, col, curses.ACS_HLINE, length, attr)
        except curses.error:
            pass

    # Top border
    safe_addch(y, x, curses.ACS_ULCORNER, border_attr)
    draw_hline(y, x + 1, inner_w, border_attr)
    safe_addch(y, x + width - 1, curses.ACS_URCORNER, border_attr)
    # Header row: │ name  │
    label = name
    if is_current:
        label += " •"
    label = label[:inner_w]
    pad_left = (inner_w - len(label)) // 2
    pad_right = inner_w - len(label) - pad_left
    safe_addch(y + 1, x, curses.ACS_VLINE, border_attr)
    safe_addstr(y + 1, x + 1, " " * pad_left + label + " " * pad_right, header_attr)
    safe_addch(y + 1, x + width - 1, curses.ACS_VLINE, border_attr)

    # Header separator
    safe_addch(y + 2, x, curses.ACS_LTEE, border_attr)
    draw_hline(y + 2, x + 1, inner_w, border_attr)
    safe_addch(y + 2, x + width - 1, curses.ACS_RTEE, border_attr)
    # Preview lines
    preview_lines = preview.split("\n")
    preview_area_height = height - 4  # top border + header + separator + bottom border
    for i in range(preview_area_height):
        row = y + 3 + i
        safe_addch(row, x, curses.ACS_VLINE, border_attr)
        if i < len(preview_lines):
            line = preview_lines[i][:inner_w]
            line = line + " " * max(0, inner_w - len(line))
        else:
            line = " " * inner_w
        safe_addstr(row, x + 1, line, curses.color_pair(PAIR_PREVIEW))
        safe_addch(row, x + width - 1, curses.ACS_VLINE, border_attr)

    # Bottom border
    safe_addch(y + height - 1, x, curses.ACS_LLCORNER, border_attr)
    draw_hline(y + height - 1, x + 1, inner_w, border_attr)
    safe_addch(y + height - 1, x + width - 1, curses.ACS_LRCORNER, border_attr)


def draw_ui(
    stdscr: "curses.window",
    sessions: List[Dict],
    current_session: Optional[str],
    selected_idx: int,
    preview_cache: Dict[str, str],
    scroll_offset: int,
) -> None:
    """Draw session cards filling the panel window."""
    stdscr.erase()
    max_y, max_x = stdscr.getmaxyx()

    if max_y < 5 or max_x < 30:
        stdscr.addstr(0, 0, "Terminal too small")
        stdscr.refresh()
        return

    num_sessions = len(sessions)
    card_height = max(5, max_y - 1)  # full height minus footer
    footer_row = max_y - 1

    # -- Calculate card layout --
    gap = 1
    min_card_width = 25
    max_visible = max(1, (max_x + gap) // (min_card_width + gap))
    visible_count = min(num_sessions, max_visible)
    total_gaps = max(0, visible_count - 1) * gap
    card_width = max(min_card_width, (max_x - total_gaps) // visible_count)
    visible_count = min(num_sessions, max(1, (max_x + gap) // (card_width + gap)))
    card_width = max(min_card_width, (max_x - max(0, visible_count - 1) * gap) // visible_count)

    start_idx = scroll_offset
    end_idx = min(start_idx + visible_count, num_sessions)

    # -- Draw cards --
    card_x = 0
    for i in range(start_idx, end_idx):
        session = sessions[i]
        name = session["name"]
        is_selected = i == selected_idx
        is_current = name == current_session

        preview = preview_cache.get(name, "(loading...)")

        draw_card(
            stdscr,
            x=card_x,
            y=0,
            width=card_width,
            height=card_height,
            name=name,
            preview=preview,
            is_selected=is_selected,
            is_current=is_current,
        )
        card_x += card_width + gap

    # -- Scroll indicators --
    if start_idx > 0:
        try:
            stdscr.addstr(
                card_height // 2, 0,
                "◀",
                curses.color_pair(PAIR_BORDER_SEL) | curses.A_BOLD,
            )
        except curses.error:
            pass

    if end_idx < num_sessions:
        try:
            stdscr.addstr(
                card_height // 2, max_x - 1,
                "▶",
                curses.color_pair(PAIR_BORDER_SEL) | curses.A_BOLD,
            )
        except curses.error:
            pass

    # -- Footer --
    footer = " hjkl: select  Enter: switch  d: delete  r: rename  Esc/q: cancel"
    if num_sessions > visible_count:
        footer += f"  [{selected_idx + 1}/{num_sessions}]"
    footer_attr = curses.color_pair(PAIR_FOOTER)
    try:
        stdscr.addstr(footer_row, 0, " " * (max_x - 1), footer_attr)
        stdscr.addstr(footer_row, 0, footer[: max_x - 1], footer_attr)
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
    init_colors()

    selected_idx = 0
    preview_cache: Dict[str, str] = {}
    scroll_offset = 0

    # Pre-fetch all previews (sessions are few, keeps UX snappy)
    for session in sessions:
        name = session["name"]
        if name not in preview_cache:
            preview_cache[name] = fetch_preview(session.get("active_window_id"))

    while True:
        if not sessions:
            return ""

        max_y, max_x = stdscr.getmaxyx()
        selected_idx = min(selected_idx, len(sessions) - 1)

        # Calculate visible card count for scroll management
        gap = 1
        min_card_width = 25
        max_visible = max(1, (max_x + gap) // (min_card_width + gap))
        visible_count = min(len(sessions), max_visible)

        # Keep selected card in view
        if selected_idx < scroll_offset:
            scroll_offset = selected_idx
        elif selected_idx >= scroll_offset + visible_count:
            scroll_offset = selected_idx - visible_count + 1
        scroll_offset = max(0, min(scroll_offset, len(sessions) - visible_count))

        draw_ui(
            stdscr, sessions, current_session, selected_idx,
            preview_cache, scroll_offset,
        )

        key = stdscr.getch()

        if key == 27 or key == ord("q"):
            return ""
        elif key in (10, 13, curses.KEY_ENTER):
            return sessions[selected_idx]["name"]
        elif key in (ord("l"), ord("j"), 9):
            selected_idx = (selected_idx + 1) % len(sessions)
        elif key in (ord("h"), ord("k"), curses.KEY_BTAB, 353):
            selected_idx = (selected_idx - 1) % len(sessions)
        elif key in (ord("d"), ord("D")):
            name = sessions[selected_idx]["name"]
            if not prompt_confirm(
                stdscr, f"Delete '{name}'? This will close the session",
                max_y, max_x,
            ):
                continue
            close_session_tabs(name)
            try:
                if os.path.exists(sessions[selected_idx]["path"]):
                    os.remove(sessions[selected_idx]["path"])
            except Exception as exc:
                show_message(stdscr, f"Delete failed: {exc}", max_y, max_x)
                continue
            sessions, current_session = load_sessions_state()
            preview_cache = {}
            for s in sessions:
                preview_cache[s["name"]] = fetch_preview(s.get("active_window_id"))
            if not sessions:
                return ""
            if len(sessions) <= 1:
                show_message(stdscr, "Only one session open", max_y, max_x)
                return ""
            selected_idx = 0
            scroll_offset = 0
        elif key in (ord("r"), ord("R")):
            name = sessions[selected_idx]["name"]
            if not prompt_confirm(
                stdscr, f"Rename '{name}'? This will close and reload",
                max_y, max_x,
            ):
                continue
            new_name = sanitize_session_name(
                prompt_input(stdscr, "Rename to: ", max_y, max_x)
            )
            if not new_name:
                show_message(stdscr, "Rename cancelled", max_y, max_x)
                continue
            if new_name == name:
                continue
            new_path = os.path.join(
                os.path.dirname(sessions[selected_idx]["path"]),
                f"{new_name}.kitty-session",
            )
            if os.path.exists(new_path):
                show_message(stdscr, "Session name already exists", max_y, max_x)
                continue
            close_session_tabs(name)
            try:
                os.rename(sessions[selected_idx]["path"], new_path)
            except Exception as exc:
                show_message(stdscr, f"Rename failed: {exc}", max_y, max_x)
                continue
            subprocess.run(
                ["kitty", "@", "action", "goto_session", new_path],
                capture_output=True,
                text=True,
            )
            sessions, current_session = load_sessions_state()
            preview_cache = {}
            for s in sessions:
                preview_cache[s["name"]] = fetch_preview(s.get("active_window_id"))
            if not sessions:
                return ""
            if len(sessions) <= 1:
                show_message(stdscr, "Only one session open", max_y, max_x)
                return ""
            selected_idx = 0
            scroll_offset = 0


def restore_layout() -> None:
    """Restore the previous layout after the split panel closes."""
    subprocess.run(
        ["kitty", "@", "action", "last_used_layout"],
        capture_output=True,
        text=True,
    )


def run_standalone() -> None:
    """
    Standalone entry point. Runs TUI in a split panel, then switches session.
    Restores the previous layout on exit.
    """
    sessions, current_session = load_sessions_state()
    if not sessions:
        restore_layout()
        return
    if len(sessions) <= 1:
        print("Only one session open", file=sys.stderr)
        restore_layout()
        return
    selected = curses.wrapper(run_switcher, sessions, current_session)
    if selected:
        switch_to_session(selected)
    restore_layout()


# -- Kitten interface (used for --previous mode) --

def main(args: List[str]) -> str:
    """
    Kitten entry point. Only used for --previous (no TUI needed).
    """
    sessions, current_session = load_sessions_state()
    if not sessions:
        return ""
    if len(sessions) <= 1:
        return ""

    if "--previous" in args:
        return sessions[0]["name"]

    # Fallback: run as overlay (shouldn't normally be called this way)
    result = curses.wrapper(run_switcher, sessions, current_session)
    return result


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss
) -> None:
    """
    Handle the selected session (kitten callback). Switch to it and reset tab colors.
    """
    if not answer:
        return

    sessions_dir = os.path.expanduser("~/.config/kitty/sessions")
    session_file = os.path.join(sessions_dir, f"{answer}.kitty-session")

    if not os.path.exists(session_file):
        return

    boss.call_remote_control(
        None, ("action", "goto_session", session_file)
    )
    boss.call_remote_control(
        None,
        ("set-tab-color", "--self", "active_bg=NONE", "inactive_bg=NONE"),
    )


if __name__ == "__main__":
    run_standalone()
