import { KarabinerRules } from "../../types";
import { convertToNumbersLayer } from "../../utils";

export const numberLayer: KarabinerRules = {
  description: "Number Layer",
  manipulators: [
    // first row right
    convertToNumbersLayer("y", "keypad_hyphen"),
    convertToNumbersLayer("u", "7"),
    convertToNumbersLayer("i", "8"),
    convertToNumbersLayer("o", "9"),
    convertToNumbersLayer("p", "p"),

    // second row right
    convertToNumbersLayer("h", "keypad_equal_sign"),
    convertToNumbersLayer("j", "4"),
    convertToNumbersLayer("k", "5"),
    convertToNumbersLayer("l", "6"),
    convertToNumbersLayer("semicolon", "semicolon"),

    // third row right
    convertToNumbersLayer("n", "0"),
    convertToNumbersLayer("m", "1"),
    convertToNumbersLayer("comma", "2"),
    convertToNumbersLayer("period", "3"),
    convertToNumbersLayer("slash", "g", ["left_shift"]),

    // last column left
    convertToNumbersLayer("t", "comma"),
    convertToNumbersLayer("g", "keypad_plus"),
    convertToNumbersLayer("b", "period"),
  ]
}
