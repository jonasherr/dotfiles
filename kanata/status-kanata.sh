#!/usr/bin/env bash
set -euo pipefail

LABEL="com.local.kanata"

sudo launchctl print "system/$LABEL"
