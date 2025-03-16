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
import { simultaneous } from "./rules/simultaneous";

const profileParameters = {
  "basic.simultaneous_threshold_milliseconds": 50,
  "basic.to_delayed_action_delay_milliseconds": 1000,
  "basic.to_if_alone_timeout_milliseconds": 1000,
  "basic.to_if_held_down_threshold_milliseconds": 500,
  "mouse_motion_to_scroll.speed": 100,
};

const resetLayerWithEscape: KarabinerRules = {
  description: "Reset layer with Escape",
  manipulators: [
    {
      type: "basic",
      from: { key_code: "escape" },
      to: [
        { key_code: "escape" },
        {
          set_variable: {
            name: "sublayer",
            value: "",
          },
        },
        {
          set_notification_message: {
            id: "karabiner",
            text: "",
          },
        },
      ],
    },
  ],
};

const rules: KarabinerRules[] = [
  resetLayerWithEscape,
  layerSwitcher,
  specialLayer,
  arrowsLayer,
  numberLayer,
  homeRow,
  meh,
  hyperKey,
  simultaneous,
  ...hyperSubLayers,
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
          layer: Layers.text,
          sublayer: Layers.text,
        },
      ],
      profiles: [
        {
          name: "Default",
          parameters: profileParameters,
          complex_modifications: {
            rules,
          },
        },
        {
          name: "Aurora",
          parameters: profileParameters,
          complex_modifications: {
            rules: [...hyperSubLayers, resetLayerWithEscape],
          },
        },
      ],
    },
    null,
    2
  )
);
