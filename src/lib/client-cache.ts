// What the browser has already read, kept until the page is reloaded (signing out reloads it).
// A screen opened again shows this at once and reads anew behind it, instead of starting empty.
// Keys carry the user when the answer is theirs alone: a tab can outlive a session.
const store = new Map<string, unknown>();

export function cached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function remember<T>(key: string, value: T): T {
  store.set(key, value);
  return value;
}
