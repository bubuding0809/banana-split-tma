import emojilib from "emojilib";
import { BASE_CATEGORIES } from "@repo/categories";

/**
 * Synchronous emoji-for-title lookup. No LLM, no network. Matches the typed
 * category title against:
 *
 *   1. BASE_CATEGORIES keywords (curated for expense contexts — e.g. "biryani"
 *      lives under the Food base, "bali" under Travel). If any title token
 *      hits one of those keywords, we return that category's canonical emoji.
 *   2. emojilib's Unicode CLDR keyword index (~1500 emojis × ~5 keywords
 *      each). We build an inverted index once at module load and score
 *      candidates by how many title tokens hit their keywords.
 *
 * Returns `null` when nothing matches with acceptable confidence so the UI
 * can leave whatever emoji is already in place.
 */

// ------- Tokenization --------------------------------------------------

// Strip the token vocabulary down to meaningful words. 1-char tokens like "a"
// cause far too many spurious matches (emojilib has entries for every letter).
function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// ------- Emojilib inverted index ----------------------------------------

// A large slice of emojilib is smileys / hands / flags we never want to
// suggest for a spending category (Food beats 😋 even though both tag
// "food"). Exclude every emoji whose canonical name contains any of these
// words. The first keyword in emojilib is the canonical slug.
const EXCLUDED_NAME_FRAGMENTS = [
  "face",
  "person",
  "man",
  "woman",
  "people",
  "hand",
  "finger",
  "flag",
  "skin_tone",
  "mouth",
  "eye",
  "heart_on",
];

function isUsableEmoji(keywords: string[] | undefined): boolean {
  if (!keywords || keywords.length === 0) return false;
  const canonical = keywords[0]; // first entry is the slug like "grinning_face"
  return !EXCLUDED_NAME_FRAGMENTS.some((frag) => canonical.includes(frag));
}

// Inverted index: keyword → list of {emoji, keywordCount}. Built lazily so
// we don't pay for the walk until the first lookup.
type IndexEntry = { emoji: string; keywordCount: number };
let invertedIndex: Map<string, IndexEntry[]> | null = null;

function buildIndex(): Map<string, IndexEntry[]> {
  const index = new Map<string, IndexEntry[]>();
  const lib = emojilib as Record<string, string[]>;
  for (const [emoji, keywords] of Object.entries(lib)) {
    if (!isUsableEmoji(keywords)) continue;
    const entry: IndexEntry = { emoji, keywordCount: keywords.length };
    for (const kw of keywords) {
      const key = kw.toLowerCase();
      const bucket = index.get(key);
      if (bucket) bucket.push(entry);
      else index.set(key, [entry]);
    }
  }
  return index;
}

function getIndex(): Map<string, IndexEntry[]> {
  if (!invertedIndex) invertedIndex = buildIndex();
  return invertedIndex;
}

// ------- BASE_CATEGORIES quick path -------------------------------------

function matchBaseCategory(tokens: string[]): string | null {
  for (const cat of BASE_CATEGORIES) {
    const kwSet = new Set([
      cat.title.toLowerCase(),
      ...cat.keywords.map((k) => k.toLowerCase()),
    ]);
    if (tokens.some((t) => kwSet.has(t))) {
      return cat.emoji;
    }
  }
  return null;
}

// ------- Public API -----------------------------------------------------

export function suggestEmojiForTitle(title: string): string | null {
  const tokens = tokenize(title);
  if (tokens.length === 0) return null;

  // 1. Curated BASE_CATEGORIES keywords — strong signal for expense contexts.
  const baseHit = matchBaseCategory(tokens);
  if (baseHit) return baseHit;

  // 2. emojilib inverted index. Score each candidate by (a) how many of the
  //    title's tokens hit its keywords, and (b) tie-break by specificity
  //    (fewer total keywords == more specific emoji).
  const index = getIndex();
  const scores = new Map<string, { hits: number; keywordCount: number }>();
  for (const token of tokens) {
    const bucket = index.get(token);
    if (!bucket) continue;
    for (const { emoji, keywordCount } of bucket) {
      const prev = scores.get(emoji);
      if (prev) {
        prev.hits += 1;
      } else {
        scores.set(emoji, { hits: 1, keywordCount });
      }
    }
  }

  if (scores.size === 0) return null;

  let best: { emoji: string; hits: number; keywordCount: number } | null = null;
  for (const [emoji, { hits, keywordCount }] of scores) {
    if (
      !best ||
      hits > best.hits ||
      (hits === best.hits && keywordCount < best.keywordCount)
    ) {
      best = { emoji, hits, keywordCount };
    }
  }
  return best?.emoji ?? null;
}
