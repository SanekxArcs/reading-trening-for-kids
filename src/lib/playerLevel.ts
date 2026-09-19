const KEY = "read_master_level";

/**
 * The child's own level, which only ever goes up.
 *
 * Separate from `ReadingSettings.level` and not the same idea at all: that one
 * is how well they read and it belongs to the parent, this one is how many
 * points a round plays for and it belongs to the child. Conflating them would
 * mean a good evening made the texts harder, which is the one thing a
 * progression must never do.
 *
 * Never goes down. A bad round is a bad round; taking a level away for it turns
 * a game into a punishment.
 */
export function readPlayerLevel(): number {
  try {
    const raw = Number.parseInt(localStorage.getItem(KEY) ?? "1", 10);
    return Number.isInteger(raw) && raw >= 1 ? raw : 1;
  } catch {
    return 1;
  }
}

export function raisePlayerLevel(): number {
  const next = readPlayerLevel() + 1;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // Private mode: the level just will not survive a reload.
  }
  return next;
}
