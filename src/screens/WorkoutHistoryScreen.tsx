import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../database/db';

interface HistorySession {
    id: string;
    workout_title: string;
    duration_minutes: number;
    completed_at: string;
    set_logs: {
        exercise_name: string;
        set_number: number;
        reps_completed: number;
        weight_kg: number;
        exercise_id: string;
    }[];
}

const formatDate = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const HistoryItem = ({ item, navigation, onDelete }: { item: HistorySession, navigation: any, onDelete: (id: string) => void }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <TouchableOpacity style={styles.card} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
            <View style={styles.cardHeader}>
                <Text style={styles.workoutTitle}>{item.workout_title}</Text>
                <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteButton}>
                    <Text style={styles.deleteIcon}>🗑️</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.cardSubHeader}>
                <Text style={styles.dateText}>{formatDate(item.completed_at)}</Text>
                <Text style={styles.durationText}>⏱ {item.duration_minutes} min</Text>
            </View>

            {expanded && (
                <>
                    <View style={styles.divider} />
                    <Text style={styles.sectionLabel}>Dettaglio Serie:</Text>
                    {item.set_logs.map((log, idx) => (
                        <TouchableOpacity
                            key={idx}
                            style={styles.logRow}
                            onPress={() =>
                                navigation.navigate('ExerciseProgress', {
                                    exerciseId: log.exercise_id,
                                    exerciseName: log.exercise_name,
                                })
                            }
                        >
                            <Text style={styles.exerciseName}>
                                {log.exercise_name || 'Esercizio'}
                            </Text>
                            <Text style={styles.logDetails}>
                                Set #{log.set_number}: <Text style={styles.bold}>{log.weight_kg} kg</Text> x {log.reps_completed} reps
                            </Text>
                        </TouchableOpacity>
                    ))}
                </>
            )}
        </TouchableOpacity>
    );
};

export default function WorkoutHistoryScreen({ navigation }: any) {
    const [history, setHistory] = useState<HistorySession[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const db = await getDb();

            // Assicura l'esistenza delle tabelle
            await db.execAsync(`
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

            // Recupera tutte le sessioni ordinate dalla più recente
            const sessions: any[] = await db.getAllAsync(`
        SELECT wl.id, wl.duration_minutes, wl.completed_at, w.title as workout_title
        FROM workout_logs wl
        LEFT JOIN workouts w ON wl.workout_id = w.id
        ORDER BY wl.completed_at DESC;
      `);

            const fullHistory: HistorySession[] = [];

            for (const s of sessions) {
                // Per ogni sessione recupera i dettagli delle serie e il nome dell'esercizio
                const setLogs: any[] = await db.getAllAsync(`
          SELECT sl.set_number, sl.reps_completed, sl.weight_kg, we.exercise_name, we.id AS exercise_id
          FROM set_logs sl
          LEFT JOIN workout_exercises we ON sl.exercise_id = we.id
          WHERE sl.session_id = ?
          ORDER BY we.order_index ASC, sl.set_number ASC;
        `, [s.id]);

                fullHistory.push({
                    id: s.id,
                    workout_title: s.workout_title || 'Allenamento Personalizzato',
                    duration_minutes: s.duration_minutes || 0,
                    completed_at: s.completed_at,
                    set_logs: setLogs,
                });
            }

            setHistory(fullHistory);
        } catch (error) {
            console.error('Errore caricamento storico:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            fetchHistory();
        });
        return unsubscribe;
    }, [navigation]);

    const deleteSession = (id: string) => {
        Alert.alert(
            "Elimina sessione",
            "Sei sicuro di voler eliminare questa sessione di allenamento?",
            [
                { text: "Annulla", style: "cancel" },
                {
                    text: "Elimina",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const db = await getDb();
                            await db.runAsync('DELETE FROM set_logs WHERE session_id = ?', [id]);
                            await db.runAsync('DELETE FROM workout_logs WHERE id = ?', [id]);
                            fetchHistory();
                        } catch (error) {
                            console.error('Errore durante l\'eliminazione:', error);
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.headerTitle}>📜 Storico Sessioni</Text>

            {history.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>Nessuna sessione registrata finora.</Text>
                </View>
            ) : (
                <FlatList
                    data={history}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    renderItem={({ item }) => (
                        <HistoryItem item={item} navigation={navigation} onDelete={deleteSession} />
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f4f6', padding: 16 },
    headerTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, color: '#1c1c1e' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: '#8e8e93', fontSize: 16 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 14,
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    workoutTitle: { fontSize: 16, fontWeight: 'bold', color: '#007AFF', flex: 1 },
    deleteButton: { padding: 4 },
    deleteIcon: { fontSize: 18 },
    dateText: { fontSize: 12, color: '#8e8e93' },
    durationText: { fontSize: 13, color: '#555' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
    sectionLabel: { fontSize: 12, fontWeight: '600', color: '#8e8e93', marginBottom: 6 },
    logRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    exerciseName: { fontSize: 13, color: '#333', flex: 1 },
    logDetails: { fontSize: 13, color: '#555' },
    bold: { fontWeight: 'bold', color: '#1c1c1e' },
});