# Fix the blank pause on the homepage

## What I found

The homepage is not broken — it is blank for a few seconds while it works, and shows nothing at all during that wait.

Checks run just now:
- The page itself loads fine (server responds normally, no build errors).
- The sign-in service answers in well under a second and your saved sign-in is valid.
- In a signed-out test browser, the homepage correctly sends you to the sign-in screen.
- In your open preview, the page was completely empty at first and then, moments later, showed the full "Recommendation Report Studio" with your client list.

The cause: the homepage waits for the sign-in check to finish before it draws anything, and inside the preview that check can take a couple of extra seconds. There is no loading screen for that gap, so the app looks dead. After it passes, the client list is fetched, which adds another pause.

## What to change

1. Show a branded loading screen while the sign-in check runs, instead of an empty page.
2. Keep the same behaviour afterwards: signed in goes to the studio, signed out goes to the sign-in screen.
3. If the sign-in check takes unusually long or fails, fall back to the sign-in screen rather than hanging.

No changes to any features, data, or the report itself.

## Technical notes

- `src/routes/_authenticated/route.tsx` has `ssr: false` plus an async `beforeLoad` calling `supabase.auth.getUser()`, and no `pendingComponent`, so nothing renders during the gate. Add a `pendingComponent` (and `pendingMs: 0`) rendering a simple spinner/logo screen, plus an `errorComponent` that redirects to `/auth`.
- Add a timeout race around `getUser()` (about 5s) so a silent preview auth broker cannot leave the route pending indefinitely; on timeout, redirect to `/auth`.
- Optionally give the client-list fetch in `src/App.jsx` the same spinner treatment so the two waits look like one continuous load.
