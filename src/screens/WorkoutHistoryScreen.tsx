import React, { useEffect, useState, useMemo } from 'react';
import {
    StyleSheet,
    Text,
    View,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
    ScrollView,
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
        completed: number;
    }[];
}

interface MuscleUseSummary {
    muscle: string;
    primarySets: number;
    secondarySets: number;
}

const parseMuscles = (value: string | null): string[] => {
    try {
        const parsed: unknown = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
};

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

/* -------------------------------------------------------------------------- */
/*                            SUB-COMPONENTS & GRAPHICS                       */
/* -------------------------------------------------------------------------- */

// Muscle Visual Progress Bar
const MuscleBarChart = ({ stats }: { stats: MuscleUseSummary[] }) => {
    const maxSets = useMemo(() => {
        return Math.max(...stats.map((s) => s.primarySets + s.secondarySets), 1);
    }, [stats]);

    return (
        <View style={styles.chartContainer}>
            <Text style={styles.sectionTitle}>💪 Distribuzione Serie per Muscolo</Text>
            {stats.map((item) => {
                const primaryWidth = `${(item.primarySets / maxSets) * 100}%`;
                const secondaryWidth = `${(item.secondarySets / maxSets) * 100}%`;
                const totalSets = item.primarySets + item.secondarySets;

                return (
                    <View key={item.muscle} style={styles.barRow}>
                        <View style={styles.barLabelContainer}>
                            <Text style={styles.barLabel}>{item.muscle}</Text>
                            <Text style={styles.barValue}>{totalSets} serie</Text>
                        </View>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFillPrimary, { width: primaryWidth as any }]} />
                            <View style={[styles.barFillSecondary, { width: secondaryWidth as any }]} />
                        </View>
                    </View>
                );
            })}
            <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
                    <Text style={styles.legendText}>Principali</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#a5b4fc' }]} />
                    <Text style={styles.legendText}>Secondari</Text>
                </View>
            </View>
        </View>
    );
};

// Log Card Component
const HistoryItem = ({ item, navigation, onDelete }: { item: HistorySession, navigation: any, onDelete: (id: string) => void }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <TouchableOpacity style={styles.card} onPress={() => setExpanded(!expanded)} activeOpacity={0.85}>
            <View style={styles.cardHeader}>
                <Text style={styles.workoutTitle}>{item.workout_title}</Text>
                <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.deleteButton}>
                    <Text style={styles.deleteIcon}>🗑️</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.cardSubHeader}>
                <Text style={styles.dateText}>📅 {formatDate(item.completed_at)}</Text>
                <Text style={styles.durationBadge}>⏱ {item.duration_minutes} min</Text>
            </View>

            {expanded && (
                <View style={styles.expandedDetails}>
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
                            <Text style={styles.exerciseName} numberOfLines={1}>
                                {log.exercise_name || 'Esercizio'}
                            </Text>
                            <Text style={styles.logDetails}>
                                Set #{log.set_number}: <Text style={styles.bold}>{log.weight_kg} kg</Text> × {log.reps_completed} reps
                                {log.completed ? '' : ' (Parziale)'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </TouchableOpacity>
    );
};

/* -------------------------------------------------------------------------- */
/*                            MAIN SCREEN COMPONENT                           */
/* -------------------------------------------------------------------------- */

export default function WorkoutHistoryScreen({ navigation }: any) {
    const [history, setHistory] = useState<HistorySession[]>([]);
    const [muscleStats, setMuscleStats] = useState<MuscleUseSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'analytics' | 'history'>('analytics');

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const db = await getDb();

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

            const sessions: any[] = await db.getAllAsync(`
                SELECT wl.id, wl.duration_minutes, wl.completed_at, w.title as workout_title
                FROM workout_logs wl
                LEFT JOIN workouts w ON wl.workout_id = w.id
                ORDER BY wl.completed_at DESC;
            `);

            const completedSetMuscles = await db.getAllAsync<{
                primary_muscles: string | null;
                secondary_muscles: string | null;
            }>(`
                SELECT primary_muscles, secondary_muscles
                FROM set_logs
                WHERE completed = 1;
            `);

            const muscleSummary = new Map<string, MuscleUseSummary>();
            for (const row of completedSetMuscles) {
                const primary = new Set(parseMuscles(row.primary_muscles));
                const secondary = new Set(parseMuscles(row.secondary_muscles));
                for (const muscle of primary) {
                    const summary = muscleSummary.get(muscle) ?? { muscle, primarySets: 0, secondarySets: 0 };
                    summary.primarySets += 1;
                    muscleSummary.set(muscle, summary);
                }
                for (const muscle of secondary) {
                    const summary = muscleSummary.get(muscle) ?? { muscle, primarySets: 0, secondarySets: 0 };
                    summary.secondarySets += 1;
                    muscleSummary.set(muscle, summary);
                }
            }

            setMuscleStats([...muscleSummary.values()].sort(
                (a, b) => (b.primarySets + b.secondarySets) - (a.primarySets + a.secondarySets)
            ));

            const fullHistory: HistorySession[] = [];
            for (const s of sessions) {
                const setLogs: any[] = await db.getAllAsync(`
                    SELECT sl.set_number, sl.reps_completed, sl.weight_kg, sl.completed, we.exercise_name, we.id AS exercise_id
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
        const unsubscribe = navigation.addListener('focus', fetchHistory);
        return unsubscribe;
    }, [navigation]);

    // Computed Aggregated Metrics
    const metrics = useMemo(() => {
        let totalVolume = 0;
        let totalSets = 0;
        let totalMinutes = 0;

        history.forEach((session) => {
            totalMinutes += session.duration_minutes;
            session.set_logs.forEach((log) => {
                totalSets += 1;
                totalVolume += (log.weight_kg || 0) * (log.reps_completed || 0);
            });
        });

        return {
            totalWorkouts: history.length,
            totalHours: (totalMinutes / 60).toFixed(1),
            totalVolume: Math.round(totalVolume),
            totalSets,
        };
    }, [history]);

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
                <ActivityIndicator size="large" color="#6366f1" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header Title */}
            <Text style={styles.headerTitle}>📊 Analisi & Storico</Text>

            {/* Segmented Tab Bar */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'analytics' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('analytics')}
                >
                    <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>Statistiche</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>Storico ({history.length})</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'analytics' ? (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    {/* KPI Quick Overview Grid */}
                    <View style={styles.kpiGrid}>
                        <View style={styles.kpiCard}>
                            <Text style={styles.kpiValue}>{metrics.totalWorkouts}</Text>
                            <Text style={styles.kpiLabel}>Workout Totali</Text>
                        </View>
                        <View style={styles.kpiCard}>
                            <Text style={styles.kpiValue}>{metrics.totalHours}h</Text>
                            <Text style={styles.kpiLabel}>Tempo Allenato</Text>
                        </View>
                        <View style={styles.kpiCard}>
                            <Text style={styles.kpiValue}>{metrics.totalVolume.toLocaleString()} kg</Text>
                            <Text style={styles.kpiLabel}>Volume Sollevato</Text>
                        </View>
                        <View style={styles.kpiCard}>
                            <Text style={styles.kpiValue}>{metrics.totalSets}</Text>
                            <Text style={styles.kpiLabel}>Serie Completate</Text>
                        </View>
                    </View>

                    {/* Muscle Load Bars Component */}
                    {muscleStats.length > 0 ? (
                        <MuscleBarChart stats={muscleStats} />
                    ) : (
                        <Text style={styles.emptyText}>Nessun dato muscolare registrato.</Text>
                    )}
                </ScrollView>
            ) : (
                <FlatList
                    data={history}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.scrollContent}
                    renderItem={({ item }) => (
                        <HistoryItem item={item} navigation={navigation} onDelete={deleteSession} />
                    )}
                    ListEmptyComponent={
                        <View style={styles.center}>
                            <Text style={styles.emptyText}>Nessuna sessione trovata.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

/* -------------------------------------------------------------------------- */
/*                               STYLESHEET                                   */
/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
    headerTitle: { fontSize: 24, fontWeight: '800', marginVertical: 12, color: '#0f172a', letterSpacing: -0.5 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    emptyText: { color: '#94a3b8', fontSize: 15, fontWeight: '500' },
    scrollContent: { paddingBottom: 24 },

    /* Segmented Tabs */
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#e2e8f0',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tabButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    tabButtonActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
    tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    tabTextActive: { color: '#6366f1' },

    /* Metric Cards */
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    kpiCard: {
        width: '48%',
        backgroundColor: '#ffffff',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOpacity: 0.02,
        shadowRadius: 5,
    },
    kpiValue: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
    kpiLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 2 },

    /* Bar Graphics */
    chartContainer: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
    barRow: { marginBottom: 12 },
    barLabelContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    barLabel: { fontSize: 13, fontWeight: '700', color: '#334155', textTransform: 'capitalize' },
    barValue: { fontSize: 12, color: '#64748b', fontWeight: '600' },
    barTrack: { height: 10, backgroundColor: '#f1f5f9', borderRadius: 5, flexDirection: 'row', overflow: 'hidden' },
    barFillPrimary: { height: '100%', backgroundColor: '#6366f1' },
    barFillSecondary: { height: '100%', backgroundColor: '#a5b4fc' },
    legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'flex-end' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, color: '#64748b', fontWeight: '500' },

    /* Cards */
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    workoutTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1 },
    deleteButton: { padding: 4 },
    deleteIcon: { fontSize: 16 },
    dateText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
    durationBadge: { fontSize: 12, color: '#6366f1', fontWeight: '700', backgroundColor: '#eef2ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    expandedDetails: { marginTop: 12 },
    divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 10 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginBottom: 6 },
    logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    exerciseName: { fontSize: 13, color: '#334155', flex: 1, paddingRight: 8 },
    logDetails: { fontSize: 13, color: '#64748b' },
    bold: { fontWeight: '700', color: '#0f172a' },
});