# Iteration 4 Notes

## What changed
- Strengthened contrast and typography scale further.
- Added button-level loading affordance for the primary action.
- Added safer reset pattern with two-step arming/confirm behavior.
- Tuned disabled-state colors for better action-state recognition.
- Preserved consistent interaction order across desktop and mobile.

## Why
- Close out HIG gaps from iteration 3 around consistency, safety, and accessibility readability.

## What improved
- Primary flow and action-state communication feel more deterministic.
- Destructive action is significantly harder to trigger accidentally.
- Mobile and desktop task order are now aligned.

## What still needs work
- State-machine edge cases can still show conflicting progress vs completion messages.
- Additional accessibility hardening is needed for production-level compliance.
- Explicit retry/timeout UX should be added for robustness.
