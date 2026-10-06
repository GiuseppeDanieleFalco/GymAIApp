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
    Animated,
    Image,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { getDb } from '../database/db';
import notifee, { AndroidImportance, EventType, TriggerType } from '@notifee/react-native';
import type { TimestampTrigger } from '@notifee/react-native';
import { useActiveSessionStore, ExerciseItem } from '../store/activeSessionStore';
import { findExerciseImageUrls, IMAGE_BASE_URL } from '../services/exerciseImageLookup';

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

const parseStringArray = (value: string | null | undefined): string[] => {
    try {
        const parsed: unknown = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
};

export default function ActiveSessionScreen() {
    const route = useRoute<ActiveSessionRouteProp>();
    const navigation = useNavigation<any>();
    const { workoutId, workoutTitle } = route.params;

    const activeSessionStore = useActiveSessionStore();
    const isResumingRef = useRef(activeSessionStore.workoutId === workoutId && activeSessionStore.exercises.length > 0);

    const [exercises, setExercises] = useState<ExerciseItem[]>(isResumingRef.current ? activeSessionStore.exercises : []);
    const [elapsedSeconds, setElapsedSeconds] = useState(isResumingRef.current && activeSessionStore.startTime ? Math.floor((Date.now() - activeSessionStore.startTime) / 1000) : 0);
    const [restTimer, setRestTimer] = useState<number | null>(null);
    const [isRestModalVisible, setIsRestModalVisible] = useState(false);
    const [videoSearchQuery, setVideoSearchQuery] = useState<string | null>(null);
    const isFinishing = useRef(false);

    const appState = useRef(AppState.currentState);
    const lastBackgroundTime = useRef<number | null>(null);
    const notificationId = useRef<string | null>(null);

    // --- Animated progress bar ---
    const progressAnim = useRef(new Animated.Value(1)).current;
    const barOpacity = useRef(new Animated.Value(0)).current;
    const completionAnim = useRef(new Animated.Value(0)).current;
    const initialRestTimeRef = useRef<number>(0);
    const prevRestTimerForProgressRef = useRef<number | null>(null);
    const showRestBarRef = useRef(false);
    const [showRestBar, setShowRestBar] = useState(false);

    const showNotification = async () => {
        await notifee.displayNotification(
            {
                title: 'Recupero Terminato',
                body: 'Il tuo tempo di recupero è finito, torna ad allenarti! 💪',
                android: { channelId: 'rest-end', sound: 'default' },
            }
        );
    };

    // Richiede i permessi e crea il canale UNA SOLA VOLTA al mount,
    // così scheduleNotification può essere chiamata in modo più leggero
    // senza round-trip nativi aggiuntivi.
    useEffect(() => {
        const init = async () => {
            await notifee.requestPermission();
            await notifee.createChannel({
                id: 'rest-end',
                name: 'Recupero Terminato',
                importance: AndroidImportance.HIGH,
            });
        };
        init().catch(console.error);
    }, []);

    const cancelNotification = async () => {
        if (notificationId.current) {
            await notifee.cancelNotification(notificationId.current);
            notificationId.current = null;
        }
        await notifee.stopForegroundService().catch(() => { });
    };

    // Gestione timer in background
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                // Torniamo in foreground: annulla il trigger (l'in-app timer si occupa del resto)
                cancelNotification();

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
                // Non schedular qui: l'operazione async potrebbe non completarsi
                // prima che il thread JS venga sospeso. Il trigger viene invece
                // schedulato nel momento in cui la serie viene spuntata (foreground).
            }

            appState.current = nextAppState;
        });

        return () => {
            subscription.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    { text: 'Annulla', style: 'cancel', onPress: () => { } },
                    {
                        text: 'Esci',
                        style: 'destructive',
                        onPress: () => {
                            navigation.dispatch(e.data.action);
                            activeSessionStore.clearSession();
                        },
                    },
                ]
            );
        });

        return unsubscribe;
    }, [navigation]);

    // Teniamo il valore corrente del restTimer in un ref in modo che il
    // handler di notifee (registrato una sola volta) possa sempre leggere
    // il valore aggiornato senza dipendere da closure stantie.
    const restTimerRef = useRef<number | null>(null);
    useEffect(() => { restTimerRef.current = restTimer; }, [restTimer]);

    // Gestisce animazione della progress bar del recupero
    useEffect(() => {
        const prev = prevRestTimerForProgressRef.current;

        if (restTimer !== null && restTimer > 0) {
            if (prev === null || prev === 0) {
                // Nuovo timer avviato: fade-in + reset
                initialRestTimeRef.current = restTimer;
                progressAnim.setValue(1);
                completionAnim.setValue(0);
                showRestBarRef.current = true;
                setShowRestBar(true);
                barOpacity.setValue(0);
                Animated.timing(barOpacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: false,
                }).start();
            } else if (initialRestTimeRef.current > 0) {
                // Tick: aggiorna la barra in modo fluido
                const progress = restTimer / initialRestTimeRef.current;
                Animated.timing(progressAnim, {
                    toValue: Math.max(0, progress),
                    duration: 900,
                    useNativeDriver: false,
                }).start();
            }
        } else if (restTimer === 0 && showRestBarRef.current) {
            // Timer completato: snap a 100% verde, 3 pulse, poi fade-out
            progressAnim.setValue(1);
            completionAnim.setValue(1);
            Animated.sequence([
                Animated.timing(barOpacity, { toValue: 0.2, duration: 120, useNativeDriver: false }),
                Animated.timing(barOpacity, { toValue: 1.0, duration: 120, useNativeDriver: false }),
                Animated.timing(barOpacity, { toValue: 0.2, duration: 120, useNativeDriver: false }),
                Animated.timing(barOpacity, { toValue: 1.0, duration: 120, useNativeDriver: false }),
                Animated.timing(barOpacity, { toValue: 0.2, duration: 120, useNativeDriver: false }),
                Animated.timing(barOpacity, { toValue: 1.0, duration: 120, useNativeDriver: false }),
                Animated.timing(barOpacity, { toValue: 0, duration: 600, useNativeDriver: false }),
            ]).start(() => {
                showRestBarRef.current = false;
                setShowRestBar(false);
            });
        }

        prevRestTimerForProgressRef.current = restTimer;
    }, [restTimer]);

    const add30s = () => {
        const newTime = (restTimerRef.current || 0) + 30;
        setRestTimer(newTime);
    };

    // Registra il listener UNA SOLA VOLTA e lo rimuove allo smontaggio
    useEffect(() => {
        const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
            // Se il trigger 'rest-end' viene consegnato mentre l'app è in foreground,
            // lo cancelliamo subito: in-app timer + vibrazione gestiscono già la fine.
            if (type === EventType.DELIVERED &&
                detail.notification?.id &&
                detail.notification.id === notificationId.current) {
                await notifee.cancelNotification(detail.notification.id);
                notificationId.current = null;
                return;
            }

            if (type === EventType.ACTION_PRESS && detail?.pressAction?.id) {
                switch (detail.pressAction.id) {
                    case 'REST_TIMER_ADD_30S':
                        add30s();
                        break;
                    case 'REST_TIMER_STOP':
                        jumpTimer();
                        break;
                }
            }
        });
        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const jumpTimer = () => {
        setRestTimer(0);
        setIsRestModalVisible(false);
        cancelNotification();
    };

    // Timer Sessione Complessiva
    useEffect(() => {
        const timer = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Aggiorna la notifica foreground in tempo reale
    useEffect(() => {
        if (restTimer !== null && restTimer > 0) {
            const updateNotification = async () => {
                try {
                    const channelId = await notifee.createChannel({
                        id: 'timer',
                        name: 'Timer Recupero',
                        importance: AndroidImportance.LOW,
                    });
                    const min = Math.floor(restTimer / 60);
                    const sec = restTimer % 60;
                    const formatted = `${min}:${sec.toString().padStart(2, '0')}`;

                    await notifee.displayNotification({
                        id: 'rest-timer',
                        title: '⏳ Recupero in corso',
                        body: `Tempo rimanente: ${formatted}`,
                        android: {
                            channelId,
                            asForegroundService: true,
                            ongoing: true,
                            color: '#3498db',
                            actions: [
                                { title: '+30s', pressAction: { id: 'REST_TIMER_ADD_30S', launchActivity: 'default', } },
                                { title: 'Stop', pressAction: { id: 'REST_TIMER_STOP', launchActivity: 'default', } }
                            ],
                        },
                    });
                } catch (e) {
                    console.log('Errore Notifee:', e);
                }
            };
            updateNotification();
        } else if (restTimer === 0) {
            notifee.stopForegroundService().catch(() => { });
        }
    }, [restTimer]);

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
                    showNotification();
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
            if (isResumingRef.current) return; // Se stiamo riprendendo una sessione, usa i dati dello store

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
                const mapped: ExerciseItem[] = await Promise.all(rows.map(async (ex) => {
                    const exerciseSetsLogs = lastSetLogs.filter(
                        (log) => log.exercise_id === ex.id
                    );

                    // Cerca tutte le immagini reali nel free-exercise-db
                    const imagePaths = parseStringArray(ex.images);
                    const imageUrls = imagePaths.length > 0
                        ? imagePaths.map((path) => `${IMAGE_BASE_URL}${path}`)
                        : await findExerciseImageUrls(ex.exercise_name);
                    if (imageUrls.length === 0 && ex.image_url) imageUrls.push(ex.image_url);

                    return {
                        id: ex.id,
                        exercise_name: ex.exercise_name,
                        target_sets: ex.target_sets || 3,
                        target_reps: ex.target_reps || '10',
                        rest_seconds: ex.rest_seconds || 60,
                        image_url: imageUrls[0],
                        image_urls: imageUrls,
                        equipment: ex.equipment ?? null,
                        primaryMuscles: parseStringArray(ex.primary_muscles),
                        secondaryMuscles: parseStringArray(ex.secondary_muscles),
                        instructions: parseStringArray(ex.instructions),
                        force: ex.force ?? null,
                        mechanic: ex.mechanic ?? null,
                        category: ex.category ?? null,
                        level: ex.level ?? null,
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
                }));

                setExercises(mapped);
            } catch (error) {
                console.error('Errore caricamento esercizi e pesi precedenti:', error);
            }
        };

        loadExercises();
    }, [workoutId]);

    // Salva le modifiche allo store ogni volta che 'exercises' cambia
    useEffect(() => {
        if (exercises.length > 0) {
            if (activeSessionStore.workoutId !== workoutId) {
                const start = Date.now() - (elapsedSeconds * 1000);
                activeSessionStore.setSession(workoutId, workoutTitle, exercises, start);
            } else {
                activeSessionStore.updateExerciseSets(exercises);
            }
        }
    }, [exercises]);

    const toggleSetComplete = (exIndex: number, setIndex: number) => {
        const updated = [...exercises];
        const currentSet = updated[exIndex].sets[setIndex];
        currentSet.completed = !currentSet.completed;

        if (currentSet.completed) {
            // Avvia timer di recupero e schedula il trigger SUBITO in foreground
            // (scheduling asincrono durante la transizione background sarebbe inaffidabile)
            const rest = updated[exIndex].rest_seconds;
            setRestTimer(rest);
            setIsRestModalVisible(true);
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
                                        `INSERT INTO set_logs
                                         (id, session_id, exercise_id, set_number, reps_completed, weight_kg, completed, primary_muscles, secondary_muscles)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                                        [
                                            setId,
                                            sessionId,
                                            ex.id || '',
                                            s.setNumber || 1,
                                            repsVal,
                                            weightVal,
                                            s.completed ? 1 : 0,
                                            JSON.stringify(ex.primaryMuscles ?? []),
                                            JSON.stringify(ex.secondaryMuscles ?? []),
                                        ]
                                    );
                                }
                            }
                        }

                        isFinishing.current = true;
                        activeSessionStore.clearSession(); // Pulisce lo store dopo il salvataggio

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
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                {/* Header con Timer Complessivo e Progress Bar Recupero */}
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <View>
                            <Text style={styles.title}>{workoutTitle}</Text>
                            <Text style={styles.timerText}>
                                ⏱ Tempo: {formatTime(elapsedSeconds)}
                            </Text>
                        </View>
                        {showRestBar && (
                            <Animated.View style={[styles.restInfo, { opacity: barOpacity }]}>
                                <Text style={styles.restLabel}>Recupero</Text>
                                <Text style={styles.restTime}>{formatTime(restTimer || 0)}</Text>
                            </Animated.View>
                        )}
                    </View>
                    {showRestBar && (
                        <Animated.View style={[styles.restProgressTrack, { opacity: barOpacity }]}>
                            <Animated.View
                                style={[
                                    styles.restProgressFill,
                                    {
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['0%', '100%'],
                                        }),
                                        backgroundColor: completionAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: ['#007AFF', '#34C759'],
                                        }),
                                    },
                                ]}
                            />
                        </Animated.View>
                    )}
                </View>

                <ScrollView style={styles.content}>
                    {exercises.map((ex, exIdx) => (
                        <View key={ex.id} style={styles.exerciseCard}>
                            <View style={styles.exerciseHeaderRow}>
                                <Text style={styles.exerciseName}>{ex.exercise_name}</Text>
                                <TouchableOpacity
                                    style={styles.videoBtn}
                                    onPress={() => setVideoSearchQuery(ex.exercise_name)}
                                >
                                    <Text style={styles.videoBtnText}>▶ Video</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.exerciseInfo}>
                                Target: {ex.target_sets} serie x {ex.target_reps} reps | Rest: {ex.rest_seconds}s
                            </Text>

                            {/* Immagini esercizio: start + end position affiancate */}
                            {ex.image_urls && ex.image_urls.length > 0 ? (
                                <View style={styles.exerciseImagesRow}>
                                    {ex.image_urls.map((url, imgIdx) => (
                                        <Image
                                            key={imgIdx}
                                            source={{ uri: url }}
                                            style={[
                                                styles.exerciseImageThumb,
                                                ex.image_urls!.length === 1 && styles.exerciseImageFull,
                                            ]}
                                            resizeMode="contain"
                                        />
                                    ))}
                                </View>
                            ) : null}

                            {(ex.primaryMuscles?.length || ex.secondaryMuscles?.length) ? (
                                <Text style={styles.exerciseInfo}>
                                    Muscoli principali: {ex.primaryMuscles?.join(', ') || 'Nessuno'}
                                    {ex.secondaryMuscles?.length ? ` | Secondari: ${ex.secondaryMuscles.join(', ')}` : ''}
                                </Text>
                            ) : null}

                            {ex.instructions && ex.instructions.length > 0 && (
                                <View style={styles.instructionsBlock}>
                                    <Text style={styles.instructionsTitle}>Istruzioni</Text>
                                    {ex.instructions.map((instruction, index) => (
                                        <Text key={`${ex.id}-instruction-${index}`} style={styles.instructionText}>
                                            {index + 1}. {instruction}
                                        </Text>
                                    ))}
                                </View>
                            )}

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
            </KeyboardAvoidingView>

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
                            onPress={add30s}
                        >
                            <Text style={styles.restModalButtonText}>+30s</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.restModalButton, styles.restModalButtonSkip]}
                            onPress={jumpTimer}
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
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f4f4f6' },
    header: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 0,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 12,
    },
    title: { fontSize: 18, fontWeight: 'bold', color: '#1c1c1e' },
    timerText: { fontSize: 14, color: '#007AFF', fontWeight: '600', marginTop: 4 },
    restInfo: { alignItems: 'flex-end' },
    restLabel: { color: '#8e8e93', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    restTime: { color: '#007AFF', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
    restProgressTrack: {
        height: 7,
        backgroundColor: '#e5e5ea',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 12,
    },
    restProgressFill: {
        height: 7,
        borderRadius: 4,
    },
    content: { flex: 1, padding: 16 },
    exerciseCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        elevation: 2,
    },
    exerciseHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    exerciseName: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', flex: 1 },
    videoBtn: {
        backgroundColor: '#ff0000',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    videoBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    exerciseImage: {
        width: '100%',
        height: 200,
        borderRadius: 8,
        marginBottom: 12,
        backgroundColor: '#f9f9f9',
    },
    exerciseImagesRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 12,
    },
    exerciseImageThumb: {
        flex: 1,
        height: 160,
        borderRadius: 8,
        backgroundColor: '#f0f0f0',
    },
    exerciseImageFull: {
        height: 200,
    },
    exerciseInfo: { fontSize: 12, color: '#7f8c8d', marginBottom: 12 },
    instructionsBlock: { marginBottom: 12 },
    instructionsTitle: { fontSize: 13, fontWeight: '700', color: '#2c3e50', marginBottom: 4 },
    instructionText: { fontSize: 12, color: '#555', lineHeight: 18, marginBottom: 3 },
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