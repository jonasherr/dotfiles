import { KarabinerRules } from "../types";

export const meh: KarabinerRules = {
  "description": "MEH Key: map Space to Shift-Option-Control (Space if alone)",
  "manipulators": [
    {
      "from": {
        "key_code": "spacebar",
        "modifiers": {
          "optional": [
            "any"
          ]
        }
      },
      "to": [
        {
          "key_code": "left_shift",
          "modifiers": [
            "left_control",
            "left_option"
          ]
        }
      ],
      "to_if_alone": [
        {
          "key_code": "spacebar"
        }
      ],
      "type": "basic"
    }
  ]
}
