import { Layers } from "./rules/layers/layerSwitcher";
import { To, KeyCode, Manipulator, KarabinerRules } from "./types";

/**
 * Custom way to describe a command in a layer
 */
export interface LayerCommand {
  to: To[];
  description?: string;
}

/**
 * Create all hyper sublayers. This needs to be a single function, as well need to
 * have all the hyper variable names in order to filter them and make sure only one
 * activates at a time
 */
export const createHyperSubLayers = (input: { [keyCode in KeyCode]?: { [subKeyCode in KeyCode]?: LayerCommand } }) => {
  const layerKeyCodes = Object.keys(input)

  return layerKeyCodes.map(layerKeycode => {
    const description = `Hyper Key sublayer ${layerKeycode}`
    const subLayerKeyCodes = Object.keys(input[layerKeycode])
    return ({
      description,
      manipulators: [
        {
          type: "basic",
          from: {
            key_code: layerKeycode,
            modifiers: {
              mandatory: [
                "left_shift",
                "left_control",
                "left_option",
                "left_command"
              ]
            }
          },
          to: [
            {
              set_variable: {
                name: "sublayer",
                value: layerKeycode
              }
            }
          ],
          parameters: {
            "basic.to_delayed_action_delay_milliseconds": 500
          },
          to_delayed_action: {
            "to_if_invoked": [
              {
                set_variable: {
                  name: "sublayer",
                  value: ""
                }
              }
            ],
          }
        },
        ...subLayerKeyCodes.map(subLayerKeyCode => ({
          type: "basic",
          from: {
            key_code: subLayerKeyCode,
          },
          conditions: [
            {
              type: "variable_if",
              name: "sublayer",
              value: layerKeycode
            }
          ],
          to: [
            ...input[layerKeycode][subLayerKeyCode].to,
            {
              set_variable: {
                name: "sublayer",
                value: ""
              }
            }
          ],
        }))
      ]
    }) as KarabinerRules
  })
}

/**
 * Shortcut for "open" shell command
 */
export function open(what: string): LayerCommand {
  return {
    to: [
      {
        shell_command: `open ${what}`,
      },
    ],
    description: `Open ${what}`,
  };
}

/**
 * Shortcut for "window" raycast command
 */
export function window(position: string): LayerCommand {
  return {
    to: [
      {
        shell_command: `open -g "raycast://extensions/raycast/window-management/${position}"`,
      },
    ],
    description: `Open ${position}`,
  };
}

export const createLayerConverter = (layer: Layers) => (from: KeyCode, to: KeyCode, modifiers?: string[]): Manipulator => ({
  type: "basic",
  from: {
    key_code: from,
    modifiers: {
      optional: ["any"]
    }
  },
  conditions: [
    {
      type: "variable_if",
      name: "layer",
      value: layer
    },
    {
      type: "device_if",
      identifiers: [
        {
          vendor_id: 1452,
          product_id: 834
        }
      ]
    }
  ],
  to: [
    {
      key_code: to,
      modifiers
    }
  ]
})

export const convertToSpecialLayer = createLayerConverter(Layers.special)
export const convertToNumbersLayer = createLayerConverter(Layers.number)
export const convertToArrowsLayer = createLayerConverter(Layers.arrows)

export function layer(key_code: KeyCode, layerInput: Layers): Manipulator[] {
  return ([
    {
      type: "basic",
      from: {
        key_code: key_code
      },
      conditions: [
        {
          type: "variable_unless",
          name: "layer",
          value: layerInput
        }
      ],
      to: [
        {
          set_variable: {
            name: "layer",
            value: layerInput
          }
        }
      ]
    },
    {
      type: "basic",
      from: {
        key_code: key_code
      },
      conditions: [
        {
          type: "variable_if",
          name: "layer",
          value: layerInput
        }
      ],
      to: [
        {
          set_variable: {
            name: "layer",
            value: Layers.text
          }
        }
      ]
    }
  ])
}

export const homeRowKey = (fromKeys: { key: KeyCode, modifier?: KeyCode }[], to: KeyCode): Manipulator[] => {
  return fromKeys.map(({ key, modifier }) => ({
    // conditions: [
    //   {
    //     type: "variable_if",
    //     name: "sublayer",
    //     value: ""
    //   }
    // ],
    from: {
      key_code: key,
      modifiers: {
        optional: [
          "any"
        ],
        mandatory: modifier ? [modifier] : undefined
      }
    },
    to: [
      {
        key_code: to,
        modifiers: ["any"]
      }
    ],
    to_if_alone: [
      {
        key_code: key
      }
    ],
    type: "basic"
  }))
}
