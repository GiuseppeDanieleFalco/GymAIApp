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
      image_url TEXT,
      primary_muscles TEXT,
      secondary_muscles TEXT,
      force TEXT,
      mechanic TEXT,
      category TEXT,
      level TEXT,
      exercise_db_id TEXT,
      instructions TEXT,
      images TEXT,
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
      weight_kg REAL NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      primary_muscles TEXT,
      secondary_muscles TEXT
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      targetMuscle TEXT,
      tips TEXT,
      videoUrl TEXT NOT NULL,
      thumbnailUrl TEXT,
      isAiGenerated INTEGER DEFAULT 0
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

  // Migrazione v2: aggiunge image_url a workout_exercises
  if (dbVersion < 2) {
    try {
      await db.execAsync(
        `ALTER TABLE workout_exercises ADD COLUMN image_url TEXT;`
      );
    } catch {
      // La colonna esiste già
    }
    await db.runAsync('PRAGMA user_version = 2;');
  }

  // Migrazione v3: aggiunge colonne metadati esercizio (muscoli, forza, categoria, livello)
  if (dbVersion < 3) {
    const metaCols = [
      'primary_muscles TEXT',
      'secondary_muscles TEXT',
      'force TEXT',
      'mechanic TEXT',
      'category TEXT',
      'level TEXT',
      'exercise_db_id TEXT',
    ];
    for (const col of metaCols) {
      const [colName] = col.split(' ');
      try {
        await db.execAsync(`ALTER TABLE workout_exercises ADD COLUMN ${col};`);
      } catch {
        // colonna già presente
      }
    }
    await db.runAsync('PRAGMA user_version = 3;');
  }

  // Migrazione v4: salva istruzioni e tutte le immagini del catalogo
  if (dbVersion < 4) {
    for (const col of ['instructions TEXT', 'images TEXT']) {
      try {
        await db.execAsync(`ALTER TABLE workout_exercises ADD COLUMN ${col};`);
      } catch {
        // colonna già presente
      }
    }
    await db.runAsync('PRAGMA user_version = 4;');
  }

  // Migrazione v5: distingue i set completati e conserva i muscoli al momento dell'allenamento
  if (dbVersion < 5) {
    for (const col of [
      'completed INTEGER NOT NULL DEFAULT 0',
      'primary_muscles TEXT',
      'secondary_muscles TEXT',
    ]) {
      try {
        await db.execAsync(`ALTER TABLE set_logs ADD COLUMN ${col};`);
      } catch {
        // colonna già presente
      }
    }
    await db.runAsync('PRAGMA user_version = 5;');
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