import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AIWorkoutInput } from '../types/workout';
import { generateWorkoutPlan, saveAIGeneratedPlanToDb } from '../services/aiGenerator';
import { getAllGroups, createGroup, WorkoutGroup } from '../database/groupQueries';

// Opzioni predefinite per la form
const EQUIPMENT_OPTIONS = [
    'Manubri',
    'Bilanciere',
    'Panca Piana',
    'Panca Inclinata',
    'Cavi',
    'Sbarra Trazioni',
    'Kettlebell',
    'Macchine Isotoniche',
    'Corpolibero',
];

const GOAL_OPTIONS: { label: string; value: AIWorkoutInput['goals'] }[] = [
    { label: 'Ipertrofia (Massa)', value: 'hypertrophy' },
    { label: 'Forza', value: 'strength' },
    { label: 'Resistenza', value: 'endurance' },
    { label: 'Ricondizionamento', value: 'reconditioning' },
];

const EXPERIENCE_OPTIONS: { label: string; value: AIWorkoutInput['experienceLevel'] }[] = [
    { label: 'Principiante', value: 'beginner' },
    { label: 'Intermedio', value: 'intermediate' },
    { label: 'Avanzato', value: 'advanced' },
];

export default function GenerateWorkoutScreen({ navigation }: any) {
    const [weightKg, setWeightKg] = useState<string>('75');
    const [experienceLevel, setExperienceLevel] = useState<AIWorkoutInput['experienceLevel']>('intermediate');
    const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
    const [sessionDurationMin, setSessionDurationMin] = useState<number>(60);
    const [goals, setGoals] = useState<AIWorkoutInput['goals']>('hypertrophy');
    const [selectedEquipment, setSelectedEquipment] = useState<string[]>([
        'Manubri',
        'Bilanciere',
        'Panca Piana',
    ]);
    const [physicalLimitations, setPhysicalLimitations] = useState<string>('');
    const [pastNotes, setPastNotes] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [groups, setGroups] = useState<WorkoutGroup[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);


    useEffect(() => {
        const loadGroups = async () => {
            const allGroups = await getAllGroups();
            setGroups(allGroups);
        };
        loadGroups();
    }, []);

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

    // Toggle selezione attrezzatura
    const toggleEquipment = (item: string) => {
        if (selectedEquipment.includes(item)) {
            setSelectedEquipment(selectedEquipment.filter((e) => e !== item));
        } else {
            setSelectedEquipment([...selectedEquipment, item]);
        }
    };

    // Handler Invio Form
    const handleGenerate = async () => {
        if (!weightKg || isNaN(Number(weightKg))) {
            Alert.alert('Attenzione', 'Inserisci un peso corporeo valido.');
            return;
        }

        if (selectedEquipment.length === 0) {
            Alert.alert('Attenzione', 'Seleziona almeno un attrezzo disponibile.');
            return;
        }

        const payload: AIWorkoutInput = {
            weightKg: Number(weightKg),
            experienceLevel,
            daysPerWeek,
            sessionDurationMin,
            goals,
            availableEquipment: selectedEquipment,
            physicalLimitations: physicalLimitations.trim() || undefined,
            pastWorkoutNotes: pastNotes.trim() || undefined,
        };

        setIsLoading(true);

        try {
            let newGroupId = selectedGroupId;
            // Se gruppo non selezionato crea gruppo di default
            if (!selectedGroupId) {
                newGroupId = await createDefaultGroup();
            } else newGroupId = selectedGroupId;

            // 1. Genera la scheda via IA
            const generatedPlan = await generateWorkoutPlan(payload);

            // 2. Salva la scheda nel DB locale SQLite (con gruppo opzionale)
            await saveAIGeneratedPlanToDb(generatedPlan, newGroupId);

            setIsLoading(false);

            Alert.alert(
                'Scheda Generata!',
                `Creata con successo: ${generatedPlan.workout_title}.\n\nDisclaimer: ${generatedPlan.disclaimer}`,
                [
                    {
                        text: 'OK / Vai alle Schede',
                        onPress: () => navigation.navigate('WorkoutsList'),
                    },
                ]
            );
        } catch (error) {
            setIsLoading(false);
            console.error(error);
            const errorText = typeof (error) === "string" ? error : "";
            Alert.alert(
                'Errore',
                'Impossibile generare la scheda al momento. Riprova più tardi o verifica la connessione.'

            );
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Generatore Scheda AI</Text>
                <Text style={styles.subtitle}>
                    Configura i tuoi parametri per strutturare un piano di auto-allenamento personalizzato.
                </Text>

                {/* --- 1. DATI FISICI & LIVELLO --- */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Informazioni Generali</Text>

                    <View style={styles.row}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={styles.label}>Peso (kg)</Text>
                            <TextInput
                                style={styles.input}
                                keyboardType="numeric"
                                value={weightKg}
                                onChangeText={setWeightKg}
                                placeholder="es. 75"
                            />
                        </View>

                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>Durata Sessione (min)</Text>
                            <TextInput
                                style={styles.input}
                                keyboardType="numeric"
                                value={String(sessionDurationMin)}
                                onChangeText={(val) => setSessionDurationMin(Number(val))}
                                placeholder="es. 60"
                            />
                        </View>
                    </View>

                    <Text style={styles.label}>Livello di Esperienza</Text>
                    <View style={styles.chipGroup}>
                        {EXPERIENCE_OPTIONS.map((opt) => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[styles.chip, experienceLevel === opt.value && styles.chipSelected]}
                                onPress={() => setExperienceLevel(opt.value)}
                            >
                                <Text style={[styles.chipText, experienceLevel === opt.value && styles.chipTextSelected]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* --- 2. OBIETTIVO E GIORNI --- */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>2. Obiettivo & Frequenza</Text>

                    <Text style={styles.label}>Giorni di Allenamento a Settimana</Text>
                    <View style={styles.chipGroup}>
                        {[2, 3, 4, 5, 6].map((num) => (
                            <TouchableOpacity
                                key={num}
                                style={[styles.chipNumber, daysPerWeek === num && styles.chipSelected]}
                                onPress={() => setDaysPerWeek(num)}
                            >
                                <Text style={[styles.chipText, daysPerWeek === num && styles.chipTextSelected]}>
                                    {num} gg
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.label}>Obiettivo Principale</Text>
                    <View style={styles.chipGroup}>
                        {GOAL_OPTIONS.map((opt) => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[styles.chip, goals === opt.value && styles.chipSelected]}
                                onPress={() => setGoals(opt.value)}
                            >
                                <Text style={[styles.chipText, goals === opt.value && styles.chipTextSelected]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* --- 3. ATTREZZATURA DISPONIBILE --- */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>3. Attrezzatura Disponibile</Text>
                    <Text style={styles.subLabel}>Seleziona ciò a cui hai accesso nella tua struttura o a casa.</Text>

                    <View style={styles.chipGroup}>
                        {EQUIPMENT_OPTIONS.map((item) => {
                            const isSelected = selectedEquipment.includes(item);
                            return (
                                <TouchableOpacity
                                    key={item}
                                    style={[styles.chip, isSelected && styles.chipSelected]}
                                    onPress={() => toggleEquipment(item)}
                                >
                                    <Ionicons
                                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                                        size={16}
                                        color={isSelected ? '#FFF' : '#666'}
                                        style={{ marginRight: 6 }}
                                    />
                                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* --- 4. LIMITAZIONI & STORICO --- */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>4. Personalizzazione Avanzata</Text>

                    <Text style={styles.label}>Limitazioni Fisiche / Fastidi Noti</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        multiline
                        numberOfLines={2}
                        placeholder="es. Evitare carico assiale sulla colonna, fastidio alla spalla destra"
                        value={physicalLimitations}
                        onChangeText={setPhysicalLimitations}
                    />

                    <Text style={styles.label}>Note e Schede Passate</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        multiline
                        numberOfLines={2}
                        placeholder="es. Mi sono trovato bene con la multifrequenza Upper/Lower"
                        value={pastNotes}
                        onChangeText={setPastNotes}
                    />
                </View>

                {/* --- 5. GRUPPO --- */}
                {groups.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>5. Assegna a un Gruppo</Text>
                        <Text style={styles.subLabel}>Opzionale — organizza le schede generate in un gruppo.</Text>
                        <View style={styles.chipGroup}>
                            <TouchableOpacity
                                style={[styles.chip, selectedGroupId === null && styles.chipSelected]}
                                onPress={() => setSelectedGroupId(null)}
                            >
                                <Text style={[styles.chipText, selectedGroupId === null && styles.chipTextSelected]}>
                                    Crea nuovo
                                </Text>
                            </TouchableOpacity>
                            {groups.map((g) => (
                                <TouchableOpacity
                                    key={g.id}
                                    style={[
                                        styles.chip,
                                        selectedGroupId === g.id && styles.chipSelected,
                                        selectedGroupId === g.id && { backgroundColor: g.color, borderColor: g.color },
                                    ]}
                                    onPress={() => setSelectedGroupId(g.id)}
                                >
                                    <View style={[
                                        styles.groupDot,
                                        { backgroundColor: selectedGroupId === g.id ? '#fff' : g.color },
                                    ]} />
                                    <Text style={[styles.chipText, selectedGroupId === g.id && styles.chipTextSelected]}>
                                        {g.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* --- DISCLAIMER LEGALE --- */}
                <View style={styles.disclaimerBox}>
                    <Ionicons name="warning-outline" size={20} color="#D97706" style={{ marginRight: 8 }} />
                    <Text style={styles.disclaimerText}>
                        L'app opera come diario di auto-allenamento. Le schede generate sono algoritmi assistitivi e non sostituiscono il parere di un personal trainer o di un medico.
                    </Text>
                </View>

                {/* --- BOTTONE GENERAZIONE --- */}
                <TouchableOpacity
                    style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                    onPress={handleGenerate}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={20} color="#FFF" style={{ marginRight: 8 }} />
                            <Text style={styles.submitButtonText}>Genera Scheda con IA</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#0F172A',
    },
    subtitle: {
        fontSize: 14,
        color: '#64748B',
        marginTop: 4,
        marginBottom: 20,
    },
    section: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1E293B',
        marginBottom: 12,
    },
    row: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    label: {
        fontSize: 13,
        fontWeight: '500',
        color: '#475569',
        marginBottom: 6,
        marginTop: 6,
    },
    subLabel: {
        fontSize: 12,
        color: '#94A3B8',
        marginBottom: 10,
    },
    input: {
        backgroundColor: '#F1F5F9',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: '#0F172A',
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    textArea: {
        height: 60,
        textAlignVertical: 'top',
    },
    chipGroup: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    chipNumber: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#CBD5E1',
    },
    chipSelected: {
        backgroundColor: '#60A0EA',
        borderColor: '#60A0EA',
    },
    chipText: {
        fontSize: 13,
        color: '#334155',
    },
    chipTextSelected: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    disclaimerBox: {
        flexDirection: 'row',
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#FCD34D',
    },
    disclaimerText: {
        flex: 1,
        fontSize: 12,
        color: '#92400E',
        lineHeight: 16,
    },
    submitButton: {
        flexDirection: 'row',
        backgroundColor: '#2563EB',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonDisabled: {
        backgroundColor: '#93C5FD',
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    groupDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
});