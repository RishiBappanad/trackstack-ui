/** One entry from trackstack-auth's GET /apps registry. */
export interface TrackStackApp {
  id: string;
  label: string;
  icon: string;
  href: string;
}

/** Shape of trackstack-auth's GET /me response. */
export interface TrackStackAccount {
  id: number;
  email: string;
  name: string | null;
}
