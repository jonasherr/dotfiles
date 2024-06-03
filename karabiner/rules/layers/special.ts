import { KarabinerRules } from "../../types";
import { convertToSpecialLayer } from "../../utils";

// to find special keys: open KarabinerEvent Viewer
// type the key you want and see the name of the key in Karabiner
export const specialLayer: KarabinerRules = {
  description: "Special Layer",
  manipulators: [
    // first row left
    convertToSpecialLayer("q", "q"),
    convertToSpecialLayer("w", "2", ["left_shift"]),
    convertToSpecialLayer("e", "3", ["left_shift"]),
    convertToSpecialLayer("r", "grave_accent_and_tilde"),
    convertToSpecialLayer("t", "quote", ["left_shift"]),

    // first row right
    convertToSpecialLayer("y", "7", ["left_shift"]),
    convertToSpecialLayer("u", "comma", ["left_shift"]),
    convertToSpecialLayer("i", "period", ["left_shift"]),
    convertToSpecialLayer("o", "hyphen", ["left_shift"]),
    convertToSpecialLayer("p", "hyphen"),

    // second row left
    convertToSpecialLayer("a", "6", ["left_shift"]),
    convertToSpecialLayer("s", "5", ["left_shift"]),
    convertToSpecialLayer("d", "8", ["left_shift"]),
    convertToSpecialLayer("f", "4", ["left_shift"]),
    convertToSpecialLayer("g", "quote"),

    // second row right
    convertToSpecialLayer("h", "backslash"),
    convertToSpecialLayer("j", "open_bracket", ["left_shift"]),
    convertToSpecialLayer("k", "close_bracket", ["left_shift"]),
    convertToSpecialLayer("l", "backslash", ["left_shift"]), //
    convertToSpecialLayer("semicolon", "grave_accent_and_tilde", ["left_shift"]),

    // third row left
    convertToSpecialLayer("z", "hyphen", ["left_shift"]),
    convertToSpecialLayer("x", "equal_sign"),
    convertToSpecialLayer("c", "grave_accent_and_tilde", ["left_shift"]),
    convertToSpecialLayer("v", "6", ["left_shift"]), //
    convertToSpecialLayer("b", "1", ["left_shift"]),

    // third row right
    convertToSpecialLayer("n", "open_bracket"),
    convertToSpecialLayer("m", "9", ["left_shift"]),
    convertToSpecialLayer("comma", "0", ["left_shift"]),
    convertToSpecialLayer("period", "close_bracket"),
    convertToSpecialLayer("slash", "equal_sign", ["left_shift"]),
  ]
}
