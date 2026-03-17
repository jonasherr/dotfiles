"""Shared notification types and constants for Kitty sidebar panel system."""

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict


# Socket paths
PANEL_SOCKET_PATH = "/tmp/kitty-sidebar.sock"
MAIN_KITTY_SOCKET_GLOB = "/tmp/mykitty-*"

# Socket message types
MSG_NOTIFY = "notify"
MSG_GET_STATE = "get_state"
MSG_CLEAR = "clear"
MSG_CLEAR_ALL = "clear_all"


class NotificationType(Enum):
    """Notification type enumeration."""

    IDLE = "idle"
    INPUT = "input"
    PERMISSION = "permission"


@dataclass
class Notification:
    """Notification data structure for sidebar panel."""

    session_name: str
    type: str
    message: str
    timestamp: float
    read: bool = False


def notification_to_dict(n: Notification) -> Dict[str, Any]:
    """Convert Notification to dictionary for JSON serialization."""
    return {
        "session_name": n.session_name,
        "type": n.type,
        "message": n.message,
        "timestamp": n.timestamp,
        "read": n.read,
    }


def dict_to_notification(d: Dict[str, Any]) -> Notification:
    """Reconstruct Notification from dictionary."""
    return Notification(
        session_name=d["session_name"],
        type=d["type"],
        message=d["message"],
        timestamp=d["timestamp"],
        read=d.get("read", False),
    )
