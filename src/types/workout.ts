// Input forniti dall'utente nella UI
export interface AIWorkoutInput {
    weightKg: number;
    experienceLevel: 'beginner' | 'intermediate' | 'advanced';
    daysPerWeek: number;
    sessionDurationMin: number;
    availableEquipment: string[]; // es. ['Manubri', 'Bilanciere', 'Panca', 'Cavi', 'Corpolibero']
    goals: 'hypertrophy' | 'strength' | 'endurance' | 'reconditioning';
    physicalLimitations?: string; // es. "Nessun carico assiale elevato sulla schiena"
    pastWorkoutNotes?: string;   // es. "In passato ho seguito schede in multifrequenza Upper/Lower"
}

// Struttura JSON restituita dall'IA
export interface AIGeneratedExercise {
    exercise_name: string;
    equipment: string;
    target_sets: number;
    target_reps: string; // es. "8-10" o "12"
    rest_seconds: number;
    rpe_suggested?: number;
    execution_notes?: string;
}

export interface AIGeneratedDay {
    day_title: string; // es. "Giorno 1 - Push / Petto e Spalle"
    exercises: AIGeneratedExercise[];
}

export interface AIGeneratedWorkoutPlan {
    workout_title: string;
    description: string;
    disclaimer: string;
    days: AIGeneratedDay[];
}