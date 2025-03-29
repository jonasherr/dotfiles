import { createHyperSubLayers, media, open, simpleTo, window } from "../utils";

export const hyperSubLayers = [
  ...createHyperSubLayers({
    // raycast
    r: {
      a: open(
        "raycast://extensions/jonas_herrmannsdorfer/nvim-markdown-notes/new-note",
        "Create new Note"
      ),
      c: open("raycast://extensions/raycast/system/open-camera", "Open Camera"),
      e: open(
        "raycast://extensions/raycast/emoji-symbols/search-emoji-symbols",
        "Emojis"
      ),
      p: open("raycast://extensions/raycast/raycast/confetti", "Confetti"),
      n: open(
        "raycast://extensions/jonas_herrmannsdorfer/nvim-markdown-notes/search-notes",
        "Search Notes"
      ),
      l: open("raycast://extensions/thomas/elgato-key-light/toggle"),
    },

    // w = "Window"
    w: {
      h: window("left-half"),
      j: window("bottom-half"),
      k: window("top-half"),
      l: window("right-half"),
      m: window("maximize"),
      i: window("make-larger"),
      d: window("make-smaller"),
    },

    // m = "Media"
    m: {
      // n next song
      n: simpleTo("fastforward"),
      // m mute
      m: simpleTo("mute"),
      // p previous song
      p: simpleTo("rewind"),
      // u volume up
      u: simpleTo("volume_up"),
      // d volume down
      d: simpleTo("volume_down"),
      // space play/pause
      s: simpleTo("play_or_pause"),
    },

    // b = "brightness"
    b: {
      // u brightness up
      u: simpleTo("apple_display_brightness_increment"),
      // d brightness down
      d: simpleTo("apple_display_brightness_decrement"),
    },
  }),
];
