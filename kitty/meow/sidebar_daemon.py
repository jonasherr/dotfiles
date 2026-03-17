#!/usr/bin/env python3
"""Background daemon for the kitty sidebar notification server."""

import importlib
import json
import os
import signal
import socket
import sys
import time
from typing import Protocol, cast

sys.path.insert(0, os.path.dirname(__file__))
notification_schema = importlib.import_module("notification_schema")
sidebar_server_module = importlib.import_module("sidebar_server")
PANEL_SOCKET_PATH = cast(str, notification_schema.PANEL_SOCKET_PATH)


class SidebarServerType(Protocol):
  def start(self) -> None: ...

  def stop(self) -> None: ...


SidebarServerCls = cast(type[SidebarServerType], sidebar_server_module.SidebarServer)


def is_server_running() -> bool:
  if not os.path.exists(PANEL_SOCKET_PATH):
    return False

  sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
  try:
    sock.settimeout(1.0)
    sock.connect(PANEL_SOCKET_PATH)
    sock.sendall((json.dumps({"type": "get_state"}) + "\n").encode("utf-8"))
    data = sock.recv(4096)
    return bool(data)
  except OSError:
    return False
  finally:
    sock.close()


def main() -> None:
  if is_server_running():
    sys.exit(0)

  server: SidebarServerType = SidebarServerCls()
  _ = server.start()
  print(f"sidebar-daemon: listening on {PANEL_SOCKET_PATH}")

  def shutdown(_sig: int, _frame: object) -> None:
    _ = server.stop()
    sys.exit(0)

  _ = signal.signal(signal.SIGTERM, shutdown)
  _ = signal.signal(signal.SIGINT, shutdown)

  try:
    while True:
      time.sleep(60)
  except KeyboardInterrupt:
    _ = server.stop()


if __name__ == "__main__":
  main()
