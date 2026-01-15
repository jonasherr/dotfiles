"""
Custom kitten to set tab title with smart prefilling.

If the tab title was manually set, prefill with the current title.
If the tab is using the default title, show an empty prompt.
"""

import json
import subprocess
from typing import List

from kitty.boss import Boss


def main(args: List[str]) -> str:
    """
    Get the current tab's title state and prompt for new title.
    Returns the new title or empty string if cancelled.
    """
    # Get current tab info via kitty remote control
    kitty_ls = json.loads(
        subprocess.run(
            ["kitty", "@", "ls"], capture_output=True, text=True
        ).stdout.strip("\n")
    )

    # Find the active tab
    active_tab = None
    for os_window in kitty_ls:
        if os_window.get("is_focused"):
            for tab in os_window.get("tabs", []):
                if tab.get("is_focused"):
                    active_tab = tab
                    break
            break

    if not active_tab:
        return ""

    # Check if title was manually set by user
    # Kitty sets 'title' to the user-set title, and 'active_window_history' contains window info
    # The tab has a 'user_set_title' or similar indicator in some versions
    # We check if the title matches the default pattern (usually the active window's title)
    current_title = active_tab.get("title", "")

    # Get the active window's title for comparison
    active_window_title = ""
    for window in active_tab.get("windows", []):
        if window.get("is_focused") or window.get("is_active"):
            active_window_title = window.get("title", "")
            break

    # Heuristic: if tab title matches the active window title or follows
    # the default pattern, consider it as "default" (not manually set)
    # The default title template in kitty.conf is:
    # "{index}: {fmt.fg.red}{bell_symbol}{activity_symbol}{fmt.fg.tab}{title[title.rfind('/')+1:]}"
    # So the tab title would typically end with the window title's last path component

    # Extract just the basename part that would be shown
    window_basename = active_window_title.split("/")[-1] if "/" in active_window_title else active_window_title

    # Check if it looks like a default title (starts with index number and colon)
    is_default_title = False
    if ":" in current_title:
        # Remove the "N: " prefix to get the actual title part
        title_without_index = current_title.split(": ", 1)[-1] if ": " in current_title else current_title
        # If what remains matches the window basename or the full window title, it's default
        if title_without_index == window_basename or title_without_index == active_window_title:
            is_default_title = True
    else:
        # No colon means it might be a manually set title without index
        # But if it exactly matches the window title, it's probably default
        if current_title == window_basename or current_title == active_window_title:
            is_default_title = True

    # Prepare the prefill value
    if is_default_title:
        prefill = ""
    else:
        # Extract title without the index prefix for prefill
        if ": " in current_title:
            prefill = current_title.split(": ", 1)[-1]
        else:
            prefill = current_title

    try:
        new_title = input(f"Tab title [{prefill}]: ") if prefill else input("Tab title: ")
        # If user just pressed enter with a prefill, use the prefill value
        if new_title == "" and prefill:
            return prefill
        return new_title
    except KeyboardInterrupt:
        return ""


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    """
    Handle the result from main() and set the tab title.
    """
    if answer == "":
        # User cancelled or entered empty - do nothing
        return

    # Set the tab title using remote control
    boss.call_remote_control(None, ("set-tab-title", answer))
