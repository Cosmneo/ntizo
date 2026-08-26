import * as React from "react";
import { cn } from "../lib/utils";

export const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--color-muted)]",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";

/**
 * Not Radix: `AvatarFallback` is a plain flex sibling of this `<img>`, not a
 * peer arbitrated by a shared "loading state" the way Radix's primitive does
 * it. With both children mounted, a broken `src` still lays the `<img>` out
 * at its intrinsic (zero) content size holding `min-width: auto`, pushing
 * the fallback outside the `overflow-hidden` circle and clipping it — so a
 * 404'd photo rendered an empty circle, never the initials. Unmounting this
 * element on `error` is what leaves the fallback as the box's only child, so
 * it actually lays out inside it. The `key`-less local `useState` is reset
 * whenever `src` changes so a later, working photo isn't held hidden by an
 * earlier failure.
 */
export const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, alt = "", src, onError, ...props }, ref) => {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) return null;

  return (
    <img
      ref={ref}
      alt={alt}
      src={src}
      className={cn("aspect-square h-full w-full object-cover", className)}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
      {...props}
    />
  );
});
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-[var(--color-muted)] text-sm font-medium text-[var(--color-muted-foreground)]",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";
