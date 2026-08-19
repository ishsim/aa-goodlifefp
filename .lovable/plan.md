# Fix: image upload under Recommended Plans fails

## What's happening

The error you see — "Could not add image: Could not read the file" — comes from the fallback path in the upload handler, which means two things failed in a row: the upload to image storage, then reading the file locally.

The likely cause is in the upload handler itself: it clears the file input (`e.target.value = ""`) *before* the file is uploaded or read. In Chromium, resetting the input can invalidate the selected file reference, so the subsequent async upload and the local read both fail on the same file. Storage itself is configured correctly (private `plan-images` bucket with per-advisor policies, verified previously), which is consistent with a client-side file-handle problem rather than a permissions problem.

This diagnosis is inferred from the code path that produces that exact message; the first step of the work is to confirm it in the browser before/after the change.

## Plan

1. Reproduce the failure in the running app (signed in, add a recommended plan, upload an image) and capture the real storage error from the console so the true cause is confirmed, not assumed.
2. In the upload handler (`src/App.jsx`, Recommended Plan card):
   - Snapshot the selected files into an array and only reset the file input *after* all uploads finish.
   - Surface the actual storage error message instead of collapsing everything into a generic message.
3. Fix the multi-file bug in the same handler: each file's `onChange` is built from a stale copy of the plan, so selecting several images keeps only the last one. Accumulate the new image pointers and apply them in one update.
4. Make failures visible rather than silent: if storage upload genuinely fails, keep the existing embed-as-fallback behaviour but include the underlying reason in the toast; also stop `PlanImage` from swallowing signed-URL errors so a broken thumbnail shows a real message instead of a permanent "Loading…".
5. Re-test: upload one image, upload three at once, reload the page and confirm thumbnails and the report preview both render them.

## Scope

Frontend only (`src/App.jsx`). No changes to database schema, storage policies, or any other feature.
