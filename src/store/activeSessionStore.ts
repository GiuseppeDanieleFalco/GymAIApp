import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SetInput {
    setNumber: number;
    reps: string;
    weightKg: string;
    completed: boolean;
}

export interface ExerciseItem {
    id: string;
    exercise_name: string;
    target_sets: number;
    target_reps: string;
    rest_seconds: number;
    image_url?: string;
    image_urls?: string[];
    equipment?: string | null;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
    instructions?: string[];
    force?: string | null;
    mechanic?: string | null;
    category?: string | null;
    level?: string | null;
    sets: SetInput[];
}

export interface ActiveSessionState {
    workoutId: string | null;
    workoutTitle: string | null;
    startTime: number | null;
    exercises: ExerciseItem[];

    // Actions
    setSession: (workoutId: string, workoutTitle: string, exercises: ExerciseItem[], startTime?: number) => void;
    updateExerciseSets: (exercises: ExerciseItem[]) => void;
    clearSession: () => void;
}

export const useActiveSessionStore = create<ActiveSessionState>()(
    persist(
        (set) => ({
            workoutId: null,
            workoutTitle: null,
            startTime: null,
            exercises: [],

            setSession: (workoutId, workoutTitle, exercises, startTime = Date.now()) =>
                set({ workoutId, workoutTitle, exercises, startTime }),

            updateExerciseSets: (exercises) =>
                set({ exercises }),

            clearSession: () =>
                set({ workoutId: null, workoutTitle: null, startTime: null, exercises: [] }),
        }),
        {
            name: 'active-session-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
