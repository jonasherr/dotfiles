import { createHyperSubLayers, open, window } from "../utils";


export const hyperSubLayers =
  [
    ...createHyperSubLayers(
      {
        // raycast
        r: {
          a: open("raycast://extensions/raycast/raycast-ai/ai-chat"),
          c: open("raycast://extensions/raycast/system/open-camera"),
          e: open("raycast://extensions/raycast/emoji-symbols/search-emoji-symbols"),
          p: open("raycast://extensions/raycast/raycast/confetti"),
          n: open("raycast://script-commands/normal-case")
        },

        // w = "Window"
        w: {
          k: window("top-half"),
          j: window("bottom-half"),
          h: window("left-half"),
          l: window("right-half"),
          f: window("maximize"),
        },
        // v = "moVe" which isn't "m" because we want it to be on the left hand
        // so that hjkl work like they do in vim
        v: {
          h: {
            to: [{ key_code: "left_arrow" }],
          },
          j: {
            to: [{ key_code: "down_arrow" }],
          },
          k: {
            to: [{ key_code: "up_arrow" }],
          },
          l: {
            to: [{ key_code: "right_arrow" }],
          },
        },
      })
  ]
