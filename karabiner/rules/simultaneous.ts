import { KarabinerRules } from "../types";
import { createCombinedKey } from "../utils";

export const simultaneous: KarabinerRules = {
  description: "Simultaneous Keys",
  manipulators: [
    createCombinedKey(["r", "t"], "delete_or_backspace"),
    createCombinedKey(["y", "u"], "return_or_enter"),
  ].flat()
}
