// Adding a new component or hook: export it here. Nothing else needs
// to change for a consuming app to pick it up (see the README's
// "Adding to this library" section).
export { AppSwitcher, MobileAppSwitcher } from "./components/AppSwitcher.js";
export type { AppSwitcherProps } from "./components/AppSwitcher.js";

export { ProfileCard } from "./components/ProfileCard.js";
export type { ProfileCardProps } from "./components/ProfileCard.js";

export { useAppRegistry } from "./hooks/useAppRegistry.js";
export { useTrackStackAuth } from "./hooks/useTrackStackAuth.js";
export type {
  UseTrackStackAuthOptions,
  UseTrackStackAuthResult,
} from "./hooks/useTrackStackAuth.js";
export { useCurrentUser } from "./hooks/useCurrentUser.js";
export type { UseCurrentUserResult } from "./hooks/useCurrentUser.js";

export { cn } from "./lib/cn.js";

export type { TrackStackApp, TrackStackAccount } from "./types.js";
