#!/usr/bin/env python3
"""CLI tool to send notifications to the Kitty sidebar panel."""

import argparse
import json
import socket
import sys
import os

# Add meow dir to path for notification_schema import
sys.path.insert(0, os.path.dirname(__file__))
from notification_schema import PANEL_SOCKET_PATH, MSG_NOTIFY, MSG_CLEAR


def send_message(msg: dict) -> None:
    """Send a JSON message to the panel socket.
    
    Args:
        msg: Dictionary to send as JSON
        
    Raises:
        ConnectionRefusedError: If socket connection fails
        FileNotFoundError: If socket file doesn't exist
    """
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(PANEL_SOCKET_PATH)
        data = json.dumps(msg) + "\n"
        sock.sendall(data.encode())
    finally:
        sock.close()


def main() -> int:
    """Main entry point for kitty-notify CLI."""
    parser = argparse.ArgumentParser(
        description="Send notification to Kitty sidebar panel"
    )
    parser.add_argument(
        "--session",
        required=True,
        help="Session name to send notification to",
    )
    parser.add_argument(
        "--type",
        help="Notification type (idle, input, permission)",
    )
    parser.add_argument(
        "--message",
        help="Notification message text",
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear notifications for the session",
    )

    args = parser.parse_args()

    try:
        if args.clear:
            send_message({"type": MSG_CLEAR, "session_name": args.session})
        else:
            if not args.type or not args.message:
                parser.error("--type and --message are required when not using --clear")
            send_message({
                "type": MSG_NOTIFY,
                "session_name": args.session,
                "notification_type": args.type,
                "message": args.message,
            })
        return 0
    except (ConnectionRefusedError, FileNotFoundError) as e:
        print(f"Error: Panel not running: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
