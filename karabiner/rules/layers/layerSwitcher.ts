import { KarabinerRules } from "../../types";
import { layer } from "../../utils";

export enum Layers {
  "text" = "text",
  "special" = "special",
  "number" = "number",
  "arrows" = "arrows"
}

export const layerSwitcher: KarabinerRules = {
  description: "Layer Switcher",
  manipulators: [
    layer("left_command", Layers.special),
    layer("right_command", Layers.number),
    layer("quote", Layers.arrows),
  ].flat()
}
