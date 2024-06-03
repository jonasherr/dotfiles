import { KarabinerRules } from "../types";
import { homeRowKey } from "../utils";

// TODO: integrate for all layers
export const homeRow: KarabinerRules = {
  description: "Home Row mods",
  manipulators: [
    // second row left
    homeRowKey([{ key: "a" }], "left_control"),
    homeRowKey([{ key: "s" }, { key: "5", modifier: "left_shift" }], "left_option"),
    homeRowKey([{ key: "d" }], "left_command"),
    homeRowKey([{ key: "f" }], "left_shift"),

    // second row right
    homeRowKey([{ key: "j" }], "right_shift"),
    homeRowKey([{ key: "k" }], "right_command"),
    homeRowKey([{ key: "l" }], "right_option"),
    homeRowKey([{ key: "semicolon" }], "right_control"),
  ].flat()
}
