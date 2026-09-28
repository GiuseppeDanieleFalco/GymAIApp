import React, { useEffect, useState, useRef } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Alert,
    Modal,
    AppState,
    Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { getDb } from '../database/db';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type RootStackParamList = {
    ActiveSession: { workoutId: string; workoutTitle: string };
};

type ActiveSessionRouteProp = RouteProp<RootStackParamList, 'ActiveSession'>;

interface SetInput {
    setNumber: number;
    reps: string;
    weightKg: string;
    completed: boolean;
}

interface ExerciseItem {
    id: string;
    exercise_name: string;
    target_sets: number;
    target_reps: string;
    rest_seconds: number;
    sets: SetInput[];
}

export default function ActiveSessionScreen() {
    const route = useRoute<ActiveSessionRouteProp>();
    const navigation = useNavigation<any>();
    const { workoutId, workoutTitle } = route.params;

    const [exercises, setExercises] = useState<ExerciseItem[]>([]);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [restTimer, setRestTimer] = useState<number | null>(null);
    const [isRestModalVisible, setIsRestModalVisible] = useState(false);
    const isFinishing = useRef(false);
    
    const appState = useRef(AppState.currentState);
    const lastBackgroundTime = useRef<number | null>(null);
    const notificationId = useRef<string | null>(null);

    const scheduleNotification = async (seconds: number) => {
        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
            const { status: newStatus } = await Notifications.requestPermissionsAsync();
            finalStatus = newStatus;
        }
        if (finalStatus !== 'granted') return;

        if (notificationId.current) {
            await Notifications.cancelScheduledNotificationAsync(notificationId.current);
        }

        const id = await Notifications.scheduleNotificationAsync({
            content: {
                title: "Recupero Terminato",
                body: "Il tuo tempo di recupero è finito, torna ad allenarti! 💪",
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds,
            },
        });
        notificationId.current = id;
    };

    const cancelNotification = async () => {
        if (notificationId.current) {
            await Notifications.cancelScheduledNotificationAsync(notificationId.current);
            notificationId.current = null;
        }
    };

    // Gestione timer in background
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                if (lastBackgroundTime.current !== null) {
                    const now = Date.now();
                    const diffSeconds = Math.floor((now - lastBackgroundTime.current) / 1000);
                    
                    if (diffSeconds > 0) {
                        setElapsedSeconds(prev => prev + diffSeconds);
                        
                        setRestTimer(prev => {
                            if (prev !== null && prev > 0) {
                                const newRestTime = prev - diffSeconds;
                                if (newRestTime <= 0) {
                                    Vibration.vibrate();
                                    Alert.alert('Recupero Finito', 'Il tempo di recupero è terminato!');
                                    setIsRestModalVisible(false);
                                    cancelNotification();
                                    return 0;
                                }
                                return newRestTime;
                            }
                            return prev;
                        });
                    }
                }
            } else if (nextAppState.match(/inactive|background/)) {
                lastBackgroundTime.current = Date.now();
            }

            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
    }, []);

    // Gestione uscita accidentale dalla schermata
    useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
            if (isFinishing.current) {
                // Se stiamo uscendo volontariamente al termine dell'allenamento
                return;
            }

            e.preventDefault();

            Alert.alert(
                'Abbandonare l\'allenamento?',
                'Sei sicuro di voler uscire? I progressi non salvati andranno persi.',
                [
                    { text: 'Annulla', style: 'cancel', onPress: () => {} },
                    {
                        text: 'Esci',
                        style: 'destructive',
                        onPress: () => {
                            navigation.dispatch(e.data.action);
                        },
                    },
                ]
            );
        });

        return unsubscribe;
    }, [navigation]);

    // Timer Sessione Complessiva
    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Timer Recupero
    useEffect(() => {
        if (restTimer === null || restTimer <= 0) return;
        const interval = setInterval(() => {
            setRestTimer((prev) => {
                if (prev !== null && prev > 1) {
                    return prev - 1;
                } else {
                    // Timer finito
                    Vibration.vibrate();
                    setIsRestModalVisible(false);
                    cancelNotification();
                    return 0;
                }
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [restTimer]);

    // Caricamento Esercizi della scheda
    // Caricamento Esercizi con precompilazione degli ultimi pesi usati
    useEffect(() => {
        const loadExercises = async () => {
            try {
                const db = await getDb();

                // 1. Recupera l'ID dell'ultima sessione eseguita per questa scheda
                const lastSession: any = await db.getFirstAsync(
                    `SELECT id FROM workout_logs WHERE workout_id = ? ORDER BY completed_at DESC LIMIT 1;`,
                    [workoutId]
                );

                const lastSessionId = lastSession?.id || null;

                // 2. Carica gli esercizi del workout
                const rows: any[] = await db.getAllAsync(
                    'SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY order_index ASC;',
                    [workoutId]
                );

                // 3. Se esiste una sessione precedente, recupera tutti i set salvati
                let lastSetLogs: any[] = [];
                if (lastSessionId) {
                    lastSetLogs = await db.getAllAsync(
                        'SELECT * FROM set_logs WHERE session_id = ?;',
                        [lastSessionId]
                    );
                }

                // 4. Mappa gli esercizi inserendo il peso dell'ultima sessione se presente
                const mapped: ExerciseItem[] = rows.map((ex) => {
                    const exerciseSetsLogs = lastSetLogs.filter(
                        (log) => log.exercise_id === ex.id
                    );

                    return {
                        id: ex.id,
                        exercise_name: ex.exercise_name,
                        target_sets: ex.target_sets || 3,
                        target_reps: ex.target_reps || '10',
                        rest_seconds: ex.rest_seconds || 60,
                        sets: Array.from({ length: ex.target_sets || 3 }, (_, i) => {
                            const setNum = i + 1;
                            // Trova il log della specifica serie dell'ultima volta
                            const previousSetLog = exerciseSetsLogs.find(
                                (log) => log.set_number === setNum
                            );

                            return {
                                setNumber: setNum,
                                reps: ex.target_reps || '10',
                                // Se esiste un peso salvato in precedenza lo usa, altrimenti "0"
                                weightKg: previousSetLog ? String(previousSetLog.weight_kg) : '0',
                                completed: false,
                            };
                        }),
                    };
                });

                setExercises(mapped);
            } catch (error) {
                console.error('Errore caricamento esercizi e pesi precedenti:', error);
            }
        };

        loadExercises();
    }, [workoutId]);

    const toggleSetComplete = (exIndex: number, setIndex: number) => {
        const updated = [...exercises];
        const currentSet = updated[exIndex].sets[setIndex];
        currentSet.completed = !currentSet.completed;

        if (currentSet.completed) {
            // Avvia timer di recupero previsto per l'esercizio
            const rest = updated[exIndex].rest_seconds;
            setRestTimer(rest);
            setIsRestModalVisible(true);
            scheduleNotification(rest);
        }

        setExercises(updated);
    };

    const updateSetData = (
        exIndex: number,
        setIndex: number,
        field: 'reps' | 'weightKg',
        val: string
    ) => {
        const updated = [...exercises];
        updated[exIndex].sets[setIndex][field] = val;
        setExercises(updated);
    };

    const handleFinishWorkout = async () => {
        // Conta quante serie sono state effettivamente completate
        const completedSetsCount = exercises.reduce(
            (total, ex) => total + ex.sets.filter((s) => s.completed).length,
            0
        );

        const alertTitle = completedSetsCount === 0
            ? 'Terminare senza completare?'
            : 'Concludi Allenamento';

        const alertMessage = completedSetsCount === 0
            ? 'Non hai spuntato alcuna serie. Vuoi registrare comunque la sessione?'
            : `Hai completato ${completedSetsCount} serie. Vuoi salvare i progressi di questa sessione?`;

        Alert.alert(alertTitle, alertMessage, [
            { text: 'Annulla', style: 'cancel' },
            {
                text: 'Salva e Termina',
                onPress: async () => {
                    try {
                        const db = await getDb();
                        const sessionId = `session_${Date.now()}`;
                        const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
                        const completedAt = new Date().toISOString();

                        // 1. Assicuriamo l'esistenza delle tabelle (ora gestito in db.ts)

                        // 2. Inseriamo la sessione (anche se parziale)
                        await db.runAsync(
                            `INSERT INTO workout_logs (id, workout_id, duration_minutes, completed_at) VALUES (?, ?, ?, ?);`,
                            [sessionId, workoutId || '', durationMinutes, completedAt]
                        );

                        // 3. Inseriamo sia le serie spuntate (completed = true), 
                        // sia eventuali serie parziali in cui l'utente ha comunque scritto un peso o delle ripetizioni
                        for (const ex of exercises) {
                            for (const s of ex.sets) {
                                const parsedReps = parseInt(s.reps, 10);
                                const repsVal = isNaN(parsedReps) ? 0 : parsedReps;

                                const parsedWeight = parseFloat(s.weightKg.replace(',', '.'));
                                const weightVal = isNaN(parsedWeight) ? 0 : parsedWeight;

                                // Salva se la serie è spuntata OPPURE se l'utente ha inserito dei dati (peso > 0 o reps > 0)
                                const shouldSaveSet = s.completed || repsVal > 0 || weightVal > 0;

                                if (shouldSaveSet) {
                                    const setId = `set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

                                    await db.runAsync(
                                        `INSERT INTO set_logs (id, session_id, exercise_id, set_number, reps_completed, weight_kg) VALUES (?, ?, ?, ?, ?, ?);`,
                                        [
                                            setId,
                                            sessionId,
                                            ex.id || '',
                                            s.setNumber || 1,
                                            repsVal,
                                            weightVal,
                                        ]
                                    );
                                }
                            }
                        }

                        isFinishing.current = true;

                        Alert.alert('Allenamento Concluso! 💪', 'Sessione salvata nello storico.', [
                            { text: 'OK', onPress: () => navigation.navigate('WorkoutsList') },
                        ]);
                    } catch (error) {
                        console.error('Errore durante il salvataggio della sessione:', error);
                        Alert.alert('Errore', 'Impossibile salvare i dati della sessione.');
                    }
                },
            },
        ]);
    };

    const formatTime = (secs: number) => {
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header con Timer Complessivo e Timer Recupero */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>{workoutTitle}</Text>
                    <Text style={styles.timerText}>
                        ⏱ Tempo: {formatTime(elapsedSeconds)}
                    </Text>
                </View>
                {restTimer !== null && (
                    <View style={styles.restBadge}>
                        <Text style={styles.restLabel}>Recupero</Text>
                        <Text style={styles.restTime}>{formatTime(restTimer)}</Text>
                    </View>
                )}
            </View>

            <ScrollView style={styles.content}>
                {exercises.map((ex, exIdx) => (
                    <View key={ex.id} style={styles.exerciseCard}>
                        <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                        <Text style={styles.exerciseInfo}>
                            Target: {ex.target_sets} serie x {ex.target_reps} reps | Rest: {ex.rest_seconds}s
                        </Text>

                        {/* Intestazione Tabella Serie */}
                        <View style={styles.tableHeader}>
                            <Text style={[styles.colHeader, { width: 50 }]}>Serie</Text>
                            <Text style={[styles.colHeader, { flex: 1 }]}>Kg</Text>
                            <Text style={[styles.colHeader, { flex: 1 }]}>Reps</Text>
                            <Text style={[styles.colHeader, { width: 60, textAlign: 'center' }]}>Fatto</Text>
                        </View>

                        {/* Righe Serie */}
                        {ex.sets.map((s, setIdx) => (
                            <View
                                key={setIdx}
                                style={[
                                    styles.setRow,
                                    s.completed && styles.setRowCompleted,
                                ]}
                            >
                                <Text style={styles.setNumber}>#{s.setNumber}</Text>
                                <TextInput
                                    style={styles.input}
                                    keyboardType="numeric"
                                    value={s.weightKg}
                                    onChangeText={(val) => updateSetData(exIdx, setIdx, 'weightKg', val)}
                                />
                                <TextInput
                                    style={styles.input}
                                    keyboardType="numeric"
                                    value={s.reps}
                                    onChangeText={(val) => updateSetData(exIdx, setIdx, 'reps', val)}
                                />
                                <TouchableOpacity
                                    style={[styles.checkBtn, s.completed && styles.checkBtnActive]}
                                    onPress={() => toggleSetComplete(exIdx, setIdx)}
                                >
                                    <Text style={styles.checkBtnText}>{s.completed ? '✓' : ''}</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                ))}
            </ScrollView>

            {/* Pulsante di fine sessione */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.finishButton} onPress={handleFinishWorkout}>
                    <Text style={styles.finishButtonText}>Termina e Salva Allenamento</Text>
                </TouchableOpacity>
            </View>

            {/* Modale Timer Recupero Full Screen */}
            <Modal
                visible={isRestModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setIsRestModalVisible(false)}
            >
                <View style={styles.restModalContainer}>
                    <Text style={styles.restModalTitle}>Recupero</Text>
                    <Text style={styles.restModalTime}>{formatTime(restTimer || 0)}</Text>
                    
                    <View style={styles.restModalActions}>
                        <TouchableOpacity 
                            style={styles.restModalButton}
                            onPress={() => setRestTimer(prev => {
                                const newTime = (prev || 0) + 30;
                                scheduleNotification(newTime);
                                return newTime;
                            })}
                        >
                            <Text style={styles.restModalButtonText}>+30s</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={[styles.restModalButton, styles.restModalButtonSkip]}
                            onPress={() => {
                                setRestTimer(0);
                                setIsRestModalVisible(false);
                                cancelNotification();
                            }}
                        >
                            <Text style={styles.restModalButtonText}>Salta</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        style={styles.restModalCloseBtn}
                        onPress={() => setIsRestModalVisible(false)}
                    >
                        <Text style={styles.restModalCloseText}>Riduci in background</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f4f6' },
    header: {
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: { fontSize: 18, fontWeight: 'bold', color: '#1c1c1e' },
    timerText: { fontSize: 14, color: '#007AFF', fontWeight: '600', marginTop: 4 },
    restBadge: {
        backgroundColor: '#34C759',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        alignItems: 'center',
    },
    restLabel: { color: '#fff', fontSize: 10, textTransform: 'uppercase' },
    restTime: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    content: { flex: 1, padding: 16 },
    exerciseCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        elevation: 2,
    },
    exerciseName: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' },
    exerciseInfo: { fontSize: 12, color: '#7f8c8d', marginBottom: 12 },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#eee',
        paddingBottom: 6,
        marginBottom: 8,
    },
    colHeader: { fontSize: 12, fontWeight: '600', color: '#8e8e93' },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        paddingVertical: 4,
    },
    setRowCompleted: { backgroundColor: '#e8f5e9', borderRadius: 6 },
    setNumber: { width: 50, fontWeight: '600', color: '#555' },
    input: {
        flex: 1,
        backgroundColor: '#f0f0f5',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginHorizontal: 4,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    checkBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: '#c7c7cc',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    checkBtnActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
    checkBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee' },
    finishButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    finishButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    restModalContainer: {
        flex: 1,
        backgroundColor: '#1c1c1e',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    restModalTitle: {
        color: '#fff',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 40,
    },
    restModalTime: {
        color: '#34C759',
        fontSize: 96,
        fontWeight: 'bold',
        fontVariant: ['tabular-nums'],
        marginBottom: 60,
    },
    restModalActions: {
        flexDirection: 'row',
        marginBottom: 40,
    },
    restModalButton: {
        backgroundColor: '#333',
        paddingVertical: 14,
        paddingHorizontal: 28,
        borderRadius: 12,
        marginHorizontal: 10,
    },
    restModalButtonSkip: {
        backgroundColor: '#ff3b30',
    },
    restModalButtonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '600',
    },
    restModalCloseBtn: {
        marginTop: 20,
        padding: 12,
    },
    restModalCloseText: {
        color: '#0a84ff',
        fontSize: 18,
    },
});