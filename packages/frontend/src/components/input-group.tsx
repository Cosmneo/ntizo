import * as React from "react";
import { cn } from "../lib/utils";
import { Button, type ButtonProps } from "./button";

export const InputGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex h-10 w-full items-center rounded-md border border-[var(--color-input)] bg-[var(--color-background)] focus-within:ring-2 focus-within:ring-[var(--color-ring)]",
      className,
    )}
    {...props}
  />
));
InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex-1 bg-transparent px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)] focus:outline-none",
      className,
    )}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

export const InputGroupAddon = ({
  className,
  align = "inline-end",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  align?: "inline-start" | "inline-end";
}) => (
  <div
    className={cn(
      "flex items-center",
      align === "inline-end" ? "pr-1" : "pl-1",
      className,
    )}
    {...props}
  />
);

export const InputGroupButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(({ className, variant = "ghost", size = "icon-xs", type = "button", ...props }, ref) => (
  <Button
    ref={ref}
    type={type}
    variant={variant}
    size={size}
    className={cn("text-[var(--color-muted-foreground)]", className)}
    {...props}
  />
));
InputGroupButton.displayName = "InputGroupButton";
