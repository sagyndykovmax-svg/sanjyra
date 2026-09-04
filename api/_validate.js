// Shared shape-check for a tree's `state` before it's written. The only
// client today is this same app's own render() pipeline, which always
// produces a well-formed shape — but the API is public, so a malformed
// payload (people as an array, an entry missing a name, a person object
// whose own id doesn't match its key) shouldn't get accepted just because
// it's technically valid JSON under the byte cap. Deliberately loose
// beyond that: new optional fields (manualX, birth, note, ...) must keep
// working without this file needing to know about each one.
export function isValidTreeState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  if (typeof state.title !== "string") return false;
  const people = state.people;
  if (!people || typeof people !== "object" || Array.isArray(people)) return false;
  for (const id of Object.keys(people)) {
    const p = people[id];
    if (!p || typeof p !== "object" || Array.isArray(p)) return false;
    if (typeof p.name !== "string") return false;
    if (p.id !== id) return false;
  }
  return true;
}
