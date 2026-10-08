import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { getDb } from '../database/db';

interface ChartPoint {
    value: number; // Weight in kg
    label: string; // Date (e.g. "12 Oct")
    dataPointText?: string;
}

export const ExerciseProgressChart = ({ exerciseId }: { exerciseId: string }) => {
    const [chartData, setChartData] = useState<ChartPoint[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProgression = async () => {
            try {
                const db = await getDb();

                // Fetch max weight per workout date for this exercise
                const rows: { max_weight: number; date: string }[] = await db.getAllAsync(`
                    SELECT MAX(sl.weight_kg) as max_weight, DATE(wl.completed_at) as date
                    FROM set_logs sl
                    JOIN workout_logs wl ON sl.session_id = wl.id
                    WHERE sl.exercise_id = ? AND sl.completed = 1
                    GROUP BY DATE(wl.completed_at)
                    ORDER BY DATE(wl.completed_at) ASC;
                `, [exerciseId]);

                const formattedData: ChartPoint[] = rows.map((r) => {
                    const dateObj = new Date(r.date);
                    const label = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
                    return {
                        value: r.max_weight,
                        label,
                        dataPointText: `${r.max_weight}kg`,
                    };
                });

                setChartData(formattedData);
            } catch (err) {
                console.error('Errore caricamento grafico:', err);
            } finally {
                setLoading(false);
            }
        };

        if (exerciseId) fetchProgression();
    }, [exerciseId]);

    if (loading) return <ActivityIndicator color="#6366f1" style={{ marginVertical: 20 }} />;
    if (chartData.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Dati insufficienti per il grafico di progresso.</Text>
            </View>
        );
    }

    return (
        <View style={styles.chartWrapper}>
            <Text style={styles.chartTitle}>📈 Progressioni Carico (Max Kg)</Text>

            <LineChart
                data={chartData}
                height={180}
                areaChart
                curved
                color="#6366f1"
                startFillColor="#6366f1"
                endFillColor="#6366f1"
                startOpacity={0.25}
                endOpacity={0.02}
                thickness={3}
                dataPointsColor="#6366f1"
                dataPointsRadius={5}
                textFontSize={11}
                textColor="#475569"
                yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
                xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 10 }}
                noOfSections={4}
                yAxisOffset={Math.max(0, Math.min(...chartData.map(d => d.value)) - 5)}
                rulesColor="#f1f5f9"
                rulesType="solid"
                initialSpacing={15}
                endSpacing={15}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    chartWrapper: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        marginVertical: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    chartTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 16,
    },
    emptyContainer: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        color: '#94a3b8',
        fontSize: 13,
    },
});