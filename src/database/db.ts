import * as SQLite from 'expo-sqlite';


let db: SQLite.SQLiteDatabase | null = null;

// 1. Apri (o crea se non esiste) il file di database locale sullo smartphone
export const getDb = async () => {
  if (db === null) db = await SQLite.openDatabaseAsync('gymai.db');
  return db;
};

// 2. Inizializza le tabelle all'avvio dell'app
export const initDatabase = async () => {
  const db = await getDb();

  // Schema base (incluso workout_groups per le nuove installazioni)
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS workout_groups (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#2563EB'
    );

    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_ai_generated INTEGER DEFAULT 0,
      group_id TEXT REFERENCES workout_groups(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workout_exercises (
      id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      exercise_name TEXT NOT NULL,
      equipment TEXT,
      target_sets INTEGER,
      target_reps TEXT,
      rest_seconds INTEGER,
      order_index INTEGER,
      FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY NOT NULL,
      workout_id TEXT NOT NULL,
      duration_minutes INTEGER,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS set_logs (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      reps_completed INTEGER NOT NULL,
      weight_kg REAL NOT NULL
    );
  `);

  // Migrazione v1: aggiunge workout_groups e group_id a workouts su DB esistenti
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const dbVersion = versionRow?.user_version ?? 0;

  if (dbVersion < 1) {
    try {
      await db.execAsync(
        `ALTER TABLE workouts ADD COLUMN group_id TEXT REFERENCES workout_groups(id) ON DELETE SET NULL;`
      );
    } catch {
      // La colonna esiste già (installazione nuova) — ignorabile
    }
    await db.runAsync('PRAGMA user_version = 1;');
  }
};

// 3. Esempio di Query per Inserire una Scheda (INSERT)
export const insertWorkout = async (
  id: string,
  title: string,
  description: string,
  isAiGenerated: boolean
) => {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO workouts (id, title, description, is_ai_generated) VALUES (?, ?, ?, ?);`,
    [id, title, description, isAiGenerated ? 1 : 0]
  );
};

// 4. Esempio di Query per Leggere le Schede (SELECT)
export const getWorkouts = async () => {
  const db = await getDb();
  const allRows = await db.getAllAsync(`SELECT * FROM workouts ORDER BY created_at DESC;`);
  return allRows;
};