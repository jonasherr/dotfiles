import fs from "fs";
import { KarabinerRules } from "./types";
import { homeRow } from "./rules/homerow";
import { meh } from "./rules/meh";
import { hyperKey } from "./rules/hyperKey";
import { hyperSubLayers } from "./rules/hyperSubLayers";
import { Layers, layerSwitcher } from "./rules/layers/layerSwitcher";
import { specialLayer } from "./rules/layers/special";
import { numberLayer } from "./rules/layers/numbers";
import { arrowsLayer } from "./rules/layers/arrows";

const rules: KarabinerRules[] = [
  layerSwitcher,
  specialLayer,
  arrowsLayer,
  numberLayer,
  homeRow,
  meh,
  hyperKey,
  ...hyperSubLayers
];

fs.writeFileSync(
  "karabiner.json",
  JSON.stringify(
    {
      global: {
        show_in_menu_bar: false,
      },
      variables: [
        {
          layer: Layers.text
        }
      ],
      profiles: [
        {
          name: "Default",
          parameters: {
            "basic.simultaneous_threshold_milliseconds": 50,
            "basic.to_delayed_action_delay_milliseconds": 500,
            "basic.to_if_alone_timeout_milliseconds": 1000,
            "basic.to_if_held_down_threshold_milliseconds": 500,
            "mouse_motion_to_scroll.speed": 100
          },
          complex_modifications: {
            rules,
          },
        },
        {
          name: "Aurora",
          parameters: {
            "basic.simultaneous_threshold_milliseconds": 50,
            "basic.to_delayed_action_delay_milliseconds": 500,
            "basic.to_if_alone_timeout_milliseconds": 1000,
            "basic.to_if_held_down_threshold_milliseconds": 500,
            "mouse_motion_to_scroll.speed": 100
          },
          complex_modifications: {
            rules: hyperSubLayers,
          },
        },
      ],
    },
    null,
    2
  )
);
