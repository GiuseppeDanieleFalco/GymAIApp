import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { getWorkoutDetails, WorkoutItem, WorkoutExerciseItem } from '../database/workoutQueries';
import { getDb } from '../database/db';

const parseStringArray = (value: string | null | undefined): string[] => {
    try {
        const parsed: unknown = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
};

const ExerciseMetadata = ({ exercise }: { exercise: WorkoutExerciseItem }) => {
    const primaryMuscles = parseStringArray(exercise.primary_muscles);
    const secondaryMuscles = parseStringArray(exercise.secondary_muscles);
    const instructions = parseStringArray(exercise.instructions);
    const characteristics = [
        exercise.category,
        exercise.level,
        exercise.force,
        exercise.mechanic,
    ].filter(Boolean);

    if (!primaryMuscles.length && !secondaryMuscles.length && !instructions.length && !characteristics.length) {
        return null;
    }

    return (
        <View style={styles.exerciseMetadata}>
            {primaryMuscles.length > 0 && (
                <Text style={styles.metadataText}>Muscoli principali: {primaryMuscles.join(', ')}</Text>
            )}
            {secondaryMuscles.length > 0 && (
                <Text style={styles.metadataText}>Muscoli secondari: {secondaryMuscles.join(', ')}</Text>
            )}
            {characteristics.length > 0 && (
                <Text style={styles.metadataText}>{characteristics.join(' · ')}</Text>
            )}
            {instructions.length > 0 && (
                <View style={styles.instructionsBlock}>
                    <Text style={styles.instructionsTitle}>Istruzioni</Text>
                    {instructions.map((instruction, index) => (
                        <Text key={`${exercise.id}-instruction-${index}`} style={styles.instructionText}>
                            {index + 1}. {instruction}
                        </Text>
                    ))}
                </View>
            )}
        </View>
    );
};

export default function WorkoutDetailScreen({ route, navigation }: any) {
    const { workoutId } = route.params;
    const [workout, setWorkout] = useState<WorkoutItem | null>(null);
    const [exercises, setExercises] = useState<WorkoutExerciseItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [videoSearchQuery, setVideoSearchQuery] = useState<string | null>(null);


    // Funzione per eliminare la scheda con conferma
    const handleDeleteWorkout = () => {
        Alert.alert(
            'Conferma Eliminazione',
            'Sei sicuro di voler eliminare questa scheda? L\'azione non è reversibile.',
            [
                { text: 'Annulla', style: 'cancel' },
                {
                    text: 'Elimina',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const db = await getDb();

                            // 1. Elimina gli esercizi associati alla scheda
                            await db.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?;', [workoutId]);

                            // 2. Elimina la scheda principale
                            await db.runAsync('DELETE FROM workouts WHERE id = ?;', [workoutId]);

                            Alert.alert('Eliminata', 'La scheda è stata rimossa con successo.', [
                                { text: 'OK', onPress: () => navigation.navigate('WorkoutsList') },
                            ]);
                        } catch (error) {
                            console.error('Errore durante l\'eliminazione della scheda:', error);
                            Alert.alert('Errore', 'Impossibile eliminare la scheda.');
                        }
                    },
                },
            ]
        );
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { workout, exercises } = await getWorkoutDetails(workoutId);
                setWorkout(workout);
                setExercises(exercises);
            } catch (error) {
                console.error('Errore recupero dettaglio scheda:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [workoutId]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
            </View>
        );
    }

    if (!workout) {
        return (
            <View style={styles.loadingContainer}>
                <Text>Scheda non trovata.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header Scheda */}
                <View style={styles.headerBox}>
                    <Text style={styles.title}>{workout.title}</Text>
                    <Text style={styles.description}>{workout.description}</Text>

                    <View style={styles.metaRow}>
                        <View style={styles.metaBadge}>
                            <Ionicons name="barbell-outline" size={14} color="#2563EB" />
                            <Text style={styles.metaText}>{exercises.length} Esercizi</Text>
                        </View>
                        {workout.is_ai_generated === 1 && (
                            <View style={[styles.metaBadge, { backgroundColor: '#F0FDF4' }]}>
                                <Ionicons name="sparkles-outline" size={14} color="#16A34A" />
                                <Text style={[styles.metaText, { color: '#16A34A' }]}>Generata con IA</Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={styles.editButton}
                            onPress={() => navigation.navigate('WorkoutForm', { workoutId })}
                        >
                            <Text style={styles.editButtonText}>✏️ Modifica</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={handleDeleteWorkout}
                        >
                            <Text style={styles.deleteButtonText}>🗑 Elimina</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Lista Esercizi */}
                <Text style={styles.sectionHeader}>Esercizi in Programma</Text>

                {exercises.map((ex, index) => (
                    <View key={ex.id} style={styles.exerciseCard}>
                        <View style={styles.exerciseHeader}>
                            <Text style={styles.exerciseNumber}>{index + 1}</Text>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                                <Text style={styles.equipmentText}>Attrezzo: {ex.equipment || 'Libero'}</Text>
                            </View>
                            <View style={styles.exerciseActions}>
                                <TouchableOpacity
                                    style={styles.videoBtn}
                                    onPress={() => setVideoSearchQuery(ex.exercise_name)}
                                >
                                    <Text style={styles.videoBtnText}>▶ Video</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() =>
                                        navigation.navigate('ExerciseProgress', {
                                            exerciseId: ex.id,
                                            exerciseName: ex.exercise_name,
                                        })
                                    }
                                >
                                    <Text style={{ color: '#007AFF', fontSize: 13, marginTop: 4 }}>📈 Progressi</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>Serie</Text>
                                <Text style={styles.statValue}>{ex.target_sets}</Text>
                            </View>

                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>Reps</Text>
                                <Text style={styles.statValue}>{ex.target_reps}</Text>
                            </View>

                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>Recupero</Text>
                                <Text style={styles.statValue}>{ex.rest_seconds}s</Text>
                            </View>
                        </View>
                        <ExerciseMetadata exercise={ex} />
                    </View>
                ))}
            </ScrollView>

            {/* CTA Inizia Allenamento */}
            <View style={styles.footerBar}>
                <TouchableOpacity
                    style={styles.startButton}
                    onPress={() => navigation.navigate('ActiveSession', { workoutId: workout.id })}
                >
                    <Ionicons name="play" size={20} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={styles.startButtonText}>Inizia Allenamento</Text>
                </TouchableOpacity>
            </View>

            {/* Modale Video */}
            <Modal
                visible={!!videoSearchQuery}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setVideoSearchQuery(null)}
            >
                <View style={styles.videoModalContainer}>
                    <View style={styles.videoModalHeader}>
                        <Text style={styles.videoModalTitle}>Tutorial Esercizio</Text>
                        <TouchableOpacity onPress={() => setVideoSearchQuery(null)}>
                            <Text style={styles.videoModalCloseBtn}>Chiudi</Text>
                        </TouchableOpacity>
                    </View>
                    {videoSearchQuery && (
                        <WebView
                            source={{ uri: `https://www.youtube.com/results?search_query=${encodeURIComponent(videoSearchQuery + ' exercise tutorial')}` }}
                            style={{ flex: 1 }}
                        />
                    )}
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: 16, paddingBottom: 100 },
    headerBox: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        marginBottom: 20,
    },
    title: { fontSize: 20, fontWeight: 'bold', color: '#0F172A' },
    description: { fontSize: 14, color: '#64748B', marginTop: 6, lineHeight: 20 },
    metaRow: { flexDirection: 'row', marginTop: 12 },
    metaBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
        marginRight: 8,
    },
    metaText: { fontSize: 12, fontWeight: '600', color: '#2563EB', marginLeft: 4 },
    sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 12 },
    exerciseCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    exerciseHeader: { flexDirection: 'row', alignItems: 'center' },
    exerciseNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#F1F5F9',
        textAlign: 'center',
        lineHeight: 28,
        fontWeight: 'bold',
        color: '#475569',
    },
    exerciseName: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
    equipmentText: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        paddingVertical: 8,
        marginTop: 10,
    },
    statBox: { alignItems: 'center' },
    statLabel: { fontSize: 11, color: '#64748B' },
    statValue: { fontSize: 14, fontWeight: 'bold', color: '#0F172A', marginTop: 2 },
    exerciseMetadata: { marginTop: 10, gap: 4 },
    metadataText: { fontSize: 12, color: '#475569', lineHeight: 17 },
    instructionsBlock: { marginTop: 4 },
    instructionsTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
    instructionText: { fontSize: 12, color: '#475569', lineHeight: 18, marginBottom: 3 },
    footerBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    startButton: {
        flexDirection: 'row',
        backgroundColor: '#16A34A',
        borderRadius: 12,
        paddingVertical: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    startButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    editBtn: {
        flex: 0.48,
        backgroundColor: '#e5e5ea',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    editBtnText: { color: '#1c1c1e', fontSize: 15, fontWeight: '600' },
    actionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 16,
    },
    editButton: {
        flex: 0.48,
        backgroundColor: '#e5e5ea',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    editButtonText: { color: '#007AFF', fontWeight: '600' },
    deleteButton: {
        flex: 0.48,
        backgroundColor: '#ffe5e5',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    deleteButtonText: { color: '#FF3B30', fontWeight: '600' },
    exerciseActions: {
        alignItems: 'flex-end',
    },
    videoBtn: {
        backgroundColor: '#ff0000',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginBottom: 4,
    },
    videoBtnText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    videoModalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    videoModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderColor: '#eee',
        backgroundColor: '#fff',
    },
    videoModalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    videoModalCloseBtn: {
        color: '#007AFF',
        fontSize: 16,
        fontWeight: '600',
    },
});