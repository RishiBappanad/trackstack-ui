/**
 * Shared JWT-then-personal-access-token verification for TrackStack
 * tracker backends (Node/Express). Import from "trackstack-ui/auth-client"
 * -- this subpath has no dependency on React and never touches it, so a
 * backend service can depend on trackstack-ui for just this without
 * installing react/react-dom at all (see package.json's
 * peerDependenciesMeta).
 *
 * This does not replace trackstack-auth (the identity service, the only
 * place JWT issuance and PAT storage/revocation live) -- it's the small,
 * easy-to-get-wrong glue every OTHER tracker's backend needs to answer
 * "is this request's Bearer token valid, and whose account is it?" on
 * every incoming request: verify it as a JWT locally first (fast, no
 * network call, using the shared secret), and only fall back to calling
 * trackstack-auth's own POST /tokens/verify if that fails -- so a PAT
 * still works, without the common case (a real login JWT) paying for a
 * network round trip.
 *
 * Behavior here must match the Python equivalent (the
 * trackstack-auth-client PyPI package) exactly -- see
 * CONTRACT_FIXTURE.json at this repo's root, which both implementations'
 * test suites are run against.
 */
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface VerifiedAccount {
  accountId: number;
  email: string;
}

export interface VerifyOptions {
  /** The shared secret trackstack-auth signs JWTs with. */
  jwtSecret: string;
  /**
   * trackstack-auth's real backend URL (not a gateway-relative path) --
   * required for personal-access-token support. If omitted, tokens that
   * aren't valid JWTs are simply rejected, matching the behavior before
   * PAT support existed at all.
   */
  trackstackAuthUrl?: string;
  /** Milliseconds before giving up on the PAT-verify call. Default 5000. */
  timeoutMs?: number;
}

async function verifyPersonalAccessToken(token: string, trackstackAuthUrl: string, timeoutMs: number): Promise<VerifiedAccount | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: globalThis.Response;
    try {
      res = await fetch(`${trackstackAuthUrl}/tokens/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { account?: { accountId?: number; email?: string } };
    if (!data.account || data.account.accountId == null || !data.account.email) return null;
    return { accountId: data.account.accountId, email: data.account.email };
  } catch {
    return null;
  }
}

/**
 * Verify a Bearer token as either a trackstack-auth JWT or (if
 * `trackstackAuthUrl` is provided) a personal access token. Returns null
 * for anything invalid -- never throws for a bad token, only for a
 * programmer error (e.g. missing jwtSecret).
 */
export async function verifyTrackstackToken(token: string, opts: VerifyOptions): Promise<VerifiedAccount | null> {
  try {
    const payload = jwt.verify(token, opts.jwtSecret) as { accountId?: number; email?: string };
    if (payload.accountId != null && payload.email) {
      return { accountId: payload.accountId, email: payload.email };
    }
  } catch {
    // Not a valid JWT -- fall through and try it as a PAT below.
  }

  if (!opts.trackstackAuthUrl) return null;
  return verifyPersonalAccessToken(token, opts.trackstackAuthUrl, opts.timeoutMs ?? 5000);
}

/**
 * Express middleware factory. Attaches the verified account to
 * `req.account` and calls `onAuthenticated` (if provided, e.g. to
 * ensure a local mirror-user row exists) before calling `next()`.
 *
 * Deliberately does NOT try to normalize what property name the account
 * lands on (`req.account` vs. an existing convention like `req.user`) --
 * each tracker's existing route handlers already read a specific
 * property name, and forcing a rename everywhere is a bigger migration
 * than adopting this package should require. Wrap this if you need a
 * different property name:
 *
 *   const inner = createRequireAuth(opts);
 *   app.use((req, res, next) => inner(req, res, () => {
 *     (req as any).user = (req as any).account;
 *     next();
 *   }));
 */
export function createRequireAuth(
  opts: VerifyOptions & { onAuthenticated?: (account: VerifiedAccount) => Promise<void> },
) {
  return async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const token = header.slice(7);
    const account = await verifyTrackstackToken(token, opts);
    if (!account) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    (req as Request & { account?: VerifiedAccount }).account = account;
    try {
      if (opts.onAuthenticated) await opts.onAuthenticated(account);
      next();
    } catch (err) {
      next(err);
    }
  };
}
