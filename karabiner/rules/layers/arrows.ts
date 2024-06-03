import { KarabinerRules } from "../../types";
import { convertToArrowsLayer } from "../../utils";

export const arrowsLayer: KarabinerRules = {
  description: "Number Layer",
  manipulators: [
    convertToArrowsLayer("u", "page_up"),
    convertToArrowsLayer("d", "page_down"),
    // second row right
    convertToArrowsLayer("h", "left_arrow"),
    convertToArrowsLayer("j", "down_arrow"),
    convertToArrowsLayer("k", "up_arrow"),
    convertToArrowsLayer("l", "right_arrow"),
  ]
}
