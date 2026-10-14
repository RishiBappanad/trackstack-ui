/** One entry from trackstack-auth's GET /apps registry. */
export interface TrackStackApp {
  id: string;
  label: string;
  icon: string;
  href: string;
}

/** Shape of trackstack-auth's GET /me response. Both theme fields null
 * means "use whichever app's own hardcoded default" -- see
 * trackstack-ui/app's theme.ts for Home's own default/derivation (the
 * only app that reads this today; others can adopt the same fields
 * later without any change here or on trackstack-auth). */
export interface TrackStackAccount {
  id: number;
  email: string;
  name: string | null;
  theme: { hue: number | null; backgroundLightness: number | null };
}
