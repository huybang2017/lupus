/* Vendored from @medusajs/ui-preset 2.21.0 (MIT, Medusa Commerce Inc.). Kept as a local file so the storefront has no @medusajs/* dependency. */
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/plugin.ts
var import_plugin = __toESM(require("tailwindcss/plugin"));

// src/constants.ts
var tailwindFontFamily = {
  sans: [
    "ui-sans-serif",
    "system-ui",
    "sans-serif",
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Segoe UI Symbol"',
    '"Noto Color Emoji"'
  ],
  serif: [
    "ui-serif",
    "Georgia",
    "Cambria",
    '"Times New Roman"',
    "Times",
    "serif"
  ],
  mono: [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Monaco",
    "Consolas",
    '"Liberation Mono"',
    '"Courier New"',
    "monospace"
  ]
};
var FONT_FAMILY_SANS = ["Inter", ...tailwindFontFamily.sans];
var FONT_FAMILY_MONO = ["Roboto Mono", ...tailwindFontFamily.mono];

// src/theme/extension/theme.ts
var theme = {
  "extend": {
    "colors": {
      "ui": {
        "tag": {
          "neutral": {
            "border": {
              "DEFAULT": "var(--tag-neutral-border)"
            },
            "icon": {
              "DEFAULT": "var(--tag-neutral-icon)"
            },
            "text": {
              "DEFAULT": "var(--tag-neutral-text)"
            },
            "bg": {
              "hover": {
                "DEFAULT": "var(--tag-neutral-bg-hover)"
              },
              "DEFAULT": "var(--tag-neutral-bg)"
            }
          },
          "red": {
            "text": {
              "DEFAULT": "var(--tag-red-text)"
            },
            "bg": {
              "DEFAULT": "var(--tag-red-bg)",
              "hover": {
                "DEFAULT": "var(--tag-red-bg-hover)"
              }
            },
            "border": {
              "DEFAULT": "var(--tag-red-border)"
            },
            "icon": {
              "DEFAULT": "var(--tag-red-icon)"
            }
          },
          "blue": {
            "text": {
              "DEFAULT": "var(--tag-blue-text)"
            },
            "border": {
              "DEFAULT": "var(--tag-blue-border)"
            },
            "bg": {
              "DEFAULT": "var(--tag-blue-bg)",
              "hover": {
                "DEFAULT": "var(--tag-blue-bg-hover)"
              }
            },
            "icon": {
              "DEFAULT": "var(--tag-blue-icon)"
            }
          },
          "orange": {
            "text": {
              "DEFAULT": "var(--tag-orange-text)"
            },
            "border": {
              "DEFAULT": "var(--tag-orange-border)"
            },
            "icon": {
              "DEFAULT": "var(--tag-orange-icon)"
            },
            "bg": {
              "hover": {
                "DEFAULT": "var(--tag-orange-bg-hover)"
              },
              "DEFAULT": "var(--tag-orange-bg)"
            }
          },
          "green": {
            "icon": {
              "DEFAULT": "var(--tag-green-icon)"
            },
            "border": {
              "DEFAULT": "var(--tag-green-border)"
            },
            "text": {
              "DEFAULT": "var(--tag-green-text)"
            },
            "bg": {
              "hover": {
                "DEFAULT": "var(--tag-green-bg-hover)"
              },
              "DEFAULT": "var(--tag-green-bg)"
            }
          },
          "purple": {
            "bg": {
              "DEFAULT": "var(--tag-purple-bg)",
              "hover": {
                "DEFAULT": "var(--tag-purple-bg-hover)"
              }
            },
            "text": {
              "DEFAULT": "var(--tag-purple-text)"
            },
            "icon": {
              "DEFAULT": "var(--tag-purple-icon)"
            },
            "border": {
              "DEFAULT": "var(--tag-purple-border)"
            }
          }
        },
        "bg": {
          "switch": {
            "off": {
              "hover": {
                "DEFAULT": "var(--bg-switch-off-hover)"
              },
              "DEFAULT": "var(--bg-switch-off)"
            }
          },
          "subtle": {
            "hover": {
              "DEFAULT": "var(--bg-subtle-hover)"
            },
            "DEFAULT": "var(--bg-subtle)",
            "pressed": {
              "DEFAULT": "var(--bg-subtle-pressed)"
            }
          },
          "field": {
            "component": {
              "hover": {
                "DEFAULT": "var(--bg-field-component-hover)"
              },
              "DEFAULT": "var(--bg-field-component)"
            },
            "DEFAULT": "var(--bg-field)",
            "hover": {
              "DEFAULT": "var(--bg-field-hover)"
            }
          },
          "base": {
            "pressed": {
              "DEFAULT": "var(--bg-base-pressed)"
            },
            "hover": {
              "DEFAULT": "var(--bg-base-hover)"
            },
            "DEFAULT": "var(--bg-base)"
          },
          "highlight": {
            "DEFAULT": "var(--bg-highlight)",
            "hover": {
              "DEFAULT": "var(--bg-highlight-hover)"
            }
          },
          "component": {
            "pressed": {
              "DEFAULT": "var(--bg-component-pressed)"
            },
            "DEFAULT": "var(--bg-component)",
            "hover": {
              "DEFAULT": "var(--bg-component-hover)"
            }
          },
          "interactive": {
            "DEFAULT": "var(--bg-interactive)"
          },
          "disabled": {
            "DEFAULT": "var(--bg-disabled)"
          },
          "overlay": {
            "DEFAULT": "var(--bg-overlay)"
          }
        },
        "border": {
          "menu": {
            "bot": {
              "DEFAULT": "var(--border-menu-bot)"
            },
            "top": {
              "DEFAULT": "var(--border-menu-top)"
            }
          },
          "strong": {
            "DEFAULT": "var(--border-strong)"
          },
          "interactive": {
            "DEFAULT": "var(--border-interactive)"
          },
          "base": {
            "DEFAULT": "var(--border-base)"
          },
          "danger": {
            "DEFAULT": "var(--border-danger)"
          },
          "error": {
            "DEFAULT": "var(--border-error)"
          },
          "transparent": {
            "DEFAULT": "var(--border-transparent)"
          }
        },
        "contrast": {
          "fg": {
            "primary": {
              "DEFAULT": "var(--contrast-fg-primary)"
            },
            "secondary": {
              "DEFAULT": "var(--contrast-fg-secondary)"
            }
          },
          "bg": {
            "base": {
              "pressed": {
                "DEFAULT": "var(--contrast-bg-base-pressed)"
              },
              "DEFAULT": "var(--contrast-bg-base)",
              "hover": {
                "DEFAULT": "var(--contrast-bg-base-hover)"
              }
            },
            "subtle": {
              "DEFAULT": "var(--contrast-bg-subtle)"
            }
          },
          "border": {
            "base": {
              "DEFAULT": "var(--contrast-border-base)"
            },
            "bot": {
              "DEFAULT": "var(--contrast-border-bot)"
            },
            "top": {
              "DEFAULT": "var(--contrast-border-top)"
            }
          }
        },
        "button": {
          "inverted": {
            "pressed": {
              "DEFAULT": "var(--button-inverted-pressed)"
            },
            "hover": {
              "DEFAULT": "var(--button-inverted-hover)"
            },
            "DEFAULT": "var(--button-inverted)"
          },
          "transparent": {
            "DEFAULT": "var(--button-transparent)",
            "hover": {
              "DEFAULT": "var(--button-transparent-hover)"
