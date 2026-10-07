import React, { useState, useEffect, useCallback } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    KeyboardAvoidingView,
    Platform,
    FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getDb } from '../database/db';
import { createGroup, getAllGroups, WorkoutGroup } from '../database/groupQueries';
import { searchExercises, findExerciseMetadata, ExerciseDbEntry } from '../services/exerciseImageLookup';

interface ExerciseFormItem {
    id?: string;
    exercise_name: string;
    target_sets: string;
    target_reps: string;
    rest_seconds: string;
    // Metadata from free-exercise-db (set when user picks from autocomplete)
    dbMeta?: ExerciseDbEntry | null;
}

export default function WorkoutFormScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();

    // Se passato, workoutId indica che siamo in modalità Modifica
    const workoutId = route.params?.workoutId || null;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [exercises, setExercises] = useState<ExerciseFormItem[]>([
        { exercise_name: '', target_sets: '3', target_reps: '10', rest_seconds: '60' },
    ]);
    const [loading, setLoading] = useState(false);
    const [groups, setGroups] = useState<WorkoutGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    // Autocomplete: suggestions per index
    const [suggestions, setSuggestions] = useState<Record<number, ExerciseDbEntry[]>>({});

    useEffect(() => {
        loadGroups();
        if (workoutId) {
            loadExistingWorkout();
        }
    }, [workoutId]);

    const loadGroups = async () => {
        try {
            const data = await getAllGroups();
            setGroups(data);
        } catch (error) {
            console.error('Errore caricamento gruppi:', error);
        }
    };

    const createDefaultGroup = async () => {
        try {
            // Crea un gruppo di default con la data odierna
            const today = new Date().toLocaleDateString('it-IT', {
                day: '2-digit', month: '2-digit', year: 'numeric',
            });
            const defaultName = `Workout - ${today}`;
            // Colore di default per il gruppo AI (blu)
            const defaultColor = '#2563EB';
            const newGroupId = await createGroup(defaultName, defaultColor);
            setSelectedGroupId(newGroupId);
            // Ricarica la lista aggiornata
            const updatedGroups = await getAllGroups();
            setGroups(updatedGroups);
            return newGroupId;
        } catch (error) {
            console.error('Errore creazione gruppo default:', error);
            // Fallback: carica solo i gruppi esistenti
            getAllGroups().then(setGroups).catch(console.error);
            throw error;
        }
    };

    const loadExistingWorkout = async () => {
        try {
            const db = await getDb();
            const workout: any = await db.getFirstAsync(
                'SELECT * FROM workouts WHERE id = ?;',
                [workoutId]
            );

            if (workout) {
                setTitle(workout.title || '');
                setDescription(workout.description || '');
                setSelectedGroupId((workout as any).group_id ?? null);

                const exRows: any[] = await db.getAllAsync(
                    'SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY order_index ASC;',
                    [workoutId]
                );

                if (exRows.length > 0) {
                    setExercises(
                        exRows.map((ex) => ({
                            id: ex.id,
                            exercise_name: ex.exercise_name,
                            target_sets: String(ex.target_sets || 3),
                            target_reps: String(ex.target_reps || '10'),
                            rest_seconds: String(ex.rest_seconds || 60),
                            dbMeta: ex.exercise_db_id ? {
                                id: ex.exercise_db_id,
                                name: ex.exercise_name,
                                force: ex.force ?? null,
                                level: ex.level ?? '',
                                mechanic: ex.mechanic ?? null,
                                equipment: ex.equipment ?? null,
                                primaryMuscles: JSON.parse(ex.primary_muscles || '[]'),
                                secondaryMuscles: JSON.parse(ex.secondary_muscles || '[]'),
                                instructions: JSON.parse(ex.instructions || '[]'),
                                category: ex.category ?? '',
                                images: JSON.parse(ex.images || '[]'),
                            } : null,
                        }))
                    );
                }
            }
        } catch (error) {
            console.error('Errore caricamento scheda per modifica:', error);
            Alert.alert('Errore', 'Impossibile caricare i dati della scheda.');
        }
    };

    const addExercise = () => {
        setExercises([
            ...exercises,
            { exercise_name: '', target_sets: '3', target_reps: '10', rest_seconds: '60' },
        ]);
    };

    const removeExercise = (index: number) => {
        if (exercises.length === 1) {
            Alert.alert('Attenzione', 'La scheda deve contenere almeno un esercizio.');
            return;
        }
        const updated = exercises.filter((_, i) => i !== index);
        setExercises(updated);
    };

    const updateExerciseField = (
        index: number,
        field: keyof ExerciseFormItem,
        value: string
    ) => {
        const updated = [...exercises];
        updated[index][field] = value as any;
        setExercises(updated);
    };

    const handleExerciseNameChange = useCallback(async (index: number, value: string) => {
        const updated = [...exercises];
        updated[index] = { ...updated[index], exercise_name: value, dbMeta: null };
        setExercises(updated);
        if (value.trim().length < 2) {
            setSuggestions((prev) => ({ ...prev, [index]: [] }));
            return;
        }
        const results = await searchExercises(value, 7);
        setSuggestions((prev) => ({ ...prev, [index]: results }));
    }, [exercises]);

    const selectSuggestion = (index: number, entry: ExerciseDbEntry) => {
        const updated = [...exercises];
        updated[index] = { ...updated[index], exercise_name: entry.name, dbMeta: entry };
        setExercises(updated);
        setSuggestions((prev) => ({ ...prev, [index]: [] }));
    };

    const handleSave = async () => {
        if (!title.trim()) {
            Alert.alert('Campo obbligatorio', 'Inserisci un titolo per la scheda.');
            return;
        }

        const validExercises = exercises.filter((ex) => ex.exercise_name.trim() !== '');
        if (validExercises.length === 0) {
            Alert.alert('Attenzione', 'Inserisci almeno un esercizio con un nome valido.');
            return;
        }

        setLoading(true);

        try {
            const db = await getDb();

            // Assicura tabelle esistenti
            await db.execAsync(`
        CREATE TABLE IF NOT EXISTS workouts (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workout_exercises (
          id TEXT PRIMARY KEY NOT NULL,
          workout_id TEXT NOT NULL,
          exercise_name TEXT NOT NULL,
          target_sets INTEGER NOT NULL,
          target_reps TEXT NOT NULL,
          rest_seconds INTEGER NOT NULL,
          order_index INTEGER NOT NULL,
          image_url TEXT
        );
      `);
            let newGroupId = selectedGroupId;
            // Se gruppo non selezionato crea gruppo di default
            if (!selectedGroupId) {
                newGroupId = await createDefaultGroup();
            } else newGroupId = selectedGroupId;

            const currentWorkoutId = workoutId || `workout_${Date.now()}`;
            const createdAt = new Date().toISOString();

            if (workoutId) {
                // Aggiorna la scheda esistente
                await db.runAsync(
                    'UPDATE workouts SET title = ?, description = ?, group_id = ? WHERE id = ?;',
                    [title, description, newGroupId, workoutId]
                );
                // Rimuove gli vecchi esercizi prima del reinserimento
                await db.runAsync(
                    'DELETE FROM workout_exercises WHERE workout_id = ?;',
                    [workoutId]
                );
            } else {
                // Inserimento nuova scheda
                await db.runAsync(
                    'INSERT INTO workouts (id, title, description, created_at, group_id) VALUES (?, ?, ?, ?, ?);',
                    [currentWorkoutId, title, description, createdAt, newGroupId]
                );
            }

            // Inserisce gli esercizi
            for (let i = 0; i < validExercises.length; i++) {
                const ex = validExercises[i];
                const exId = ex.id || `ex_${Date.now()}_${i}`;
                const setsVal = parseInt(ex.target_sets, 10) || 3;
                const restVal = parseInt(ex.rest_seconds, 10) || 60;

                // Risolvi metadati: usa quelli già selezionati, altrimenti cerca
                const meta = ex.dbMeta ?? await findExerciseMetadata(ex.exercise_name);
                const imageUrl = meta?.images?.[0]
                    ? `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${meta.images[0]}`
                    : null;

                await db.runAsync(
                    `INSERT INTO workout_exercises
                     (id, workout_id, exercise_name, equipment, target_sets, target_reps, rest_seconds, order_index,
                      image_url, primary_muscles, secondary_muscles, force, mechanic, category, level, exercise_db_id,
                      instructions, images)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                    [
                        exId, currentWorkoutId, ex.exercise_name, meta?.equipment ?? null, setsVal, ex.target_reps || '10', restVal, i,
                        imageUrl,
                        meta ? JSON.stringify(meta.primaryMuscles) : null,
                        meta ? JSON.stringify(meta.secondaryMuscles) : null,
                        meta?.force ?? null,
                        meta?.mechanic ?? null,
                        meta?.category ?? null,
                        meta?.level ?? null,
                        meta?.id ?? null,
                        meta ? JSON.stringify(meta.instructions) : null,
                        meta ? JSON.stringify(meta.images) : null,
                    ]
                );
            }

            Alert.alert(
                'Successo',
                workoutId ? 'Scheda modificata con successo!' : 'Scheda creata con successo!',
                [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
        } catch (error) {
            console.error('Errore durante il salvataggio della scheda:', error);
            Alert.alert('Errore', 'Impossibile salvare la scheda.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.headerTitle}>
                        {workoutId ? '✏️ Modifica Scheda' : '➕ Nuova Scheda Manuale'}
                    </Text>

                    {/* Campi Scheda */}
                    <Text style={styles.label}>Titolo Scheda *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Es. Petto e Bicipiti"
                        value={title}
                        onChangeText={setTitle}
                    />

                    <Text style={styles.label}>Descrizione / Note</Text>
                    <TextInput
                        style={[styles.input, styles.multilineInput]}
                        placeholder="Es. Focus ipertrofia, recuperi brevi"
                        value={description}
                        onChangeText={setDescription}
                        multiline
                    />

                    {/* Group Picker */}
                    {groups.length > 0 && (
                        <>
                            <Text style={styles.label}>Gruppo (opzionale)</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.groupScroll}
                            >
                                <TouchableOpacity
                                    style={[
                                        styles.groupChip,
                                        selectedGroupId === null && styles.groupChipSelected,
                                    ]}
                                    onPress={() => setSelectedGroupId(null)}
                                >
                                    <Text style={[
                                        styles.groupChipText,
                                        selectedGroupId === null && styles.groupChipTextSelected,
                                    ]}>Nessuno</Text>
                                </TouchableOpacity>
                                {groups.map((g) => (
                                    <TouchableOpacity
                                        key={g.id}
                                        style={[
                                            styles.groupChip,
                                            selectedGroupId === g.id && styles.groupChipSelected,
                                            selectedGroupId === g.id && { backgroundColor: g.color, borderColor: g.color },
                                        ]}
                                        onPress={() => setSelectedGroupId(g.id)}
                                    >
                                        <View style={[styles.chipDot, { backgroundColor: selectedGroupId === g.id ? '#fff' : g.color }]} />
                                        <Text style={[
                                            styles.groupChipText,
                                            selectedGroupId === g.id && styles.groupChipTextSelected,
                                        ]}>{g.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </>
                    )}

                    <View style={styles.divider} />

                    <Text style={styles.sectionTitle}>Esercizi</Text>

                    {exercises.map((ex, index) => (
                        <View key={index} style={styles.exerciseCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.exerciseIndexText}>Esercizio #{index + 1}</Text>
                                <TouchableOpacity onPress={() => removeExercise(index)}>
                                    <Text style={styles.removeText}>🗑 Rimuovi</Text>
                                </TouchableOpacity>
                            </View>

                            <TextInput
                                style={styles.input}
                                placeholder="Nome esercizio (Es. Bench Press)"
                                value={ex.exercise_name}
                                onChangeText={(val) => handleExerciseNameChange(index, val)}
                            // onBlur={() => setSuggestions((prev) => ({ ...prev, [index]: [] }))}
                            />

                            {/* Autocomplete dropdown */}
                            {suggestions[index] && suggestions[index].length > 0 && (
                                <View style={styles.suggestionBox}>
                                    {/* Header with Close Button */}
                                    <View style={styles.suggestionHeader}>
                                        <Text style={styles.suggestionHeaderTitle}>Suggerimenti</Text>
                                        <TouchableOpacity
                                            onPressIn={() => setSuggestions((prev) => ({ ...prev, [index]: [] }))}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <Text style={styles.closeButtonText}>✕</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Suggestion Items */}
                                    {suggestions[index].map((s) => (
                                        <TouchableOpacity
                                            key={s.id}
                                            style={styles.suggestionItem}
                                            onPressIn={() => selectSuggestion(index, s)}
                                        >
                                            <Text style={styles.suggestionName}>{s.name}</Text>
                                            <Text style={styles.suggestionMeta}>
                                                {s.level} · {s.primaryMuscles.join(', ')}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            {/* Show matched muscles if a DB entry is linked */}
                            {ex.dbMeta && (
                                <View style={styles.metaChips}>
                                    {ex.dbMeta.primaryMuscles.map((m) => (
                                        <View key={m} style={styles.chipPrimary}>
                                            <Text style={styles.chipText}>{m}</Text>
                                        </View>
                                    ))}
                                    {ex.dbMeta.secondaryMuscles.map((m) => (
                                        <View key={m} style={styles.chipSecondary}>
                                            <Text style={styles.chipText}>{m}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            <View style={styles.row}>
                                <View style={styles.col}>
                                    <Text style={styles.subLabel}>Serie</Text>
                                    <TextInput
                                        style={styles.inputSmall}
                                        keyboardType="numeric"
                                        value={ex.target_sets}
                                        onChangeText={(val) => updateExerciseField(index, 'target_sets', val)}
                                    />
                                </View>

                                <View style={styles.col}>
                                    <Text style={styles.subLabel}>Reps Target</Text>
                                    <TextInput
                                        style={styles.inputSmall}
                                        value={ex.target_reps}
                                        onChangeText={(val) => updateExerciseField(index, 'target_reps', val)}
                                    />
                                </View>

                                <View style={styles.col}>
                                    <Text style={styles.subLabel}>Recupero (s)</Text>
                                    <TextInput
                                        style={styles.inputSmall}
                                        keyboardType="numeric"
                                        value={ex.rest_seconds}
                                        onChangeText={(val) => updateExerciseField(index, 'rest_seconds', val)}
                                    />
                                </View>
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.addBtn} onPress={addExercise}>
                        <Text style={styles.addBtnText}>+ Aggiungi Esercizio</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.saveBtn, loading && { opacity: 0.7 }]}
                        onPress={handleSave}
                        disabled={loading}
                    >
                        <Text style={styles.saveBtnText}>
                            {loading ? 'Salvataggio...' : workoutId ? 'Salva Modifiche' : 'Crea Scheda'}
                        </Text>
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f4f6' },
    scrollContent: { padding: 16 },
    headerTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1c1c1e' },
    label: { fontSize: 14, fontWeight: '600', color: '#3a3a3c', marginBottom: 6 },
    subLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1c1c1e', marginBottom: 12 },
    input: {
        backgroundColor: '#fff',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#e5e5ea',
        marginBottom: 12,
    },
    multilineInput: { height: 70, textAlignVertical: 'top' },
    divider: { height: 1, backgroundColor: '#ddd', marginVertical: 16 },
    exerciseCard: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e5ea',
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    exerciseIndexText: { fontSize: 14, fontWeight: 'bold', color: '#007AFF' },
    removeText: { fontSize: 13, color: '#FF3B30', fontWeight: '500' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    col: { flex: 0.31 },
    inputSmall: {
        backgroundColor: '#f9f9fb',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontSize: 14,
        borderWidth: 1,
        borderColor: '#e5e5ea',
        textAlign: 'center',
    },
    addBtn: {
        borderWidth: 1,
        borderColor: '#007AFF',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginBottom: 20,
        borderStyle: 'dashed',
    },
    addBtnText: { color: '#007AFF', fontWeight: 'bold', fontSize: 15 },
    saveBtn: {
        backgroundColor: '#34C759',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        marginBottom: 30,
    },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    suggestionBox: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e5ea',
        borderRadius: 8,
        marginTop: -8,
        marginBottom: 12,
    },
    suggestionItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    suggestionName: { fontSize: 14, fontWeight: '600', color: '#1c1c1e' },
    suggestionMeta: { fontSize: 12, color: '#666', marginTop: 2 },
    suggestionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee', // adjust to your theme
    },
    suggestionHeaderTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: '#888',
    },
    closeButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#666',
        paddingHorizontal: 4,
    },
    metaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    chipPrimary: { backgroundColor: '#EAF2FF', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
    chipSecondary: { backgroundColor: '#F1F3F5', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
    chipText: { fontSize: 11, color: '#334155' },
    groupScroll: { marginBottom: 12 },
    groupChip: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F1F5F9', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 8,
        marginRight: 8, borderWidth: 1, borderColor: '#CBD5E1',
    },
    groupChipSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    groupChipText: { fontSize: 13, color: '#334155' },
    groupChipTextSelected: { color: '#fff', fontWeight: '600' },
    chipDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
});