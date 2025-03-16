import { KarabinerRules } from "../types";

export const hyperKey: KarabinerRules = {
  description: "Hyper Key (⌃⌥⇧⌘)",
  manipulators: [
    {
      description: "Caps Lock -> Hyper Key",
      from: {
        key_code: "caps_lock",
        modifiers: {
          optional: ["any"],
        },
      },
      to: [
        {
          key_code: "left_shift",
          modifiers: ["left_control", "left_option", "left_command"],
        },
      ],
      to_if_alone: [
        {
          key_code: "escape",
        },
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
      type: "basic",
    },
  ],
};
