#!/bin/bash

# Check if cliclick is installed
if ! command -v cliclick &> /dev/null
then
    echo "cliclick could not be found"
    exit
fi

# Define the corners of the rectangle
top_left=(100 100)
top_right=(500 100)
bottom_right=(500 500)
bottom_left=(100 500)

# Loop indefinitely
while true
do
    # Move mouse to each corner of the rectangle
    cliclick m:${top_left[0]},${top_left[1]}
    sleep $(echo "scale=4; $RANDOM/32767*20" | bc)
    cliclick m:${top_right[0]},${top_right[1]}
    sleep $(echo "scale=4; $RANDOM/32767*20" | bc)
    cliclick m:${bottom_right[0]},${bottom_right[1]}
    sleep $(echo "scale=4; $RANDOM/32767*20" | bc)
    cliclick m:${bottom_left[0]},${bottom_left[1]}
    sleep $(echo "scale=4; $RANDOM/32767*20" | bc)
done
