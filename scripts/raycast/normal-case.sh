#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Normal Case
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.description Replaces _ and PascalCase to normal case
# @raycast.author jonas_herrmannsdorfer
# @raycast.authorURL https://raycast.com/jonas_herrmannsdorfer

# Read from clipboard
input=$(pbpaste)

# convert PascalCase to normal case
input=$(echo "$input" | sed -r 's/([A-Z])/\1/g')
# replace underscores with spaces
input=${input//_/ }
input=${input//-/ } # kebab case
input=$(echo "$input" | sed -r 's/([A-Z][a-z]*)/\1/g') # camel case

# input=$(echo "$input" | awk '{for(i=1;i<=NF;i++){ $i=toupper(substr($i,1,1)) tolower(substr($i,2)) } }1')

# capitalize the first letter and lowercase the rest
# input=$(echo "$input" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')

# Write to clipboard
echo "$input" | pbcopy
