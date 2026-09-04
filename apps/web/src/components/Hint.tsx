import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

/**
 * Wraps one interactive element with an explanatory tooltip.
 *
 * Replaces the native `title=` attribute, which takes about a second to appear,
 * cannot be styled, and never shows for keyboard users.
 */
export function Hint({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-64 text-pretty leading-snug">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
