import { getDb } from './db';

export interface WorkoutGroup {
    id: string;
    name: string;
    color: string;
    workout_count?: number;
}

/** Recupera tutti i gruppi con il conteggio delle schede associate */
export const getAllGroups = async (): Promise<WorkoutGroup[]> => {
    const db = await getDb();
    return await db.getAllAsync<WorkoutGroup>(`
        SELECT g.id, g.name, g.color, COUNT(w.id) as workout_count
        FROM workout_groups g
        LEFT JOIN workouts w ON w.group_id = g.id
        GROUP BY g.id
        ORDER BY g.name ASC;
    `);
};

/** Crea un nuovo gruppo */
export const createGroup = async (name: string, color: string): Promise<string> => {
    const db = await getDb();
    const id = `group_${Date.now()}`;
    await db.runAsync(
        `INSERT INTO workout_groups (id, name, color) VALUES (?, ?, ?);`,
        [id, name.trim(), color]
    );
    return id;
};

/** Elimina un gruppo e dissocia le schede collegate (group_id → NULL) */
export const deleteGroup = async (id: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync(`UPDATE workouts SET group_id = NULL WHERE group_id = ?;`, [id]);
    await db.runAsync(`DELETE FROM workout_groups WHERE id = ?;`, [id]);
};

/** Rinomina un gruppo */
export const renameGroup = async (id: string, newName: string): Promise<void> => {
    const db = await getDb();
    await db.runAsync(`UPDATE workout_groups SET name = ? WHERE id = ?;`, [newName.trim(), id]);
};

/** Assegna (o rimuove) una scheda da un gruppo */
export const assignWorkoutToGroup = async (
    workoutId: string,
    groupId: string | null
): Promise<void> => {
    const db = await getDb();
    await db.runAsync(
        `UPDATE workouts SET group_id = ? WHERE id = ?;`,
        [groupId, workoutId]
    );
};
