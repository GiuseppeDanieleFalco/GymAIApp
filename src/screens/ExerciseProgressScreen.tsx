import React, { useEffect, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { getDb } from '../database/db';
import { ExerciseProgressChart } from '../components/ExerciseProgressChart';

interface ProgressDataPoint {
    date: string;
    weight: number;
    reps: number;
    oneRepMax: number;
}

export default function ExerciseProgressScreen() {
    const route = useRoute<any>();
    const { exerciseId, exerciseName } = route.params;

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<ProgressDataPoint[]>([]);
    const [bestOneRepMax, setBestOneRepMax] = useState<number>(0);

    useEffect(() => {
        loadProgress();
    }, [exerciseId]);

    const loadProgress = async () => {
        setLoading(true);
        try {
            const db = await getDb();

            // Recupera tutti i set registrati per questo specifico esercizio ordinati per data
            const rows: any[] = await db.getAllAsync(
                `SELECT sl.reps_completed, sl.weight_kg, wl.completed_at
         FROM set_logs sl
         INNER JOIN workout_logs wl ON sl.session_id = wl.id
         WHERE sl.exercise_id = ? AND sl.weight_kg > 0
         ORDER BY wl.completed_at ASC;`,
                [exerciseId]
            );

            // Raggruppa per data mantenendo il miglior set (1RM più alto) della giornata
            const aggregated: { [key: string]: ProgressDataPoint } = {};
            let max1RM = 0;

            rows.forEach((row) => {
                const dateStr = new Date(row.completed_at).toLocaleDateString('it-IT', {
                    day: '2-digit',
                    month: 'short',
                });

                const reps = row.reps_completed || 0;
                const weight = row.weight_kg || 0;
                // Formula Epley per 1RM
                const calculated1RM = reps > 1 ? Math.round(weight * (1 + reps / 30)) : weight;

                if (calculated1RM > max1RM) {
                    max1RM = calculated1RM;
                }

                if (!aggregated[dateStr] || calculated1RM > aggregated[dateStr].oneRepMax) {
                    aggregated[dateStr] = {
                        date: dateStr,
                        weight,
                        reps,
                        oneRepMax: calculated1RM,
                    };
                }
            });

            const points = Object.values(aggregated);
            setHistory(points);
            setBestOneRepMax(max1RM);
        } catch (error) {
            console.error('Errore caricamento progressi esercizio:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    // Trova il valore massimo per proporzionare le barre del grafico
    const maxChartValue = Math.max(...history.map((h) => h.oneRepMax), 1);

    return (
        <SafeAreaView style={styles.container}>

            <Text style={styles.header}>{exerciseName}</Text>

            {/* Progression Line Chart */}
            <ExerciseProgressChart exerciseId={exerciseId} />
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.headerTitle}>📈 Progressi: {exerciseName}</Text>

                {/* Card Record Personale */}
                <View style={styles.prCard}>
                    <Text style={styles.prLabel}>Massimale Stimato (1RM Record)</Text>
                    <Text style={styles.prValue}>{bestOneRepMax} <Text style={styles.unit}>kg</Text></Text>
                </View>

                {history.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>
                            Nessun dato registrato per questo esercizio. Completa un allenamento per vedere i progressi!
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Grafico Andamento 1RM */}
                        <Text style={styles.sectionTitle}>Andamento Massimale Stimato</Text>
                        <View style={styles.chartContainer}>
                            {history.map((item, index) => {
                                const barHeightPercent = Math.max(15, (item.oneRepMax / maxChartValue) * 100);
                                return (
                                    <View key={index} style={styles.barGroup}>
                                        <Text style={styles.barValue}>{item.oneRepMax}kg</Text>
                                        <View style={styles.barTrack}>
                                            <View style={[styles.barFill, { height: `${barHeightPercent}%` }]} />
                                        </View>
                                        <Text style={styles.barLabel}>{item.date}</Text>
                                    </View>
                                );
                            })}
                        </View>

                        {/* Tabella Storico Esercizio */}
                        <Text style={styles.sectionTitle}>Registro Sessioni</Text>
                        {history.slice().reverse().map((item, index) => (
                            <View key={index} style={styles.historyRow}>
                                <Text style={styles.historyDate}>{item.date}</Text>
                                <Text style={styles.historySet}>
                                    Best Set: <Text style={styles.bold}>{item.weight} kg</Text> x {item.reps} reps
                                </Text>
                                <Text style={styles.history1RM}>1RM: {item.oneRepMax} kg</Text>
                            </View>
                        ))}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
    header: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
    scrollContent: { padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1c1c1e', marginBottom: 16 },
    prCard: {
        backgroundColor: '#007AFF',
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        marginBottom: 20,
        elevation: 3,
    },
    prLabel: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 13, fontWeight: '600' },
    prValue: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginTop: 4 },
    unit: { fontSize: 20, fontWeight: 'normal' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c1c1e', marginBottom: 12, marginTop: 8 },
    emptyContainer: { padding: 20, alignItems: 'center' },
    emptyText: { color: '#8e8e93', textAlign: 'center', fontSize: 15 },
    chartContainer: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
        height: 180,
        marginBottom: 20,
    },
    barGroup: { alignItems: 'center', flex: 1 },
    barValue: { fontSize: 10, color: '#007AFF', fontWeight: 'bold', marginBottom: 4 },
    barTrack: { width: 14, height: 100, backgroundColor: '#e5e5ea', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { backgroundColor: '#007AFF', width: '100%', borderRadius: 7 },
    barLabel: { fontSize: 10, color: '#8e8e93', marginTop: 6 },
    historyRow: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    historyDate: { fontSize: 13, color: '#8e8e93', width: 60 },
    historySet: { fontSize: 14, color: '#3c3c43' },
    history1RM: { fontSize: 13, fontWeight: 'bold', color: '#34C759' },
    bold: { fontWeight: 'bold', color: '#1c1c1e' },
});