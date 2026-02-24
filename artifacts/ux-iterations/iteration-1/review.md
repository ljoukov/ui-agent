# Iteration 1 - Sub-agent UX Review (Apple HIG)

## Top issues by severity

1. Critical: Legibility + accessibility
- Text is too small and low-contrast in multiple areas (metadata chips, status text, dense card copy), increasing reading effort.

2. Critical: Touch targets
- Buttons/chips appear below 44x44pt minimum and are tightly grouped, especially on mobile.

3. High: Weak visual hierarchy + high cognitive load
- Cards have similar visual weight, so the primary task flow is unclear.

4. High: Feedback is easy to miss
- Success/status messages are small and placed low; disabled controls do not explain why.

5. Medium: Error prevention/recovery gaps
- Reset is destructive without confirmation; limited guardrails before running actions.

6. Medium: Consistency
- Primary vs secondary actions and enabled/disabled states are not distinct enough.

## Prioritized improvements for next iteration

1. Increase font sizes and contrast (body 16-17px, secondary 14-15px, contrast >= 4.5:1).
2. Reorganize into clear 3-step flow: Problem/Prompt -> Attempt -> Guidance.
3. Enforce 44pt+ control heights and spacing between tappable items.
4. Move status/error feedback close to the action row.
5. Move filesystem map into collapsible developer details.
6. Add recovery guardrails (confirm reset, protect against empty run).

## Mobile quick wins

1. Full-width 44pt+ action buttons.
2. Accordions for long sections to reduce scroll fatigue.
3. Larger padding/spacing.
4. Sticky bottom primary action.
5. Auto-scroll to new guidance.
