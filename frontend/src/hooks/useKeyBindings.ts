import { useEffect, useRef } from "react";

type KeyHandler = (e: KeyboardEvent) => void;
type Binding = KeyHandler | { down?: KeyHandler; up?: KeyHandler };

type HookOptions = {
  target?: EventTarget | null;
  ignoreInputs?: boolean; // default true
  preventDefault?: boolean; // default true
  allowRepeat?: boolean; // default false
};

function parseCombo(combo: string) {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const modifiers = new Set(parts);
  const key = parts.find(
    (p) =>
      ![
        "ctrl",
        "control",
        "meta",
        "cmd",
        "win",
        "shift",
        "alt",
        "option",
      ].includes(p),
  );

  return {
    raw: combo,
    ctrl: modifiers.has("ctrl") || modifiers.has("control"),
    meta: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("win"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt") || modifiers.has("option"),
    key: key ?? null,
  } as const;
}

/** small alias map for common names */
const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  escape: "escape",
  spacebar: " ",
  space: " ",
  enter: "enter",
  return: "enter",
  del: "delete",
  delete: "delete",
  plus: "+",
  // arrows
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
};

function normalizeKeyName(name: string | null) {
  if (!name) return null;
  const n = name.toLowerCase();
  return KEY_ALIASES[n] ?? n;
}

/** canonical signature: "c:0|m:1|s:0|a:0|k:escape" or k: (empty) for modifier-only */
function signatureFromParsed(p: ReturnType<typeof parseCombo>) {
  const k = normalizeKeyName(p.key);
  return `c:${p.ctrl ? 1 : 0}|m:${p.meta ? 1 : 0}|s:${p.shift ? 1 : 0}|a:${
    p.alt ? 1 : 0
  }|k:${k ?? ""}`;
}

function signatureFromEvent(e: KeyboardEvent) {
  const ctrl = e.ctrlKey ? 1 : 0;
  const meta = e.metaKey ? 1 : 0;
  const shift = e.shiftKey ? 1 : 0;
  const alt = e.altKey ? 1 : 0;

  // prefer e.key for user-friendly matching; normalize common names
  const rawKey = (e.key ?? "").toLowerCase();
  let k: string | null = null;
  if (rawKey === " " || rawKey === "spacebar") k = " ";
  else if (rawKey === "escape" || rawKey === "esc") k = "escape";
  else if (rawKey) k = KEY_ALIASES[rawKey] ?? rawKey;

  const exact = `c:${ctrl}|m:${meta}|s:${shift}|a:${alt}|k:${k ?? ""}`;
  const modifiersOnly = `c:${ctrl}|m:${meta}|s:${shift}|a:${alt}|k:`; // empty key part
  return { exact, modifiersOnly };
}

function isTypingTarget(target: EventTarget | null) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute?.("role");
  if (role === "textbox") return true;
  return false;
}

export default function useKeyBindings(
  bindings: Record<string, Binding>,
  options?: HookOptions,
) {
  const {
    target = typeof window !== "undefined" ? window : null,
    ignoreInputs = true,
    preventDefault = true,
    allowRepeat = false,
  } = options ?? {};

  // keep latest bindings
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  // build lookup maps every render and store in refs so effect handlers see latest maps
  type Entry = { raw: string; binding: Binding };
  const downMapRef = useRef<Map<string, Entry[]>>(new Map());
  const upMapRef = useRef<Map<string, Entry[]>>(new Map());

  // rebuild maps from bindings
  const downMap = new Map<string, Entry[]>();
  const upMap = new Map<string, Entry[]>();
  for (const raw of Object.keys(bindings)) {
    const parsed = parseCombo(raw);
    const sig = signatureFromParsed(parsed);
    const entry: Entry = { raw, binding: bindings[raw] };

    const b = bindings[raw];
    if (typeof b === "function") {
      // function -> 'down' handler
      const list = downMap.get(sig) ?? [];
      list.push(entry);
      downMap.set(sig, list);
    } else if (typeof b === "object") {
      if (b.down) {
        const list = downMap.get(sig) ?? [];
        list.push(entry);
        downMap.set(sig, list);
      }
      if (b.up) {
        const list = upMap.get(sig) ?? [];
        list.push(entry);
        upMap.set(sig, list);
      }
    }
  }
  // write into refs (cheap assignment)
  downMapRef.current = downMap;
  upMapRef.current = upMap;

  useEffect(() => {
    if (!target) return;

    // const runMapHandlers = (e: KeyboardEvent, map: Map<string, Entry[]>) => {
    //   // ignore typing targets
    //   if (ignoreInputs) {
    //     const targ = e.target && (e.target as HTMLElement);
    //     if (targ && isTypingTarget(targ)) return false;
    //   }

    //   if (!allowRepeat && e.repeat) return false;

    //   const { exact, modifiersOnly } = signatureFromEvent(e);

    //   // 1) exact signature (key + modifiers) match
    //   let bucket = map.get(exact);
    //   if (bucket && bucket.length) {
    //     const entry = bucket[0]; // follow original semantics: first match wins
    //     const binding = entry.binding;
    //     let fn: KeyHandler | undefined;
    //     if (typeof binding === "function") fn = binding;
    //     else if (typeof binding === "object") {
    //       // in down map we only stored entries that have down, in up map only up
    //       fn =
    //         (binding as { down?: KeyHandler; up?: KeyHandler }).down ??
    //         undefined;
    //     }
    //     // pick correct key for map type: for the downMap we'll call down handlers; for upMap the listener will use up handlers.
    //     if (fn) {
    //       if (preventDefault) e.preventDefault();
    //       try {
    //         fn(e);
    //       } catch (err) {
    //         console.error("Key handler error", err);
    //       }
    //       return true;
    //     }
    //   }

    //   // 2) modifier-only signature (bindings that had no 'key' part)
    //   bucket = map.get(modifiersOnly);
    //   if (bucket && bucket.length) {
    //     const entry = bucket[0];
    //     const binding = entry.binding;
    //     let fn: KeyHandler | undefined;
    //     if (typeof binding === "function") {
    //       // functions are treated as 'down' handlers in our design; only relevant when this is the downMap
    //       fn = binding;
    //     } else if (typeof binding === "object") {
    //       fn =
    //         (binding as { down?: KeyHandler; up?: KeyHandler }).down ??
    //         undefined;
    //     }
    //     if (fn) {
    //       if (preventDefault) e.preventDefault();
    //       try {
    //         fn(e);
    //       } catch (err) {
    //         console.error("Key handler error", err);
    //       }
    //       return true;
    //     }
    //   }

    //   return false;
    // };

    const onKeyDown = (evt: Event) => {
      const e = evt as KeyboardEvent;

      // run downMapRef -> note these entries were created as 'down' entries
      const map = downMapRef.current;
      // For down map, the entry.binding might be a function (treated as down) or object with .down
      // We need to run function or .down.
      // Slightly adapt runMapHandlers: here we need to extract 'down' from object entries.
      // We'll implement inline for correctness:

      if (ignoreInputs) {
        const targ = e.target && (e.target as HTMLElement);
        if (targ && isTypingTarget(targ)) return;
      }
      if (!allowRepeat && e.repeat) return;

      const { exact, modifiersOnly } = signatureFromEvent(e);

      let bucket = map.get(exact);
      if (bucket && bucket.length) {
        const entry = bucket[0];
        const binding = entry.binding;
        let fn: KeyHandler | undefined;
        if (typeof binding === "function") fn = binding;
        else if (typeof binding === "object") fn = binding.down;
        if (fn) {
          if (preventDefault) e.preventDefault();
          try {
            fn(e);
          } catch (err) {
            console.error("Key handler error", err);
          }
          return;
        }
      }

      bucket = map.get(modifiersOnly);
      if (bucket && bucket.length) {
        const entry = bucket[0];
        const binding = entry.binding;
        let fn: KeyHandler | undefined;
        if (typeof binding === "function") fn = binding;
        else if (typeof binding === "object") fn = binding.down;
        if (fn) {
          if (preventDefault) e.preventDefault();
          try {
            fn(e);
          } catch (err) {
            console.error("Key handler error", err);
          }
          return;
        }
      }
    };

    const onKeyUp = (evt: Event) => {
      const e = evt as KeyboardEvent;
      if (ignoreInputs) {
        const targ = e.target && (e.target as HTMLElement);
        if (targ && isTypingTarget(targ)) return;
      }

      const map = upMapRef.current;
      const { exact, modifiersOnly } = signatureFromEvent(e);

      let bucket = map.get(exact);
      if (bucket && bucket.length) {
        const entry = bucket[0];
        const binding = entry.binding;
        let fn: KeyHandler | undefined;
        if (typeof binding === "object") fn = binding.up;
        // bindings that were provided as plain functions were only registered to downMap, not upMap
        if (fn) {
          if (preventDefault) e.preventDefault();
          try {
            fn(e);
          } catch (err) {
            console.error("Key handler error", err);
          }
          return;
        }
      }

      bucket = map.get(modifiersOnly);
      if (bucket && bucket.length) {
        const entry = bucket[0];
        const binding = entry.binding;
        let fn: KeyHandler | undefined;
        if (typeof binding === "object") fn = binding.up;
        if (fn) {
          if (preventDefault) e.preventDefault();
          try {
            fn(e);
          } catch (err) {
            console.error("Key handler error", err);
          }
          return;
        }
      }
    };

    (target as EventTarget).addEventListener(
      "keydown",
      onKeyDown as EventListener,
      { passive: false },
    );
    (target as EventTarget).addEventListener("keyup", onKeyUp as EventListener);

    return () => {
      (target as EventTarget).removeEventListener(
        "keydown",
        onKeyDown as EventListener,
      );
      (target as EventTarget).removeEventListener(
        "keyup",
        onKeyUp as EventListener,
      );
    };
  }, [target, ignoreInputs, preventDefault, allowRepeat]);
}
