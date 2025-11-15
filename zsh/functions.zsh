# Kitty remote control helper function
# Launches commands in kitty using remote control
kitty_launch() {
  /Applications/kitty.app/Contents/MacOS/kitty @ --to unix:/tmp/mykitty-$(ps aux | grep /Applications/kitty.app/Contents/MacOS/kitty | grep -v grep | awk '{print $2}') launch "$@"
}
