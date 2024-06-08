import { KarabinerRules } from "../types";
import { createCombinedKey } from "../utils";

export const simultaneous: KarabinerRules = {
  description: "Simultaneous Keys",
  manipulators: [
    createCombinedKey(["e", "r"], "delete_or_backspace"),
    createCombinedKey(["u", "i"], "return_or_enter"),
  ].flat()
}
