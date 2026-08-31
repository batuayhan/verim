// Ambient module declarations — packages without bundled .d.ts files.
// NARX icon set mirrors @mui/icons-material; each icon is its own ES module.
// We expose the whole MUI-compatible surface via a re-export so that named
// imports (Add, Close, Hub, …) and aggregate re-exports both work.
declare module "@narx/icons-material" {
  import type * as React from "react";
  type IconProps = React.ComponentProps<"svg"> & { fontSize?: "small" | "inherit" | "large" | "medium" };
  export type NarxIcon = React.ForwardRefExoticComponent<IconProps>;
  const icons: { [k: string]: NarxIcon };
  export = icons;
}

declare module "@narx/icons-material/*" {
  import type * as React from "react";
  type IconProps = React.ComponentProps<"svg"> & { fontSize?: "small" | "inherit" | "large" | "medium" };
  const Icon: React.ForwardRefExoticComponent<IconProps>;
  export default Icon;
}

// `XTooltip` is used unqualified in chart bodies as a recharts Tooltip alias.
// Recharts ships its own `Tooltip`, but several call-sites were migrated to
// `XTooltip` (the MUI-style re-export) without an import statement. Map the
// global identifier to recharts so the existing JSX keeps type-checking.
import type { Tooltip as RechartsTooltip } from "recharts";
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicAttributes {
      XTooltip?: typeof RechartsTooltip;
    }
  }
}

export {};
