import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  useCallback,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";

// One Popover wrapper for the whole admin. Radix already gives us Escape,
// outside pointer-down dismissal, focus containment and collision flipping, so
// this only standardises placement, width and the content chrome.

export interface PopoverProps {
  /**
   * Rendered as the trigger. Must return exactly one <button>: it is merged
   * onto the Radix trigger, which keeps aria-haspopup/aria-expanded, the
   * forwarded ref and the click-to-toggle behaviour.
   */
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    ref: (node: HTMLButtonElement | null) => void;
  }) => ReactNode;
  children: ReactNode | ((props: { close: () => void }) => ReactNode);
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pixel width override for the content (default 260). */
  width?: number | string;
  className?: string;
  /**
   * Radix "pointer down landed outside the panel" hook. Call
   * `event.preventDefault()` to keep the panel open (e.g. when the press was on
   * a nested portalled list that belongs to this panel).
   */
  onPointerDownOutside?: (event: Event) => void;
  "aria-label"?: string;
  style?: CSSProperties;
}

export function Popover({
  trigger,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  open: openProp,
  onOpenChange,
  width = 260,
  className,
  onPointerDownOutside,
  "aria-label": ariaLabel,
  style,
}: PopoverProps): JSX.Element {
  const controlled = openProp !== undefined;
  const [openFallback, setOpenFallback] = useState(false);
  // The node itself is only needed for callers that want to measure/focus it,
  // so the setter doubles as the stable ref identity Radix composes.
  const [, setTriggerNode] = useState<HTMLButtonElement | null>(null);

  const open = controlled ? openProp : openFallback;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setOpenFallback(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      {/* asChild keeps the trigger styling in the caller; Radix still owns the
          click handler, so `toggle` is only for programmatic callers. */}
      <PopoverPrimitive.Trigger
        asChild
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        ref={setTriggerNode}
      >
        {trigger({ open, toggle: () => setOpen(!open), ref: setTriggerNode })}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="dialog"
          aria-label={ariaLabel}
          onPointerDownOutside={onPointerDownOutside}
          className={["ui-popover-content", className].filter(Boolean).join(" ")}
          style={{ width, maxWidth: "calc(100vw - 16px)", ...style }}
          align={align}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={8}
        >
          <PopoverPrimitive.Arrow className="ui-popover-arrow" />
          {typeof children === "function" ? children({ close }) : children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}