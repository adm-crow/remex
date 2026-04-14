# Spec K — Keyboard Shortcuts

**Date:** 2026-04-14
**Status:** Approved

---

## Summary

Add keyboard shortcuts to Remex Studio for pane navigation, search focus, and clearing the query input. All global shortcuts are handled by a new `useKeyboardShortcuts` hook registered in `AppShell`. The `Escape` key is handled locally inside `QueryPane`.

---

## Shortcut Map

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+Q` | Switch to Query pane |
| `Ctrl+Shift+I` | Switch to Ingest pane |
| `Ctrl+Shift+C` | Switch to Collections pane |
| `Ctrl+Shift+S` | Switch to Settings pane |
| `Ctrl+K` | Switch to Query pane + focus search input |
| `Escape` | Clear text input + dismiss results (QueryPane only) |
| `Enter` | Submit search (already works via native form) |

---

## Architecture

### Hook — `useKeyboardShortcuts`

New file: `studio/src/hooks/useKeyboardShortcuts.ts`

```typescript
interface UseKeyboardShortcutsOptions {
  onViewChange: (v: View) => void;
  focusSearch: () => void;
}
```

Registers a single `keydown` listener on `window` via `useEffect`. On unmount, removes the listener. Handles:

- `Ctrl+Shift+Q/I/C/S` → calls `onViewChange` with the matching view
- `Ctrl+K` → calls `onViewChange("query")` then `focusSearch()`

The `Ctrl+Shift+*` shortcuts fire unconditionally — `Ctrl+Shift+letter` does not conflict with normal text entry. `Ctrl+K` also fires unconditionally since it is a global command shortcut, not a text character.

### `AppShell` changes

- Add `focusSearchRef = useRef<(() => void) | null>(null)`
- Call `useKeyboardShortcuts({ onViewChange: setActiveView, focusSearch: () => focusSearchRef.current?.() })`
- Pass `onFocusReady={(fn) => { focusSearchRef.current = fn; }}` prop to `QueryPane`

### `QueryPane` changes

- Accept new optional prop: `onFocusReady?: (fn: () => void) => void`
- Add `inputRef = useRef<HTMLInputElement>(null)` and attach to the `<Input>` element via `ref`
- On mount: call `onFocusReady?.(() => inputRef.current?.focus())`
- Add `onKeyDown` to the `<Input>`: on `Escape`, set `text("")` and `setSubmitted("")`

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/hooks/useKeyboardShortcuts.ts` | Create |
| `studio/src/hooks/useKeyboardShortcuts.test.ts` | Create |
| `studio/src/components/layout/AppShell.tsx` | Modify |
| `studio/src/components/query/QueryPane.tsx` | Modify |
| `studio/src/components/query/QueryPane.test.tsx` | Modify — add Escape test |

---

## Testing

### `useKeyboardShortcuts` tests

Render the hook via `renderHook` with mock callbacks. Fire synthetic `KeyboardEvent` on `window` for each shortcut. Assert the correct callback is called with the correct argument.

```typescript
it("Ctrl+Shift+Q calls onViewChange('query')")
it("Ctrl+Shift+I calls onViewChange('ingest')")
it("Ctrl+Shift+C calls onViewChange('collections')")
it("Ctrl+Shift+S calls onViewChange('settings')")
it("Ctrl+K calls onViewChange('query') and focusSearch()")
it("unrelated keys do not call any callback")
```

### `QueryPane` Escape test

```typescript
it("Escape clears the input and dismisses results")
// type a query, submit it, fire Escape on the input,
// assert input value is "" and idle empty state is shown
```

---

## Out of Scope

- A visible keyboard shortcut cheat-sheet / help overlay
- Mac `Cmd+` variants (Tauri maps `Ctrl` consistently on all platforms for global shortcuts)
- Shortcuts for settings fields, ingest controls, or collections panel
