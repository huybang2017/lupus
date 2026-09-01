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
            },
            "pressed": {
              "DEFAULT": "var(--button-transparent-pressed)"
            }
          },
          "danger": {
            "pressed": {
              "DEFAULT": "var(--button-danger-pressed)"
            },
            "DEFAULT": "var(--button-danger)",
            "hover": {
              "DEFAULT": "var(--button-danger-hover)"
            }
          },
          "neutral": {
            "DEFAULT": "var(--button-neutral)",
            "hover": {
              "DEFAULT": "var(--button-neutral-hover)"
            },
            "pressed": {
              "DEFAULT": "var(--button-neutral-pressed)"
            }
          }
        },
        "fg": {
          "on": {
            "color": {
              "DEFAULT": "var(--fg-on-color)"
            },
            "inverted": {
              "DEFAULT": "var(--fg-on-inverted)"
            }
          },
          "interactive": {
            "hover": {
              "DEFAULT": "var(--fg-interactive-hover)"
            },
            "DEFAULT": "var(--fg-interactive)"
          },
          "error": {
            "DEFAULT": "var(--fg-error)"
          },
          "subtle": {
            "DEFAULT": "var(--fg-subtle)"
          },
          "base": {
            "DEFAULT": "var(--fg-base)"
          },
          "disabled": {
            "DEFAULT": "var(--fg-disabled)"
          },
          "muted": {
            "DEFAULT": "var(--fg-muted)"
          }
        },
        "alpha": {
          "250": {
            "DEFAULT": "var(--alpha-250)"
          },
          "400": {
            "DEFAULT": "var(--alpha-400)"
          }
        }
      }
    },
    "boxShadow": {
      "buttons-danger-focus": "var(--buttons-danger-focus)",
      "details-contrast-on-bg-interactive": "var(--details-contrast-on-bg-interactive)",
      "borders-error": "var(--borders-error)",
      "borders-focus": "var(--borders-focus)",
      "buttons-danger": "var(--buttons-danger)",
      "buttons-inverted-focus": "var(--buttons-inverted-focus)",
      "elevation-card-hover": "var(--elevation-card-hover)",
      "details-switch-handle": "var(--details-switch-handle)",
      "buttons-neutral": "var(--buttons-neutral)",
      "borders-base": "var(--borders-base)",
      "elevation-card-rest": "var(--elevation-card-rest)",
      "buttons-neutral-focus": "var(--buttons-neutral-focus)",
      "details-switch-background-focus": "var(--details-switch-background-focus)",
      "details-switch-background": "var(--details-switch-background)",
      "elevation-flyout": "var(--elevation-flyout)",
      "elevation-tooltip": "var(--elevation-tooltip)",
      "elevation-modal": "var(--elevation-modal)",
      "elevation-code-block": "var(--elevation-code-block)",
      "buttons-inverted": "var(--buttons-inverted)",
      "elevation-commandbar": "var(--elevation-commandbar)",
      "borders-interactive-with-focus": "var(--borders-interactive-with-focus)",
      "borders-interactive-with-shadow": "var(--borders-interactive-with-shadow)",
      "borders-interactive-with-active": "var(--borders-interactive-with-active)"
    }
  }
};

// src/theme/tokens/colors.ts
var colors = {
  "dark": {
    "--button-danger-pressed": "rgba(225, 29, 72, 1)",
    "--bg-base-pressed": "rgba(63, 63, 70, 1)",
    "--bg-component-hover": "rgba(255, 255, 255, 0.1)",
    "--border-interactive": "rgba(96, 165, 250, 1)",
    "--button-neutral": "rgba(255, 255, 255, 0.04)",
    "--tag-orange-border": "rgba(124, 45, 18, 1)",
    "--tag-blue-text": "rgba(147, 197, 253, 1)",
    "--bg-highlight": "rgba(23, 37, 84, 1)",
    "--tag-neutral-icon": "rgba(113, 113, 122, 1)",
    "--bg-switch-off-hover": "rgba(82, 82, 91, 1)",
    "--fg-on-color": "rgba(255, 255, 255, 1)",
    "--button-inverted-pressed": "rgba(161, 161, 170, 1)",
    "--fg-interactive-hover": "rgba(147, 197, 253, 1)",
    "--fg-error": "rgba(251, 113, 133, 1)",
    "--bg-switch-off": "rgba(63, 63, 70, 1)",
    "--border-strong": "rgba(255, 255, 255, 0.16)",
    "--border-error": "rgba(251, 113, 133, 1)",
    "--fg-subtle": "rgba(161, 161, 170, 1)",
    "--bg-highlight-hover": "rgba(30, 58, 138, 1)",
    "--button-inverted": "rgba(82, 82, 91, 1)",
    "--tag-orange-text": "rgba(253, 186, 116, 1)",
    "--fg-base": "rgba(244, 244, 245, 1)",
    "--fg-disabled": "rgba(82, 82, 91, 1)",
    "--button-danger": "rgba(159, 18, 57, 1)",
    "--tag-neutral-border": "rgba(255, 255, 255, 0.06)",
    "--tag-blue-border": "rgba(30, 58, 138, 1)",
    "--tag-neutral-text": "rgba(212, 212, 216, 1)",
    "--tag-purple-border": "rgba(91, 33, 182, 1)",
    "--tag-green-text": "rgba(52, 211, 153, 1)",
    "--button-inverted-hover": "rgba(113, 113, 122, 1)",
    "--bg-component-pressed": "rgba(255, 255, 255, 0.16)",
    "--contrast-border-bot": "rgba(255, 255, 255, 0.08)",
    "--tag-blue-icon": "rgba(96, 165, 250, 1)",
    "--bg-field": "rgba(255, 255, 255, 0.04)",
    "--tag-neutral-bg": "rgba(255, 255, 255, 0.08)",
    "--tag-green-border": "rgba(6, 78, 59, 1)",
    "--tag-red-icon": "rgba(251, 113, 133, 1)",
    "--tag-red-text": "rgba(253, 164, 175, 1)",
    "--tag-purple-icon": "rgba(167, 139, 250, 1)",
    "--bg-interactive": "rgba(96, 165, 250, 1)",
    "--bg-field-hover": "rgba(255, 255, 255, 0.08)",
    "--border-transparent": "rgba(255, 255, 255, 0)",
    "--tag-orange-icon": "rgba(251, 146, 60, 1)",
    "--tag-purple-bg": "rgba(46, 16, 101, 1)",
    "--bg-base-hover": "rgba(39, 39, 42, 1)",
    "--tag-blue-bg": "rgba(23, 37, 84, 1)",
    "--tag-green-bg": "rgba(2, 44, 34, 1)",
    "--tag-purple-text": "rgba(196, 181, 253, 1)",
    "--tag-red-border": "rgba(136, 19, 55, 1)",
    "--border-danger": "rgba(190, 18, 60, 1)",
    "--tag-green-icon": "rgba(16, 185, 129, 1)",
    "--tag-red-bg": "rgba(76, 5, 25, 1)",
    "--fg-interactive": "rgba(96, 165, 250, 1)",
    "--tag-orange-bg": "rgba(67, 20, 7, 1)",
    "--button-danger-hover": "rgba(190, 18, 60, 1)",
    "--bg-component": "rgba(39, 39, 42, 1)",
    "--bg-disabled": "rgba(39, 39, 42, 1)",
    "--button-transparent": "rgba(255, 255, 255, 0)",
    "--border-menu-bot": "rgba(255, 255, 255, 0.08)",
    "--tag-purple-bg-hover": "rgba(91, 33, 182, 1)",
    "--tag-orange-bg-hover": "rgba(124, 45, 18, 1)",
    "--tag-blue-bg-hover": "rgba(30, 58, 138, 1)",
    "--tag-red-bg-hover": "rgba(136, 19, 55, 1)",
    "--tag-green-bg-hover": "rgba(6, 78, 59, 1)",
    "--border-menu-top": "rgba(33, 33, 36, 1)",
    "--bg-base": "rgba(33, 33, 36, 1)",
    "--contrast-border-top": "rgba(33, 33, 36, 1)",
    "--bg-field-component": "rgba(33, 33, 36, 1)",
    "--bg-subtle-hover": "rgba(33, 33, 36, 1)",
    "--bg-subtle": "rgba(24, 24, 27, 1)",
    "--fg-on-inverted": "rgba(24, 24, 27, 1)",
    "--bg-overlay": "rgba(24, 24, 27, 0.72)",
    "--button-transparent-hover": "rgba(255, 255, 255, 0.08)",
    "--contrast-fg-secondary": "rgba(255, 255, 255, 0.56)",
    "--contrast-border-base": "rgba(255, 255, 255, 0.16)",
    "--contrast-bg-base-pressed": "rgba(82, 82, 91, 1)",
    "--button-neutral-pressed": "rgba(255, 255, 255, 0.12)",
    "--border-base": "rgba(255, 255, 255, 0.08)",
    "--contrast-fg-primary": "rgba(255, 255, 255, 0.88)",
    "--button-neutral-hover": "rgba(255, 255, 255, 0.08)",
    "--contrast-bg-base": "rgba(39, 39, 42, 1)",
    "--tag-neutral-bg-hover": "rgba(255, 255, 255, 0.12)",
    "--contrast-bg-subtle": "rgba(255, 255, 255, 0.04)",
    "--contrast-bg-base-hover": "rgba(63, 63, 70, 1)",
    "--bg-field-component-hover": "rgba(39, 39, 42, 1)",
    "--bg-subtle-pressed": "rgba(39, 39, 42, 1)",
    "--button-transparent-pressed": "rgba(255, 255, 255, 0.12)",
    "--fg-muted": "rgba(113, 113, 122, 1)",
    "--alpha-400": "rgba(255, 255, 255, 0.24)",
    "--alpha-250": "rgba(255, 255, 255, 0.1)"
  },
  "light": {
    "--tag-neutral-border": "rgba(228, 228, 231, 1)",
    "--tag-neutral-icon": "rgba(161, 161, 170, 1)",
    "--bg-switch-off-hover": "rgba(212, 212, 216, 1)",
    "--border-menu-bot": "rgba(255, 255, 255, 1)",
    "--border-menu-top": "rgba(228, 228, 231, 1)",
    "--bg-subtle-hover": "rgba(244, 244, 245, 1)",
    "--contrast-fg-primary": "rgba(255, 255, 255, 0.88)",
    "--bg-switch-off": "rgba(228, 228, 231, 1)",
    "--contrast-bg-base-pressed": "rgba(63, 63, 70, 1)",
    "--bg-field-component-hover": "rgba(250, 250, 250, 1)",
    "--bg-base-pressed": "rgba(228, 228, 231, 1)",
    "--tag-neutral-text": "rgba(82, 82, 91, 1)",
    "--tag-red-text": "rgba(159, 18, 57, 1)",
    "--contrast-bg-base": "rgba(24, 24, 27, 1)",
    "--border-strong": "rgba(212, 212, 216, 1)",
    "--contrast-border-base": "rgba(255, 255, 255, 0.15)",
    "--bg-field": "rgba(250, 250, 250, 1)",
    "--tag-blue-text": "rgba(30, 64, 175, 1)",
    "--button-inverted-pressed": "rgba(82, 82, 91, 1)",
    "--border-interactive": "rgba(59, 130, 246, 1)",
    "--bg-base-hover": "rgba(244, 244, 245, 1)",
    "--contrast-bg-subtle": "rgba(39, 39, 42, 1)",
    "--bg-highlight": "rgba(239, 246, 255, 1)",
    "--contrast-fg-secondary": "rgba(255, 255, 255, 0.56)",
    "--tag-red-bg": "rgba(255, 228, 230, 1)",
    "--button-transparent": "rgba(255, 255, 255, 0)",
    "--button-danger-pressed": "rgba(159, 18, 57, 1)",
    "--fg-on-color": "rgba(255, 255, 255, 1)",
    "--button-inverted-hover": "rgba(63, 63, 70, 1)",
    "--bg-field-component": "rgba(255, 255, 255, 1)",
    "--tag-orange-text": "rgba(154, 52, 18, 1)",
    "--tag-green-icon": "rgba(16, 185, 129, 1)",
    "--border-base": "rgba(228, 228, 231, 1)",
    "--bg-base": "rgba(255, 255, 255, 1)",
    "--tag-orange-border": "rgba(254, 215, 170, 1)",
    "--tag-red-border": "rgba(254, 205, 211, 1)",
    "--tag-green-border": "rgba(167, 243, 208, 1)",
    "--tag-green-text": "rgba(6, 95, 70, 1)",
    "--button-neutral": "rgba(255, 255, 255, 1)",
    "--tag-blue-border": "rgba(191, 219, 254, 1)",
    "--fg-interactive-hover": "rgba(37, 99, 235, 1)",
    "--tag-orange-icon": "rgba(249, 115, 22, 1)",
    "--button-neutral-hover": "rgba(244, 244, 245, 1)",
    "--fg-interactive": "rgba(59, 130, 246, 1)",
    "--bg-component-pressed": "rgba(228, 228, 231, 1)",
    "--tag-purple-bg": "rgba(237, 233, 254, 1)",
    "--contrast-bg-base-hover": "rgba(39, 39, 42, 1)",
    "--bg-component": "rgba(250, 250, 250, 1)",
    "--bg-subtle": "rgba(250, 250, 250, 1)",
    "--tag-purple-text": "rgba(91, 33, 182, 1)",
    "--contrast-border-bot": "rgba(255, 255, 255, 0.1)",
    "--button-inverted": "rgba(39, 39, 42, 1)",
    "--tag-red-icon": "rgba(244, 63, 94, 1)",
    "--button-transparent-hover": "rgba(244, 244, 245, 1)",
    "--button-neutral-pressed": "rgba(228, 228, 231, 1)",
    "--tag-purple-icon": "rgba(167, 139, 250, 1)",
    "--bg-field-hover": "rgba(244, 244, 245, 1)",
    "--fg-on-inverted": "rgba(255, 255, 255, 1)",
    "--bg-interactive": "rgba(59, 130, 246, 1)",
    "--border-danger": "rgba(190, 18, 60, 1)",
    "--button-transparent-pressed": "rgba(228, 228, 231, 1)",
    "--tag-purple-border": "rgba(221, 214, 254, 1)",
    "--bg-highlight-hover": "rgba(219, 234, 254, 1)",
    "--border-error": "rgba(225, 29, 72, 1)",
    "--button-danger": "rgba(225, 29, 72, 1)",
    "--tag-blue-bg": "rgba(219, 234, 254, 1)",
    "--border-transparent": "rgba(255, 255, 255, 0)",
    "--button-danger-hover": "rgba(190, 18, 60, 1)",
    "--bg-subtle-pressed": "rgba(228, 228, 231, 1)",
    "--fg-error": "rgba(225, 29, 72, 1)",
    "--bg-component-hover": "rgba(244, 244, 245, 1)",
    "--bg-disabled": "rgba(244, 244, 245, 1)",
    "--tag-blue-icon": "rgba(96, 165, 250, 1)",
    "--fg-subtle": "rgba(82, 82, 91, 1)",
    "--tag-orange-bg-hover": "rgba(254, 215, 170, 1)",
    "--tag-green-bg-hover": "rgba(167, 243, 208, 1)",
    "--tag-red-bg-hover": "rgba(254, 205, 211, 1)",
    "--tag-purple-bg-hover": "rgba(221, 214, 254, 1)",
    "--tag-neutral-bg-hover": "rgba(228, 228, 231, 1)",
    "--tag-blue-bg-hover": "rgba(191, 219, 254, 1)",
    "--tag-green-bg": "rgba(209, 250, 229, 1)",
    "--tag-neutral-bg": "rgba(244, 244, 245, 1)",
    "--tag-orange-bg": "rgba(255, 237, 213, 1)",
    "--fg-base": "rgba(24, 24, 27, 1)",
    "--contrast-border-top": "rgba(24, 24, 27, 1)",
    "--bg-overlay": "rgba(24, 24, 27, 0.4)",
    "--fg-disabled": "rgba(161, 161, 170, 1)",
    "--fg-muted": "rgba(113, 113, 122, 1)",
    "--alpha-250": "rgba(24, 24, 27, 0.1)",
    "--alpha-400": "rgba(24, 24, 27, 0.24)"
  }
};

// src/theme/tokens/components.ts
var components = {
  "dark": {},
  "light": {}
};

// src/theme/tokens/effects.ts
var effects = {
  "dark": {
    "--details-contrast-on-bg-interactive": "0px 1px 2px 0px rgba(30, 58, 138, 0.6)",
    "--details-switch-handle": "0px 0px 2px 1px rgba(255, 255, 255, 1) inset, 0px 1px 0px 0px rgba(255, 255, 255, 1) inset, 0px 0px 0px 0.5px rgba(0, 0, 0, 0.16), 0px 5px 4px 0px rgba(0, 0, 0, 0.1), 0px 3px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px 0px rgba(0, 0, 0, 0.1), 0px 0px 1px 0px rgba(0, 0, 0, 0.1)",
    "--borders-interactive-with-active": "0px 0px 0px 1px rgba(96, 165, 250, 1), 0px 0px 0px 4px rgba(59, 130, 246, 0.25)",
    "--borders-focus": "0px 0px 0px 1px rgba(24, 24, 27, 1), 0px 0px 0px 3px rgba(96, 165, 250, 0.8)",
    "--details-switch-background-focus": "0px 0px 0px 1px rgba(24, 24, 27, 1), 0px 0px 0px 3px rgba(96, 165, 250, 0.8), 0px 1px 1px 0px rgba(0, 0, 0, 0.1) inset, 0px 2px 4px 0px rgba(0, 0, 0, 0.1) inset, 0px 0px 0px 0.75px rgba(255, 255, 255, 0.12) inset, 0px 0px 8px 0px rgba(0, 0, 0, 0.1) inset",
    "--buttons-danger": "0px -1px 0px 0px rgba(255, 255, 255, 0.16), 0px 0px 0px 1px rgba(255, 255, 255, 0.12), 0px 0px 0px 1px rgba(159, 18, 57, 1), 0px 0px 1px 1.5px rgba(0, 0, 0, 0.24), 0px 2px 2px 0px rgba(0, 0, 0, 0.24)",
    "--buttons-danger-focus": "0px -1px 0px 0px rgba(255, 255, 255, 0.16), 0px 0px 0px 1px rgba(255, 255, 255, 0.12), 0px 0px 0px 1px rgba(159, 18, 57, 1), 0px 0px 0px 2px rgba(24, 24, 27, 1), 0px 0px 0px 4px rgba(96, 165, 250, 0.8)",
    "--details-switch-background": "0px 1px 1px 0px rgba(0, 0, 0, 0.1) inset, 0px 2px 4px 0px rgba(0, 0, 0, 0.1) inset, 0px 0px 0px 0.75px rgba(255, 255, 255, 0.12) inset, 0px 0px 8px 0px rgba(0, 0, 0, 0.1) inset",
    "--buttons-inverted-focus": "0px -1px 0px 0px rgba(255, 255, 255, 0.12), 0px 0px 0px 1px rgba(255, 255, 255, 0.12), 0px 0px 0px 1px rgba(82, 82, 91, 1), 0px 0px 0px 2px rgba(24, 24, 27, 1), 0px 0px 0px 4px rgba(96, 165, 250, 0.8)",
    "--elevation-flyout": "0px -1px 0px 0px rgba(255, 255, 255, 0.04), 0px 0px 0px 1px rgba(255, 255, 255, 0.1), 0px 4px 8px 0px rgba(0, 0, 0, 0.32), 0px 8px 16px 0px rgba(0, 0, 0, 0.32)",
    "--borders-error": "0px 0px 0px 1px rgba(244, 63, 94, 1), 0px 0px 0px 3px rgba(225, 29, 72, 0.25)",
    "--buttons-inverted": "0px -1px 0px 0px rgba(255, 255, 255, 0.12), 0px 0px 0px 1px rgba(255, 255, 255, 0.1), 0px 0px 0px 1px rgba(82, 82, 91, 1), 0px 0px 1px 1.5px rgba(0, 0, 0, 0.24), 0px 2px 2px 0px rgba(0, 0, 0, 0.24)",
    "--borders-base": "0px -1px 0px 0px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(39, 39, 42, 1), 0px 0px 1px 1.5px rgba(0, 0, 0, 0.24), 0px 2px 2px 0px rgba(0, 0, 0, 0.24)",
    "--elevation-card-hover": "0px -1px 0px 0px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(39, 39, 42, 1), 0px 1px 4px 0px rgba(0, 0, 0, 0.48), 0px 2px 8px 0px rgba(0, 0, 0, 0.48)",
    "--elevation-card-rest": "0px -1px 0px 0px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(39, 39, 42, 1), 0px 1px 2px 0px rgba(0, 0, 0, 0.32), 0px 2px 4px 0px rgba(0, 0, 0, 0.32)",
    "--buttons-neutral": "0px -1px 0px 0px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(39, 39, 42, 1), 0px 0px 1px 1.5px rgba(0, 0, 0, 0.24), 0px 2px 2px 0px rgba(0, 0, 0, 0.24)",
    "--elevation-code-block": "0px -1px 0px 0px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(39, 39, 42, 1), 0px 1px 2px 0px rgba(0, 0, 0, 0.32), 0px 2px 4px 0px rgba(0, 0, 0, 0.32)",
    "--buttons-neutral-focus": "0px -1px 0px 0px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(255, 255, 255, 0.06), 0px 0px 0px 1px rgba(39, 39, 42, 1), 0px 0px 0px 2px rgba(24, 24, 27, 1), 0px 0px 0px 4px rgba(96, 165, 250, 0.8)",
    "--elevation-modal": "0px 0px 0px 1px rgba(24, 24, 27, 1) inset, 0px 0px 0px 1.5px rgba(255, 255, 255, 0.06) inset, 0px -1px 0px 0px rgba(255, 255, 255, 0.04), 0px 0px 0px 1px rgba(255, 255, 255, 0.1), 0px 4px 8px 0px rgba(0, 0, 0, 0.32), 0px 8px 16px 0px rgba(0, 0, 0, 0.32)",
    "--elevation-commandbar": "0px 0px 0px 0.75px rgba(24, 24, 27, 1) inset, 0px 0px 0px 1.25px rgba(255, 255, 255, 0.1) inset, 0px 4px 8px 0px rgba(0, 0, 0, 0.32), 0px 8px 16px 0px rgba(0, 0, 0, 0.32)",
    "--elevation-tooltip": "0px -1px 0px 0px rgba(255, 255, 255, 0.04), 0px 2px 4px 0px rgba(0, 0, 0, 0.32), 0px 0px 0px 1px rgba(255, 255, 255, 0.1), 0px 4px 8px 0px rgba(0, 0, 0, 0.32)",
    "--borders-interactive-with-focus": "0px -1px 2px 0px rgba(219, 234, 254, 0.5), 0px 0px 0px 1px rgba(96, 165, 250, 1), 0px 0px 0px 2px rgba(24, 24, 27, 1), 0px 0px 0px 4px rgba(96, 165, 250, 0.8)",
    "--borders-interactive-with-shadow": "0px -1px 2px 0px rgba(219, 234, 254, 0.5), 0px 0px 0px 1px rgba(96, 165, 250, 1)"
  },
  "light": {
    "--buttons-danger-focus": "0px 0.75px 0px 0px rgba(255, 255, 255, 0.2) inset, 0px 1px 2px 0px rgba(190, 18, 60, 0.4), 0px 0px 0px 1px rgba(190, 18, 60, 1), 0px 0px 0px 2px rgba(255, 255, 255, 1), 0px 0px 0px 4px rgba(59, 130, 246, 0.6)",
    "--details-contrast-on-bg-interactive": "0px 1px 2px 0px rgba(30, 58, 138, 0.6)",
    "--borders-error": "0px 0px 0px 1px rgba(225, 29, 72, 1), 0px 0px 0px 3px rgba(225, 29, 72, 0.15)",
    "--borders-focus": "0px 0px 0px 1px rgba(255, 255, 255, 1), 0px 0px 0px 3px rgba(59, 130, 246, 0.6)",
    "--buttons-danger": "0px 0.75px 0px 0px rgba(255, 255, 255, 0.2) inset, 0px 1px 2px 0px rgba(190, 18, 60, 0.4), 0px 0px 0px 1px rgba(190, 18, 60, 1)",
    "--buttons-inverted-focus": "0px 0.75px 0px 0px rgba(255, 255, 255, 0.2) inset, 0px 1px 2px 0px rgba(0, 0, 0, 0.4), 0px 0px 0px 1px rgba(24, 24, 27, 1), 0px 0px 0px 2px rgba(255, 255, 255, 1), 0px 0px 0px 4px rgba(59, 130, 246, 0.6)",
    "--elevation-card-hover": "0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 1px 2px -1px rgba(0, 0, 0, 0.08), 0px 2px 8px 0px rgba(0, 0, 0, 0.1)",
    "--details-switch-handle": "0px 0px 2px 1px rgba(255, 255, 255, 1) inset, 0px 1px 0px 0px rgba(255, 255, 255, 1) inset, 0px 0px 0px 0.5px rgba(0, 0, 0, 0.02), 0px 5px 4px 0px rgba(0, 0, 0, 0.02), 0px 3px 3px 0px rgba(0, 0, 0, 0.04), 0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 1px 0px rgba(0, 0, 0, 0.08)",
    "--buttons-neutral": "0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 0px 1px rgba(0, 0, 0, 0.08)",
    "--borders-base": "0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 0px 1px rgba(0, 0, 0, 0.08)",
    "--elevation-card-rest": "0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 1px 2px -1px rgba(0, 0, 0, 0.08), 0px 2px 4px 0px rgba(0, 0, 0, 0.04)",
    "--buttons-neutral-focus": "0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 0px 0px 2px rgba(255, 255, 255, 1), 0px 0px 0px 4px rgba(59, 130, 246, 0.6)",
    "--details-switch-background-focus": "0px 0px 0px 1px rgba(255, 255, 255, 1), 0px 0px 0px 3px rgba(59, 130, 246, 0.6), 0px 1px 1px 0px rgba(0, 0, 0, 0.04) inset, 0px 2px 4px 0px rgba(0, 0, 0, 0.04) inset, 0px 0px 0px 0.75px rgba(0, 0, 0, 0.06) inset, 0px 0px 8px 0px rgba(0, 0, 0, 0.02) inset, 0px 2px 4px 0px rgba(0, 0, 0, 0.04)",
    "--details-switch-background": "0px 1px 1px 0px rgba(0, 0, 0, 0.04) inset, 0px 2px 4px 0px rgba(0, 0, 0, 0.04) inset, 0px 0px 0px 0.75px rgba(0, 0, 0, 0.06) inset, 0px 0px 8px 0px rgba(0, 0, 0, 0.02) inset, 0px 2px 4px 0px rgba(0, 0, 0, 0.04)",
    "--elevation-flyout": "0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 4px 8px 0px rgba(0, 0, 0, 0.08), 0px 8px 16px 0px rgba(0, 0, 0, 0.08)",
    "--elevation-tooltip": "0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 2px 4px 0px rgba(0, 0, 0, 0.08), 0px 4px 8px 0px rgba(0, 0, 0, 0.08)",
    "--elevation-modal": "0px 0px 0px 1px rgba(255, 255, 255, 1) inset, 0px 0px 0px 1.5px rgba(228, 228, 231, 0.6) inset, 0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 8px 16px 0px rgba(0, 0, 0, 0.08), 0px 16px 32px 0px rgba(0, 0, 0, 0.08)",
    "--elevation-code-block": "0px 0px 0px 1px rgba(24, 24, 27, 1) inset, 0px 0px 0px 1.5px rgba(255, 255, 255, 0.2) inset",
    "--buttons-inverted": "0px 0.75px 0px 0px rgba(255, 255, 255, 0.2) inset, 0px 1px 2px 0px rgba(0, 0, 0, 0.4), 0px 0px 0px 1px rgba(24, 24, 27, 1)",
    "--elevation-commandbar": "0px 0px 0px 0.75px rgba(39, 39, 42, 1) inset, 0px 0px 0px 1.25px rgba(255, 255, 255, 0.3) inset, 0px 8px 16px 0px rgba(0, 0, 0, 0.08), 0px 16px 32px 0px rgba(0, 0, 0, 0.08)",
    "--borders-interactive-with-focus": "0px 1px 2px 0px rgba(30, 58, 138, 0.5), 0px 0px 0px 1px rgba(37, 99, 235, 1), 0px 0px 0px 2px rgba(255, 255, 255, 1), 0px 0px 0px 4px rgba(37, 99, 235, 0.6)",
    "--borders-interactive-with-shadow": "0px 1px 2px 0px rgba(30, 58, 138, 0.5), 0px 0px 0px 1px rgba(37, 99, 235, 1)",
    "--borders-interactive-with-active": "0px 0px 0px 4px rgba(37, 99, 235, 0.2), 0px 0px 0px 1px rgba(37, 99, 235, 1)"
  }
};

// src/theme/tokens/typography.ts
var typography = {
  ".h1-webs": {
    "fontSize": "4rem",
    "lineHeight": "4.400000095367432rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h2-webs": {
    "fontSize": "3.5rem",
    "lineHeight": "3.8500001430511475rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h3-webs": {
    "fontSize": "2.5rem",
    "lineHeight": "2.75rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-xlarge-plus": {
    "fontSize": "1.125rem",
    "lineHeight": "1.25rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-xsmall": {
    "fontSize": "0.75rem",
    "lineHeight": "1.25rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-xsmall-plus": {
    "fontSize": "0.75rem",
    "lineHeight": "1.25rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-small-plus": {
    "fontSize": "0.8125rem",
    "lineHeight": "1.25rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-medium": {
    "fontSize": "0.875rem",
    "lineHeight": "1.25rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-large-plus": {
    "fontSize": "1rem",
    "lineHeight": "1.25rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-large": {
    "fontSize": "1rem",
    "lineHeight": "1.25rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-medium-plus": {
    "fontSize": "0.875rem",
    "lineHeight": "1.25rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-xlarge": {
    "fontSize": "1.125rem",
    "lineHeight": "1.25rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-compact-small": {
    "fontSize": "0.8125rem",
    "lineHeight": "1.25rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h4-webs": {
    "fontSize": "1.5rem",
    "lineHeight": "1.875rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h2-core": {
    "fontSize": "1rem",
    "lineHeight": "1.5rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h3-core": {
    "fontSize": "0.875rem",
    "lineHeight": "1.25rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h1-core": {
    "fontSize": "1.125rem",
    "lineHeight": "1.75rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h1-docs": {
    "fontSize": "1.5rem",
    "lineHeight": "1.875rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h4-docs": {
    "fontSize": "0.875rem",
    "lineHeight": "1.399999976158142rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".code-label-plus": {
    "fontSize": "0.75rem",
    "lineHeight": "0.9375rem",
    "fontWeight": "500",
    "fontFamily": "Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
  },
  ".code-label": {
    "fontSize": "0.75rem",
    "lineHeight": "0.9375rem",
    "fontWeight": "400",
    "fontFamily": "Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
  },
  ".code-paragraph": {
    "fontSize": "0.75rem",
    "lineHeight": "1.2000000476837158rem",
    "fontWeight": "400",
    "fontFamily": "Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
  },
  ".code-paragraph-plus": {
    "fontSize": "0.75rem",
    "lineHeight": "1.2000000476837158rem",
    "fontWeight": "500",
    "fontFamily": "Roboto Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
  },
  ".txt-xsmall-plus": {
    "fontSize": "0.75rem",
    "lineHeight": "1.2000000476837158rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-small": {
    "fontSize": "0.8125rem",
    "lineHeight": "1.3000000715255737rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h2-docs": {
    "fontSize": "1.125rem",
    "lineHeight": "1.8000000715255737rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-medium": {
    "fontSize": "0.875rem",
    "lineHeight": "1.399999976158142rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-small-plus": {
    "fontSize": "0.8125rem",
    "lineHeight": "1.3000000715255737rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-large": {
    "fontSize": "1rem",
    "lineHeight": "1.600000023841858rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-medium-plus": {
    "fontSize": "0.875rem",
    "lineHeight": "1.399999976158142rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-xsmall": {
    "fontSize": "0.75rem",
    "lineHeight": "1.2000000476837158rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".h3-docs": {
    "fontSize": "1rem",
    "lineHeight": "1.600000023841858rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-xlarge-plus": {
    "fontSize": "1.125rem",
    "lineHeight": "1.8000000715255737rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-large-plus": {
    "fontSize": "1rem",
    "lineHeight": "1.600000023841858rem",
    "fontWeight": "500",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  },
  ".txt-xlarge": {
    "fontSize": "1.125rem",
    "lineHeight": "1.8000000715255737rem",
    "fontWeight": "400",
    "fontFamily": "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji"
  }
};

// src/plugin.ts
var plugin_default = (0, import_plugin.default)(
  function lupusUi({ addBase, addComponents, config }) {
    const [darkMode, className = ".dark"] = [].concat(
      config("darkMode", "media")
    );
    addBase({
      "*": {
        borderColor: "var(--border-base)"
      }
    });
    addComponents(typography);
    addBase({
      ":root": { ...colors.light, ...effects.light },
      ...components.light
    });
    if (darkMode === "class") {
      addBase({
        [className]: { ...colors.dark, ...effects.dark }
      });
    } else {
      addBase({
        "@media (prefers-color-scheme: dark)": {
          ":root": { ...colors.dark, ...effects.dark },
          ...components.dark
        }
      });
    }
  },
  {
    theme: {
      extend: {
        ...theme.extend,
        fontFamily: {
          sans: FONT_FAMILY_SANS,
          mono: FONT_FAMILY_MONO
        },
        transitionProperty: {
          fg: "color, background-color, border-color, box-shadow, opacity"
        },
        keyframes: {
          "accordion-down": {
            from: { height: "0px" },
            to: { height: "var(--radix-accordion-content-height)" }
          },
          "accordion-up": {
            from: { height: "var(--radix-accordion-content-height)" },
            to: { height: "0px" }
          }
        },
        animation: {
          "accordion-down": "accordion-down 0.2s ease-out",
          "accordion-up": "accordion-up 0.2s ease-out"
        }
      }
    }
  }
);

// src/preset.ts
var preset = {
  content: [],
  plugins: [plugin_default, require("tailwindcss-animate")]
};

// src/index.ts
module.exports = preset;
