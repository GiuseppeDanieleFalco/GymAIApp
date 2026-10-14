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
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../database/db';
import { colors } from '../theme/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;

/* -------------------------------------------------------------------------- */
/*                                 INTERFACES                                 */
/* -------------------------------------------------------------------------- */

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

interface PersonalRecord {
    exercise_name: string;
    weight_kg: number;
    reps_completed: number;
    completed_at: string;
}

interface WeeklyVolume {
    weekLabel: string;
    volume: number;
    sessions: number;
}

interface ExerciseFrequency {
    exercise_name: string;
    sets: number;
    sessions: number;
}

/* -------------------------------------------------------------------------- */
/*                               HELPERS                                      */
/* -------------------------------------------------------------------------- */

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

const formatShortDate = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
};

const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

/* -------------------------------------------------------------------------- */
/*                           SUB-COMPONENTS & GRAPHICS                        */
/* -------------------------------------------------------------------------- */

// --- KPI Card ---
const KpiCard = ({
    value,
    label,
    icon,
    accent,
}: {
    value: string;
    label: string;
    icon: string;
    accent: string;
}) => (
    <View style={[styles.kpiCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
        <Text style={styles.kpiIcon}>{icon}</Text>
        <Text style={[styles.kpiValue, { color: accent }]}>{value}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
    </View>
);

// --- Section Card ---
const SectionCard = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <View style={[styles.sectionCard, style]}>{children}</View>
);

// --- Section Title ---
const SectionTitle = ({ icon, title }: { icon: string; title: string }) => (
    <Text style={styles.sectionTitle}>{icon}{'  '}{title}</Text>
);

// --- Weekly Volume Bar Chart ---
const WeeklyVolumeChart = ({ weeks }: { weeks: WeeklyVolume[] }) => {
    const maxVolume = useMemo(() => Math.max(...weeks.map((w) => w.volume), 1), [weeks]);
    const chartWidth = SCREEN_WIDTH - 64;
    const barWidth = Math.floor((chartWidth / weeks.length) * 0.55);
    const gap = Math.floor((chartWidth / weeks.length) * 0.45);

    return (
        <SectionCard>
            <SectionTitle icon="📊" title="Volume Settimanale (kg)" />
            <View style={styles.barChartArea}>
                {weeks.map((w, idx) => {
                    const fillPct = w.volume / maxVolume;
                    const barH = Math.max(4, Math.round(fillPct * 110));
                    const isLast = idx === weeks.length - 1;
                    return (
                        <View key={idx} style={[styles.weekBarCol, { width: barWidth + gap }]}>
                            <Text style={styles.weekBarVol}>
                                {w.volume > 0 ? `${(w.volume / 1000).toFixed(1)}k` : ''}
                            </Text>
                            <View style={[styles.weekBarFill, {
                                height: barH,
                                width: barWidth,
                                backgroundColor: isLast ? colors.primary : colors.secondary,
                                opacity: isLast ? 1 : 0.4 + idx * (0.55 / (weeks.length - 1)),
                            }]} />
                            <Text style={[styles.weekBarLabel, isLast && { color: colors.primary, fontWeight: '700' }]}>
                                {w.weekLabel}
                            </Text>
                            {w.sessions > 0 && (
                                <Text style={styles.weekBarSessions}>{w.sessions}×</Text>
                            )}
                        </View>
                    );
                })}
            </View>
            <View style={styles.chartLegendRow}>
                <View style={[styles.legendDot, { backgroundColor: colors.secondary }]} />
                <Text style={styles.legendText}>Settimane precedenti</Text>
                <View style={[styles.legendDot, { backgroundColor: colors.primary, marginLeft: 12 }]} />
                <Text style={styles.legendText}>Settimana corrente</Text>
            </View>
        </SectionCard>
    );
};

// --- Volume Trend Card ---
const VolumeTrendCard = ({ trend }: { trend: { current: number; previous: number; pct: number } }) => {
    const isUp = trend.pct >= 0;
    const color = isUp ? colors.success : colors.danger;
    const arrow = isUp ? '▲' : '▼';
    return (
        <SectionCard>
            <SectionTitle icon="📈" title="Trend Volume (ultime 4 sett.)" />
            <View style={styles.trendRow}>
                <View style={styles.trendCol}>
                    <Text style={styles.trendPeriodLabel}>Ultime 4 settimane</Text>
                    <Text style={[styles.trendVolume, { color: colors.primary }]}>
                        {(trend.current / 1000).toFixed(1)} t
                    </Text>
                </View>
                <View style={[styles.trendBadge, { backgroundColor: isUp ? colors.successSubtle : colors.dangerSubtle }]}>
                    <Text style={[styles.trendPct, { color }]}>{arrow} {Math.abs(trend.pct)}%</Text>
                </View>
                <View style={styles.trendCol}>
                    <Text style={styles.trendPeriodLabel}>4 sett. precedenti</Text>
                    <Text style={[styles.trendVolume, { color: colors.textSecondary }]}>
                        {(trend.previous / 1000).toFixed(1)} t
                    </Text>
                </View>
            </View>
            <Text style={styles.trendInsight}>
                {isUp
                    ? `💪 Ottimo! Hai sollevato il ${Math.abs(trend.pct)}% in più rispetto al mese scorso.`
                    : `⚠️ Il volume è calato del ${Math.abs(trend.pct)}%. Torna in carreggiata!`}
            </Text>
        </SectionCard>
    );
};

// --- Streak Card ---
const StreakCard = ({ current, best }: { current: number; best: number }) => (
    <SectionCard>
        <SectionTitle icon="🔥" title="Streak Allenamento" />
        <View style={styles.streakRow}>
            <View style={styles.streakItem}>
                <Text style={[styles.streakNum, { color: colors.primary }]}>{current}</Text>
                <Text style={styles.streakLabel}>giorni correnti</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakItem}>
                <Text style={[styles.streakNum, { color: colors.secondary }]}>{best}</Text>
                <Text style={styles.streakLabel}>record personale</Text>
            </View>
        </View>
        {current > 0 && (
            <Text style={styles.streakMotivation}>
                {current >= best
                    ? '🏆 Stai battendo il tuo record! Continua così!'
                    : `Mancano ${best - current} giorni al tuo record di ${best}.`}
            </Text>
        )}
    </SectionCard>
);

// --- Personal Records ---
const PersonalRecordsCard = ({ records }: { records: PersonalRecord[] }) => (
    <SectionCard>
        <SectionTitle icon="🏅" title="Record Personali (PR)" />
        {records.length === 0 ? (
            <Text style={styles.emptyText}>Nessun PR ancora. Inizia ad allenarti!</Text>
        ) : (
            records.map((pr, idx) => (
                <View key={idx} style={[styles.prRow, idx < records.length - 1 && styles.prRowBorder]}>
                    <View style={styles.prRankBadge}>
                        <Text style={styles.prRankText}>#{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.prExerciseName} numberOfLines={1}>{pr.exercise_name}</Text>
                        <Text style={styles.prDate}>{formatShortDate(pr.completed_at)}</Text>
                    </View>
                    <View style={styles.prValueContainer}>
                        <Text style={styles.prWeight}>{pr.weight_kg} kg</Text>
                        <Text style={styles.prReps}>× {pr.reps_completed} reps</Text>
                    </View>
                </View>
            ))
        )}
    </SectionCard>
);

// --- Top Exercises ---
const TopExercisesCard = ({ exercises }: { exercises: ExerciseFrequency[] }) => {
    const max = Math.max(...exercises.map((e) => e.sets), 1);
    const medals = ['🥇', '🥈', '🥉'];
    return (
        <SectionCard>
            <SectionTitle icon="⚡" title="Esercizi Più Allenati" />
            {exercises.map((ex, idx) => (
                <View key={idx} style={styles.topExRow}>
                    <Text style={styles.topExRank}>{medals[idx] ?? `${idx + 1}.`}</Text>
                    <View style={{ flex: 1 }}>
                        <View style={styles.topExLabelRow}>
                            <Text style={styles.topExName} numberOfLines={1}>{ex.exercise_name}</Text>
                            <Text style={styles.topExSets}>{ex.sets} serie · {ex.sessions} sess.</Text>
                        </View>
                        <View style={styles.barTrack}>
                            <View style={[styles.barFillPrimary, {
                                width: `${(ex.sets / max) * 100}%` as any,
                                backgroundColor: idx === 0 ? colors.primary : colors.secondary,
                            }]} />
                        </View>
                    </View>
                </View>
            ))}
        </SectionCard>
    );
};

// --- Muscle Distribution ---
const MuscleBarChart = ({ stats }: { stats: MuscleUseSummary[] }) => {
    const maxSets = useMemo(() => Math.max(...stats.map((s) => s.primarySets + s.secondarySets), 1), [stats]);
    return (
        <SectionCard>
            <SectionTitle icon="💪" title="Distribuzione Muscolare" />
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
                    <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={styles.legendText}>Principali</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.secondaryLight }]} />
                    <Text style={styles.legendText}>Secondari</Text>
                </View>
            </View>
        </SectionCard>
    );
};

// --- Avg Metrics Card ---
const AvgMetricsCard = ({
    avgDuration,
    avgSets,
    avgVolume,
    bestDay,
}: {
    avgDuration: number;
    avgSets: number;
    avgVolume: number;
    bestDay: string;
}) => (
    <SectionCard>
        <SectionTitle icon="📐" title="Medie per Sessione" />
        <View style={styles.avgGrid}>
            <View style={styles.avgItem}>
                <Text style={styles.avgValue}>{Math.round(avgDuration)} min</Text>
                <Text style={styles.avgLabel}>Durata media</Text>
            </View>
            <View style={styles.avgItem}>
                <Text style={styles.avgValue}>{avgSets.toFixed(1)}</Text>
                <Text style={styles.avgLabel}>Serie medie</Text>
            </View>
            <View style={styles.avgItem}>
                <Text style={styles.avgValue}>{(avgVolume / 1000).toFixed(1)} t</Text>
                <Text style={styles.avgLabel}>Volume medio</Text>
            </View>
            <View style={styles.avgItem}>
                <Text style={styles.avgValue}>{bestDay}</Text>
                <Text style={styles.avgLabel}>Giorno preferito</Text>
            </View>
        </View>
    </SectionCard>
);

// --- Workout Frequency ---
const WorkoutFrequencyCard = ({ perWeek, mostUsed }: { perWeek: number; mostUsed: string }) => (
    <SectionCard>
        <SectionTitle icon="📅" title="Frequenza Allenamento" />
        <View style={styles.freqRow}>
            <View style={styles.freqItem}>
                <Text style={[styles.freqValue, { color: colors.primary }]}>{perWeek.toFixed(1)}×</Text>
                <Text style={styles.freqLabel}>sessioni/settimana</Text>
            </View>
            <View style={styles.freqDivider} />
            <View style={[styles.freqItem, { flex: 1.5 }]}>
                <Text style={[styles.freqValue, { color: colors.secondary, fontSize: 14 }]} numberOfLines={1}>
                    {mostUsed}
                </Text>
                <Text style={styles.freqLabel}>scheda più usata</Text>
            </View>
        </View>
    </SectionCard>
);

// --- History Item ---
const HistoryItem = ({
    item,
    navigation,
    onDelete,
}: {
    item: HistorySession;
    navigation: any;
    onDelete: (id: string) => void;
}) => {
    const [expanded, setExpanded] = useState(false);
    const totalVol = item.set_logs.reduce((s, l) => s + l.weight_kg * l.reps_completed, 0);

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
            <View style={styles.cardStats}>
                <Text style={styles.cardStat}>🏋️ {item.set_logs.length} serie</Text>
                <Text style={styles.cardStat}>⚡ {Math.round(totalVol).toLocaleString()} kg vol.</Text>
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
    const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
    const [weeklyVolumes, setWeeklyVolumes] = useState<WeeklyVolume[]>([]);
    const [topExercises, setTopExercises] = useState<ExerciseFrequency[]>([]);
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

            // Sessions list
            const sessions: any[] = await db.getAllAsync(`
                SELECT wl.id, wl.duration_minutes, wl.completed_at, w.title as workout_title
                FROM workout_logs wl
                LEFT JOIN workouts w ON wl.workout_id = w.id
                ORDER BY wl.completed_at DESC;
            `);

            // Muscle stats (completed sets only)
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
            setMuscleStats(
                [...muscleSummary.values()].sort((a, b) => (b.primarySets + b.secondarySets) - (a.primarySets + a.secondarySets))
            );

            // Personal Records (best weight per exercise)
            const prRows = await db.getAllAsync<{
                exercise_name: string;
                weight_kg: number;
                reps_completed: number;
                completed_at: string;
            }>(`
                SELECT we.exercise_name, sl.weight_kg, sl.reps_completed, wl.completed_at
                FROM set_logs sl
                JOIN workout_exercises we ON sl.exercise_id = we.id
                JOIN workout_logs wl ON sl.session_id = wl.id
                WHERE sl.completed = 1 AND sl.weight_kg > 0
                ORDER BY sl.weight_kg DESC;
            `);

            const prMap = new Map<string, PersonalRecord>();
            for (const row of prRows) {
                if (!prMap.has(row.exercise_name)) prMap.set(row.exercise_name, row);
            }
            setPersonalRecords([...prMap.values()].sort((a, b) => b.weight_kg - a.weight_kg).slice(0, 8));

            // Weekly volume for last 8 weeks
            const now = new Date();
            const weeks: WeeklyVolume[] = Array.from({ length: 8 }, (_, i) => {
                const weekStart = getStartOfWeek(new Date(now.getTime() - (7 - i) * 7 * 24 * 60 * 60 * 1000));
                return {
                    weekLabel: weekStart.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }),
                    volume: 0,
                    sessions: 0,
                };
            });

            const volumeRows = await db.getAllAsync<{ completed_at: string; vol: number }>(`
                SELECT wl.completed_at,
                       SUM(sl.weight_kg * sl.reps_completed) as vol
                FROM workout_logs wl
                JOIN set_logs sl ON sl.session_id = wl.id
                WHERE sl.completed = 1
                GROUP BY wl.id
                ORDER BY wl.completed_at ASC;
            `);

            for (const row of volumeRows) {
                const d = new Date(row.completed_at);
                const ws = getStartOfWeek(d).getTime();
                for (let i = 0; i < 8; i++) {
                    const weekStart = getStartOfWeek(new Date(now.getTime() - (7 - i) * 7 * 24 * 60 * 60 * 1000));
                    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
                    if (ws === weekStart.getTime() && d < weekEnd) {
                        weeks[i].volume += row.vol;
                        weeks[i].sessions += 1;
                        break;
                    }
                }
            }
            setWeeklyVolumes(weeks);

            // Top exercises by completed sets
            const topEx = await db.getAllAsync<{ exercise_name: string; sets: number; sessions: number }>(`
                SELECT we.exercise_name,
                       COUNT(sl.id) as sets,
                       COUNT(DISTINCT sl.session_id) as sessions
                FROM set_logs sl
                JOIN workout_exercises we ON sl.exercise_id = we.id
                WHERE sl.completed = 1
                GROUP BY we.exercise_name
                ORDER BY sets DESC
                LIMIT 5;
            `);
            setTopExercises(topEx);

            // Full history
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

    /* Derived metrics */
    const metrics = useMemo(() => {
        let totalVolume = 0;
        let totalSets = 0;
        let totalMinutes = 0;
        const dayCount: Record<string, number> = {};
        const workoutCount: Record<string, number> = {};

        history.forEach((session) => {
            totalMinutes += session.duration_minutes;
            const dow = new Date(session.completed_at).toLocaleDateString('it-IT', { weekday: 'short' });
            dayCount[dow] = (dayCount[dow] ?? 0) + 1;
            const wt = session.workout_title;
            workoutCount[wt] = (workoutCount[wt] ?? 0) + 1;
            session.set_logs.forEach((log) => {
                totalSets += 1;
                totalVolume += (log.weight_kg || 0) * (log.reps_completed || 0);
            });
        });

        const bestDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
        const mostUsed = Object.entries(workoutCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

        let perWeek = 0;
        if (history.length >= 2) {
            const oldest = new Date(history[history.length - 1].completed_at).getTime();
            const newest = new Date(history[0].completed_at).getTime();
            const weeks = Math.max(1, (newest - oldest) / (7 * 24 * 60 * 60 * 1000));
            perWeek = history.length / weeks;
        }

        // Streak calculation
        const dayMs = 24 * 60 * 60 * 1000;
        const sessionDates = history
            .map((s) => {
                const d = new Date(s.completed_at);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            })
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .sort((a, b) => b - a);

        let currentStreak = 0;
        let bestStreak = 0;
        let tempStreak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMs = today.getTime();

        for (let i = 0; i < sessionDates.length; i++) {
            if (i === 0) {
                const diff = todayMs - sessionDates[0];
                if (diff <= dayMs) {
                    currentStreak = 1;
                }
                tempStreak = 1;
            } else {
                const diff = sessionDates[i - 1] - sessionDates[i];
                if (diff === dayMs) {
                    tempStreak += 1;
                    if (currentStreak > 0) currentStreak = tempStreak;
                } else {
                    tempStreak = 1;
                }
            }
            bestStreak = Math.max(bestStreak, tempStreak);
        }

        // Volume trend last 4 vs previous 4 weeks
        const recentVol = weeklyVolumes.slice(4).reduce((s, w) => s + w.volume, 0);
        const prevVol = weeklyVolumes.slice(0, 4).reduce((s, w) => s + w.volume, 0);
        const trendPct = prevVol > 0 ? Math.round(((recentVol - prevVol) / prevVol) * 100) : 0;

        return {
            totalWorkouts: history.length,
            totalHours: (totalMinutes / 60).toFixed(1),
            totalVolume: Math.round(totalVolume),
            totalSets,
            avgDuration: history.length > 0 ? totalMinutes / history.length : 0,
            avgSets: history.length > 0 ? totalSets / history.length : 0,
            avgVolume: history.length > 0 ? totalVolume / history.length : 0,
            bestDay,
            mostUsed,
            perWeek,
            currentStreak,
            bestStreak,
            trendCurrent: recentVol,
            trendPrevious: prevVol,
            trendPct,
        };
    }, [history, weeklyVolumes]);

    const deleteSession = (id: string) => {
        Alert.alert(
            'Elimina sessione',
            'Sei sicuro di voler eliminare questa sessione di allenamento?',
            [
                { text: 'Annulla', style: 'cancel' },
                {
                    text: 'Elimina',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const db = await getDb();
                            await db.runAsync('DELETE FROM set_logs WHERE session_id = ?', [id]);
                            await db.runAsync('DELETE FROM workout_logs WHERE id = ?', [id]);
                            fetchHistory();
                        } catch (error) {
                            console.error("Errore durante l'eliminazione:", error);
                        }
                    },
                },
            ]
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    const hasData = history.length > 0;

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.headerTitle}>Analisi & Storico</Text>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'analytics' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('analytics')}
                >
                    <Text style={[styles.tabText, activeTab === 'analytics' && styles.tabTextActive]}>📊 Statistiche</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>📋 Storico ({history.length})</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'analytics' ? (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                    {!hasData ? (
                        <View style={[styles.center, { paddingVertical: 80 }]}>
                            <Text style={{ fontSize: 52, marginBottom: 16 }}>🏋️</Text>
                            <Text style={styles.emptyTitle}>Nessuna sessione registrata</Text>
                            <Text style={styles.emptyText}>Completa il tuo primo allenamento per vedere le statistiche!</Text>
                        </View>
                    ) : (
                        <>
                            {/* KPI Overview */}
                            <View style={styles.kpiRow}>
                                <KpiCard value={String(metrics.totalWorkouts)} label="Workout Totali" icon="🏋️" accent={colors.primary} />
                                <KpiCard value={`${metrics.totalHours}h`} label="Ore Totali" icon="⏱" accent={colors.secondary} />
                            </View>
                            <View style={styles.kpiRow}>
                                <KpiCard
                                    value={`${(metrics.totalVolume / 1000).toFixed(1)}t`}
                                    label="Volume Totale"
                                    icon="⚡"
                                    accent={colors.primary}
                                />
                                <KpiCard value={String(metrics.totalSets)} label="Serie Completate" icon="✅" accent={colors.secondary} />
                            </View>

                            {/* Streak */}
                            <StreakCard current={metrics.currentStreak} best={metrics.bestStreak} />

                            {/* Frequency */}
                            <WorkoutFrequencyCard perWeek={metrics.perWeek} mostUsed={metrics.mostUsed} />

                            {/* Weekly Volume Chart */}
                            {weeklyVolumes.some((w) => w.volume > 0) && (
                                <WeeklyVolumeChart weeks={weeklyVolumes} />
                            )}

                            {/* Volume Trend */}
                            {(metrics.trendCurrent > 0 || metrics.trendPrevious > 0) && (
                                <VolumeTrendCard
                                    trend={{
                                        current: metrics.trendCurrent,
                                        previous: metrics.trendPrevious,
                                        pct: metrics.trendPct,
                                    }}
                                />
                            )}

                            {/* Session Averages */}
                            <AvgMetricsCard
                                avgDuration={metrics.avgDuration}
                                avgSets={metrics.avgSets}
                                avgVolume={metrics.avgVolume}
                                bestDay={metrics.bestDay}
                            />

                            {/* Personal Records */}
                            {personalRecords.length > 0 && <PersonalRecordsCard records={personalRecords} />}

                            {/* Top Exercises */}
                            {topExercises.length > 0 && <TopExercisesCard exercises={topExercises} />}

                            {/* Muscle Distribution */}
                            {muscleStats.length > 0 ? (
                                <MuscleBarChart stats={muscleStats} />
                            ) : (
                                <SectionCard>
                                    <Text style={styles.emptyText}>Nessun dato muscolare registrato.</Text>
                                </SectionCard>
                            )}
                        </>
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
    headerTitle: { fontSize: 26, fontWeight: '800', marginVertical: 14, color: '#0f172a', letterSpacing: -0.5 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 6, textAlign: 'center' },
    emptyText: { color: '#94a3b8', fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    scrollContent: { paddingBottom: 32 },

    /* Tabs */
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: 14,
        padding: 4,
        marginBottom: 16,
    },
    tabButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    tabButtonActive: {
        backgroundColor: '#ffffff',
        shadowColor: colors.primary,
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
    tabTextActive: { color: colors.primary, fontWeight: '700' },

    /* Section Card */
    sectionCard: {
        backgroundColor: '#ffffff',
        borderRadius: 18,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 14,
        letterSpacing: -0.2,
    },

    /* KPI */
    kpiRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    kpiCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    kpiIcon: { fontSize: 20, marginBottom: 6 },
    kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    kpiLabel: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },

    /* Streak */
    streakRow: { flexDirection: 'row', alignItems: 'center' },
    streakItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    streakDivider: { width: 1, height: 56, backgroundColor: '#f1f5f9' },
    streakNum: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
    streakLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
    streakMotivation: { fontSize: 13, color: '#475569', textAlign: 'center', marginTop: 12, lineHeight: 18 },

    /* Frequency */
    freqRow: { flexDirection: 'row', alignItems: 'center' },
    freqItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
    freqDivider: { width: 1, height: 56, backgroundColor: '#f1f5f9' },
    freqValue: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    freqLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },

    /* Weekly Bar Chart */
    barChartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 140, marginBottom: 8 },
    weekBarCol: { alignItems: 'center', justifyContent: 'flex-end' },
    weekBarVol: { fontSize: 9, color: '#94a3b8', fontWeight: '600', marginBottom: 3 },
    weekBarFill: { borderRadius: 4 },
    weekBarLabel: { fontSize: 9, color: '#64748b', marginTop: 4, fontWeight: '500' },
    weekBarSessions: { fontSize: 9, color: '#94a3b8', fontWeight: '600' },

    /* Chart Legend */
    chartLegendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'flex-end' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: '#64748b', fontWeight: '500', marginLeft: 4 },

    /* Volume Trend */
    trendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    trendCol: { alignItems: 'center', flex: 1 },
    trendPeriodLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginBottom: 4 },
    trendVolume: { fontSize: 22, fontWeight: '800' },
    trendBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    trendPct: { fontSize: 16, fontWeight: '800' },
    trendInsight: { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 18 },

    /* Avg Metrics */
    avgGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    avgItem: {
        width: '47%',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
    },
    avgValue: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    avgLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginTop: 2 },

    /* Personal Records */
    prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    prRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    prRankBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.primarySubtle,
        alignItems: 'center',
        justifyContent: 'center',
    },
    prRankText: { fontSize: 11, fontWeight: '800', color: colors.primary },
    prExerciseName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
    prDate: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
    prValueContainer: { alignItems: 'flex-end' },
    prWeight: { fontSize: 16, fontWeight: '800', color: colors.primary },
    prReps: { fontSize: 11, color: '#64748b', marginTop: 1 },

    /* Top Exercises */
    topExRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
    topExRank: { fontSize: 20, width: 28, textAlign: 'center' },
    topExLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    topExName: { fontSize: 13, fontWeight: '700', color: '#0f172a', flex: 1 },
    topExSets: { fontSize: 11, color: '#64748b', fontWeight: '500' },

    /* Muscle Bar Chart */
    barRow: { marginBottom: 12 },
    barLabelContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    barLabel: { fontSize: 13, fontWeight: '700', color: '#334155', textTransform: 'capitalize' },
    barValue: { fontSize: 12, color: '#64748b', fontWeight: '600' },
    barTrack: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, flexDirection: 'row', overflow: 'hidden' },
    barFillPrimary: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
    barFillSecondary: { height: '100%', backgroundColor: colors.secondaryLight },

    /* History Cards */
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardSubHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    cardStats: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cardStat: { fontSize: 12, color: '#64748b', fontWeight: '600' },
    workoutTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', flex: 1 },
    deleteButton: { padding: 4 },
    deleteIcon: { fontSize: 16 },
    dateText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
    durationBadge: {
        fontSize: 12,
        color: colors.primary,
        fontWeight: '700',
        backgroundColor: colors.primarySubtle,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    expandedDetails: { marginTop: 12 },
    divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 10 },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94a3b8',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    exerciseName: { fontSize: 13, color: '#334155', flex: 1, paddingRight: 8 },
    logDetails: { fontSize: 13, color: '#64748b' },
    bold: { fontWeight: '700', color: '#0f172a' },
});