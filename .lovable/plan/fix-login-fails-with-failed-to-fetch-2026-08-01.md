# Fix: login fails with "Failed to fetch"

## What's actually wrong

This is not an app-code bug. Your login code is fine — the backend itself is not answering.

Verified just now from outside the browser:

- Auth sign-in endpoint: times out (gateway reports the backend origin never completed the request)
- Database REST endpoint: same timeout
- Backend metrics: request timed out entirely

The status check reports the backend as "up", but every real request to it times out. That mismatch — reported healthy, actually unreachable — is what makes the browser show `TypeError: Failed to fetch` on the sign-in and token-refresh calls. So yes: the "Cloud instance needs attention" notice and your login failure are the same problem.

## Plan

1. Restart the backend instance (requires your approval when I run it). This is the standard recovery for an instance that reports healthy but stops completing requests.
2. Poll the backend status until it reports healthy again, then re-test the auth and database endpoints directly to confirm they return real responses instead of timeouts.
3. Have you retry sign-in in the preview and confirm it works.
4. If the endpoints still time out after the restart, report that back rather than patching around it — at that point it needs platform support, not a code change.

## What I will not change

No changes to `src/routes/auth.tsx`, the backend client, auth middleware, or any feature code. Nothing in the app needs editing for this, and edits would only obscure the real cause.

## Note on the repeated errors in your logs

The console shows a token-refresh call retrying every 20 seconds and failing each time. That's the client trying to renew an expired session against the unreachable backend — it will stop on its own once the backend responds again.
