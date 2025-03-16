import { createHyperSubLayers, open, window } from "../utils";

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
    },

    // w = "Window"
    w: {
      h: window("left-half"),
      j: window("bottom-half"),
      k: window("top-half"),
      l: window("right-half"),
      f: window("maximize"),
    },
  }),
];
