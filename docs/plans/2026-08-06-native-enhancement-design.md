# Native Enhancement Design

## Goal

Make Native Insert Block discoverable, safe, and cross-platform without turning it into a persistent toolbar. Keep the existing one-control interaction and Roam's Blueprint visual language.

## Interaction

The active block keeps one minimal Blueprint button. A normal click inserts below. A Blueprint Tooltip appears after 400 ms and lists every modifier action in the current platform's notation.

Right-click opens a compact Blueprint-styled menu with Insert Above, Insert Below, Insert Child, Wrap in Parent, and Delete Block. Delete is separated and uses Blueprint danger color. Holding a modifier changes the trigger icon before activation so the pending action is visible.

macOS keeps the existing Command, Option, Control, and Shift mapping. Windows and Linux use Control for child, Alt for above, Control+Alt for parent, and Shift for delete.

## Structure

Action resolution is one deep module inside the extension: an input event and platform map to one action. Pointer modifiers, menu items, icon previews, labels, and tests all consume the same action vocabulary. Roam mutations remain behind the existing click interaction seam.

The menu is a short-lived portal attached to `document.body` so block overflow cannot clip it. Opening another block, scrolling, pressing Escape, executing an action, or unloading the extension removes it.

## Error handling

The reliability behavior in the current Draft remains unchanged: writes are awaited, failed wrapping rolls back only a confirmed-empty parent, collapsed parents expand before child focus, and delayed focus work is canceled during unload.

## Testing

Tests observe the rendered trigger and menu, then invoke public user interactions and assert Roam API effects. Coverage includes accessible labels, platform text and mapping, modifier icon previews, five menu entries, danger treatment, outside/Escape cleanup, and unload cleanup.

## Non-goals

This version does not add templates, duplicate/split/move workflows, persistent toolbars, custom themes, or a settings panel.
