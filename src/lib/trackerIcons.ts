import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, Book, BookOpen, Calendar, Camera, Clipboard, Coffee,
  Dumbbell, Flame, Gauge, Heart, LayoutDashboard, ListChecks, Moon, Music,
  PiggyBank, Plane, Salad, Smile, Star, Sun, Target, Timer,
  TrendingUp, Trophy, Utensils, Wallet, Zap,
} from "lucide-react";

/**
 * The fixed, curated icon-name list a custom tracker can pin itself to
 * the sidebar with (see usePinnedTrackers.ts). Lives in the shared
 * library -- not just Home's own tracker-builder pages -- because any
 * TrackStack app's AppSwitcher needs to resolve these same names to
 * render a pinned tracker's icon, not only the app that built it.
 *
 * Mirrors trackstack-custom's own ICON_NAMES exactly (duplicated, not
 * imported -- CLAUDE.md Tenet #1: the backend has no UI dependency).
 * Keep both in sync if this list ever changes.
 */
export const ICON_NAMES = [
  "Activity", "BarChart3", "Book", "BookOpen", "Calendar", "Camera", "Clipboard", "Coffee",
  "Dumbbell", "Flame", "Gauge", "Heart", "LayoutDashboard", "ListChecks", "Moon", "Music",
  "PiggyBank", "Plane", "Salad", "Smile", "Star", "Sun", "Target", "Timer",
  "TrendingUp", "Trophy", "Utensils", "Wallet", "Zap",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const ICON_COMPONENTS: Record<IconName, LucideIcon> = {
  Activity, BarChart3, Book, BookOpen, Calendar, Camera, Clipboard, Coffee,
  Dumbbell, Flame, Gauge, Heart, LayoutDashboard, ListChecks, Moon, Music,
  PiggyBank, Plane, Salad, Smile, Star, Sun, Target, Timer,
  TrendingUp, Trophy, Utensils, Wallet, Zap,
};
