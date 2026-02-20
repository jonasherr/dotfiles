import json
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List

from kitty.boss import Boss

import meow


SESSIONS_DIR = Path(os.path.expanduser("~/.config/kitty/sessions"))
HISTORY_PATH = Path(os.path.expanduser("~/.config/kitty/meow/history"))
_HELPER = os.path.join(os.path.dirname(__file__), "_sessions_list.py")


def get_session_files() -> List[Path]:
    """Return all .kitty-session files excluding template."""
    if not SESSIONS_DIR.exists():
        return []
    return sorted(
        p
        for p in SESSIONS_DIR.glob("*.kitty-session")
        if p.name != "template.kitty-session"
    )


def get_active_session_names() -> set:
    """Get names of currently active sessions via kitty @ ls."""
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


def format_session_entry(path: Path, active_names: set) -> str:
    """Format a session file for fzf display: [*] name  /full/path"""
    name = path.stem
    marker = "[*]" if name in active_names else "[ ]"
    return f"{marker} {name}  {path}"


def main(args: List[str]) -> str:
    fzf = shutil.which("fzf")
    if not fzf:
        print("fzf not found in PATH")
        return ""

    session_files = get_session_files()
    active_names = get_active_session_names()

    entries = [format_session_entry(p, active_names) for p in session_files]

    # Reload commands for fzf binds — NO single quotes allowed (meow.py guard).
    # We delegate to a helper script to keep bind strings clean and readable.
    sessions_reload = f"python3 {_HELPER} all"
    active_reload = f"python3 {_HELPER} active"
    dirs_reload = "find ~/Projects -maxdepth 2 -mindepth 1 -type d 2>/dev/null | sort"

    binds, header = meow.binds_and_header(
        {
            "ctrl-a": ("active", active_reload),
            "ctrl-f": ("dirs", dirs_reload),
            "ctrl-r": ("sessions", sessions_reload),
        }
    )

    # ctrl-d: delete selected session file and reload list.
    # {-1} extracts the last field (the full path) from the formatted entry.
    delete_bind = f"ctrl-d:execute-silent(rm -f {{-1}})+reload({sessions_reload})"

    all_binds = f"{delete_bind},{binds}"

    # -- Vim-style normal/insert mode simulation --
    # INSERT mode (default): type to search, Esc enters NORMAL mode.
    # NORMAL mode: single-key actions (d/a/f/p/r), i returns to INSERT.
    # ctrl-key binds work in BOTH modes.

    # Normal-mode single-key action binds
    normal_d = (
        f"d:execute-silent(rm -f {{-1}})+reload({sessions_reload})"
    )
    normal_a = (
        f"a:change-prompt(\U0001f408 active > )+reload({active_reload})"
    )
    normal_f = (
        f"f:change-prompt(\U0001f408 dirs > )+reload({dirs_reload})"
    )
    normal_p = "p:toggle-preview"
    normal_r = (
        f"r:change-prompt(\U0001f408 sessions > )+reload({sessions_reload})"
    )
    # i: return to insert mode — restore prompt, rebind esc, unbind normal keys
    normal_i = (
        "i:change-prompt(\U0001f408 sessions > )"
        "+rebind(esc)"
        "+unbind(d,a,f,p,r,i)"
    )

    # Esc: enter normal mode — change prompt, rebind normal keys, unbind esc
    enter_normal = (
        "esc:change-prompt(\U0001f408 NORMAL > )"
        "+rebind(d,a,f,p,r,i)"
        "+unbind(esc)"
    )

    vim_header = "esc: normal mode | d/a/f/p/r | i: insert"

    fzf_args = [
        fzf,
        "--no-multi",
        "--reverse",
        "--ansi",
        "--preview=cat {-1}",
        "--preview-window=right:50%:wrap",
        "--prompt=\U0001f408 sessions > ",
        f"--header=ctrl-d: delete | {header} | {vim_header}",
        f"--bind={all_binds}",
        f"--bind={enter_normal}",
        f"--bind={normal_d},{normal_a},{normal_f},{normal_p},{normal_r},{normal_i}",
        "--bind=d:ignore,a:ignore,f:ignore,p:ignore,r:ignore,i:ignore",
    ]

    p = subprocess.Popen(fzf_args, stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    input_data = "\n".join(entries)
    out = p.communicate(input=input_data.encode())[0]
    selection = out.decode().strip()

    return selection


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    if not answer:
        return

    answer = answer.strip()

    # Extract the path from formatted entry: "[*] name  /path/to/file" or bare path
    if answer.startswith("["):
        # Split on double-space to get the path portion
        parts = answer.split("  ", 1)
        if len(parts) == 2:
            path = parts[1].strip()
        else:
            path = answer.rsplit(None, 1)[-1]
    else:
        path = answer

    # Determine the session/directory name for history
    if path.endswith(".kitty-session"):
        name = Path(path).stem
    else:
        name = os.path.basename(path)

    # Write to history for kill.py compatibility
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_PATH, "a") as f:
        f.write(f"{name} {datetime.now().isoformat()}\n")

    if path.endswith(".kitty-session"):
        boss.call_remote_control(None, ("action", "goto_session", path))
    else:
        # Directory selected (from ctrl-f) — auto-create a session from template
        dir_name = os.path.basename(path.rstrip("/"))
        session_file = SESSIONS_DIR / f"{dir_name}.kitty-session"

        if not session_file.exists():
            # Read template and substitute directory
            template_path = SESSIONS_DIR / "template.kitty-session"
            if template_path.exists():
                template_content = template_path.read_text()
                session_content = template_content.replace("{directory}", path)
                session_file.write_text(session_content)
            else:
                # Fallback: create minimal session inline
                session_file.write_text(
                    f"layout horizontal\ncd {path}\nlaunch opencode\nlaunch\n"
                )

        # Switch to the session (newly created or existing)
        boss.call_remote_control(
            None, ("action", "goto_session", str(session_file))
        )
