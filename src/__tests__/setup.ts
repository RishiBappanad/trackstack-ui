import "@testing-library/jest-dom/vitest";

// This vitest/jsdom combination doesn't reliably wire up
// window.localStorage even with environmentOptions.jsdom.url set (jsdom
// itself supports it fine when constructed directly -- confirmed via a
// standalone repro -- so this is specific to how vitest's jsdom pool
// initializes the window). A minimal in-memory polyfill is simpler and
// more deterministic than chasing the exact vitest/jsdom version
// interaction further.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
    writable: true,
  });
}
