/**
 * exerciseImageLookup.ts
 *
 * Fetches the free-exercise-db dataset (once, then caches it in memory)
 * and exposes utility functions to search exercises and retrieve their
 * full metadata (images, muscles, instructions, level, etc.).
 *
 * Dataset: https://github.com/yuhonas/free-exercise-db (Public Domain)
 * Images:  https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<path>
 */

const EXERCISE_DB_URL =
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
export const IMAGE_BASE_URL =
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export interface ExerciseDbEntry {
    id: string;
    name: string;
    force: string | null;
    level: string;
    mechanic: string | null;
    equipment: string | null;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    instructions: string[];
    category: string;
    images: string[];
}

let cachedDb: ExerciseDbEntry[] | null = null;

/** Load (or return cached) full exercise list from free-exercise-db. */
async function loadExerciseDb(): Promise<ExerciseDbEntry[]> {
    if (cachedDb !== null) return cachedDb;
    try {
        const resp = await fetch(EXERCISE_DB_URL);
        if (!resp.ok) return [];
        cachedDb = await resp.json();
        return cachedDb ?? [];
    } catch {
        return [];
    }
}

/**
 * Search exercises by partial name — useful for autocomplete.
 * Returns up to `limit` results (default 8), ordered by relevance:
 * exact prefix first, then partial matches.
 */
export async function searchExercises(query: string, limit = 8): Promise<ExerciseDbEntry[]> {
    const db = await loadExerciseDb();
    if (!query.trim() || db.length === 0) return [];
    const q = query.toLowerCase().trim();
    const prefixMatches = db.filter((e) => e.name.toLowerCase().startsWith(q));
    const otherMatches = db.filter(
        (e) => !e.name.toLowerCase().startsWith(q) && e.name.toLowerCase().includes(q)
    );
    return [...prefixMatches, ...otherMatches].slice(0, limit);
}

/**
 * Return the full metadata entry for the best-matching exercise name,
 * or null if nothing matches.
 */
export async function findExerciseMetadata(exerciseName: string): Promise<ExerciseDbEntry | null> {
    const db = await loadExerciseDb();
    if (db.length === 0) return null;
    const search = exerciseName.toLowerCase().trim();
    return (
        db.find((e) => e.name.toLowerCase() === search) ??
        db.find((e) => e.name.toLowerCase().includes(search)) ??
        db.find((e) => e.name.length >= 4 && search.includes(e.name.toLowerCase())) ??
        null
    );
}


/**
 * Given an exercise name (any language/variant), return the URL of the
 * first matching image from free-exercise-db, or null if nothing matches.
 *
 * Matching strategy (ordered by specificity):
 *   1. Exact match (case-insensitive)
 *   2. DB entry name contains the search term
 *   3. Search term contains the DB entry name (only if db name is ≥ 4 chars)
 */
export async function findExerciseImageUrl(exerciseName: string): Promise<string | null> {
    const urls = await findExerciseImageUrls(exerciseName);
    return urls.length > 0 ? urls[0] : null;
}

/**
 * Same as findExerciseImageUrl but returns ALL available images for the
 * matched exercise (typically 2: start and end position).
 */
export async function findExerciseImageUrls(exerciseName: string): Promise<string[]> {
    const db = await loadExerciseDb();
    if (db.length === 0) return [];

    const search = exerciseName.toLowerCase().trim();

    // 1. Exact match
    let match = db.find((e) => e.name.toLowerCase() === search);

    // 2. DB name contains search term
    if (!match) {
        match = db.find((e) => e.name.toLowerCase().includes(search));
    }

    // 3. Search term contains DB name (guard against very short names like "ab")
    if (!match) {
        match = db.find(
            (e) => e.name.length >= 4 && search.includes(e.name.toLowerCase())
        );
    }

    if (match && match.images && match.images.length > 0) {
        return match.images.map((img) => `${IMAGE_BASE_URL}${img}`);
    }
    return [];
}
