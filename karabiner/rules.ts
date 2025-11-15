import fs from "fs";
import { homeRow } from "./rules/homerow";
import { hyperKey } from "./rules/hyperKey";
import { arrowsLayer } from "./rules/layers/arrows";
import { Layers, layerSwitcher } from "./rules/layers/layerSwitcher";
import { numberLayer } from "./rules/layers/numbers";
import { specialLayer } from "./rules/layers/special";
import { meh } from "./rules/meh";
import { simultaneous } from "./rules/simultaneous";
import { KarabinerRules } from "./types";

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
      ],
    },
    null,
    2
  )
);
