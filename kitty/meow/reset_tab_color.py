"""
Custom kitten to reset the focused tab's color override.

Used in combine keybinds to clear the agent attention indicator
when switching to a tab.
"""

from typing import List

from kitty.boss import Boss


def main(args: List[str]) -> str:
    return ""


def handle_result(
    args: List[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    boss.call_remote_control(None, ("set-tab-color", "--self", "active_bg=NONE", "inactive_bg=NONE"))
