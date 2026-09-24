import { getDb } from './db';

export interface WorkoutItem {
    id: string;
    title: string;
    description: string;
    created_at: string;
    is_ai_generated: number;
    exercise_count?: number;
    group_id: string | null;
    group_name: string | null;
    group_color: string | null;
}

export interface WorkoutExerciseItem {
    id: string;
    workout_id: string;
    exercise_name: string;
    equipment: string;
    target_sets: number;
    target_reps: string;
    rest_seconds: number;
    order_index: number;
}

// Recupera tutte le schede con il conteggio degli esercizi e i dati del gruppo
export const getAllWorkouts = async (): Promise<WorkoutItem[]> => {
    const db = await getDb();
    const rows = await db.getAllAsync<WorkoutItem>(`
        SELECT w.*, COUNT(e.id) as exercise_count,
               g.name as group_name, g.color as group_color
        FROM workouts w
        LEFT JOIN workout_exercises e ON w.id = e.workout_id
        LEFT JOIN workout_groups g ON w.group_id = g.id
        GROUP BY w.id
        ORDER BY g.name ASC, w.created_at DESC;
    `);
    return rows;
};

// Recupera una singola scheda ed i suoi esercizi ordinati
export const getWorkoutDetails = async (workoutId: string) => {
    const db = await getDb();

    const workout = await db.getFirstAsync<WorkoutItem>(
        `SELECT * FROM workouts WHERE id = ?;`,
        [workoutId]
    );

    const exercises = await db.getAllAsync<WorkoutExerciseItem>(
        `SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY order_index ASC;`,
        [workoutId]
    );

    return { workout, exercises };
};

// Elimina una scheda dal DB
export const deleteWorkout = async (workoutId: string) => {
    const db = await getDb();
    await db.runAsync(`DELETE FROM workouts WHERE id = ?;`, [workoutId]);
};