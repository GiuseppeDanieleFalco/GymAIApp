import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, SectionList, TouchableOpacity,
    Alert, RefreshControl, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getAllWorkouts, WorkoutItem } from '../database/workoutQueries';
import { getAllGroups, assignWorkoutToGroup, WorkoutGroup } from '../database/groupQueries';
import { getDb } from '../database/db';

type WorkoutSection = {
    groupId: string | null;
    title: string;
    color: string;
    data: WorkoutItem[];
};

export default function WorkoutsListScreen({ navigation }: any) {
    const [workouts, setWorkouts] = useState<WorkoutItem[]>([]);
    const [groups, setGroups] = useState<WorkoutGroup[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [assignTarget, setAssignTarget] = useState<WorkoutItem | null>(null);
    const [toShow, setToShow] = useState<string[]>([]);


    const toggleSection = (groupId: string) => {
        if (toShow.includes(groupId)) {
            setToShow(toShow.filter(id => id !== groupId));
        } else {
            setToShow([...toShow, groupId]);
        }
    };

    const loadData = async () => {
        try {
            const [workoutData, groupData] = await Promise.all([
                getAllWorkouts(),
                getAllGroups(),
            ]);
            setWorkouts(workoutData);
            setGroups(groupData);
        } catch (error) {
            console.error('Errore durante il caricamento:', error);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, []));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleDelete = (workoutId: string, workoutTitle: string) => {
        Alert.alert('Elimina Scheda', `Vuoi davvero eliminare "${workoutTitle}"?`, [
            { text: 'Annulla', style: 'cancel' },
            {
                text: 'Elimina', style: 'destructive',
                onPress: async () => {
                    try {
                        const db = await getDb();
                        await db.runAsync('DELETE FROM workout_exercises WHERE workout_id = ?;', [workoutId]);
                        await db.runAsync('DELETE FROM workouts WHERE id = ?;', [workoutId]);
                        loadData();
                    } catch (error) {
                        console.error('Errore cancellazione:', error);
                    }
                },
            },
        ]);
    };

    const handleAssignGroup = async (groupId: string | null) => {
        if (!assignTarget) return;
        try {
            await assignWorkoutToGroup(assignTarget.id, groupId);
            setAssignTarget(null);
            await loadData();
        } catch (error) {
            console.error('Errore assegnazione gruppo:', error);
        }
    };

    const buildSections = (): WorkoutSection[] => {
        const groupMap = new Map<string | null, WorkoutItem[]>();
        for (const w of workouts) {
            const key = w.group_id ?? null;
            if (!groupMap.has(key)) groupMap.set(key, []);
            groupMap.get(key)!.push(w);
        }

        const sections: WorkoutSection[] = [];
        for (const [groupId, items] of groupMap) {
            if (groupId !== null) {
                sections.push({
                    groupId,
                    title: items[0].group_name ?? 'Gruppo',
                    color: items[0].group_color ?? '#2563EB',
                    data: items,
                });
            }
        }
        sections.sort((a, b) => a.title.localeCompare(b.title));

        const uncategorized = groupMap.get(null) ?? [];
        if (uncategorized.length > 0) {
            sections.push({
                groupId: null, title: 'Senza Gruppo', color: '#94A3B8', data: uncategorized,
            });
        }
        return sections;
    };

    const sections = buildSections();

    const renderWorkoutCard = ({ item }: { item: WorkoutItem }) => {
        if (!toShow.includes(item.group_id ?? "")) {
            return <></>;
        }

        return <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.id })}
        >
            <View style={styles.cardHeader}>
                <View style={styles.titleContainer}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {item.is_ai_generated === 1 && (
                        <View style={styles.badgeAi}>
                            <Ionicons name="sparkles" size={12} color="#2563EB" />
                            <Text style={styles.badgeAiText}>AI</Text>
                        </View>
                    )}
                </View>
                <View style={styles.cardActions}>
                    {/* Assign-to-group button */}
                    <TouchableOpacity
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => setAssignTarget(item)}
                        style={styles.folderBtn}
                    >
                        <Ionicons
                            name={item.group_id ? 'folder' : 'folder-outline'}
                            size={19}
                            color={item.group_id ? (item.group_color ?? '#2563EB') : '#94A3B8'}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        onPress={() => handleDelete(item.id, item.title)}
                    >
                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={styles.cardDescription} numberOfLines={2}>
                {item.description || 'Nessuna descrizione.'}
            </Text>

            <View style={styles.cardFooter}>
                <View style={styles.infoTag}>
                    <Ionicons name="barbell-outline" size={16} color="#64748B" />
                    <Text style={styles.infoText}>{item.exercise_count || 0} Esercizi</Text>
                </View>
                <View style={styles.infoTag}>
                    <Ionicons name="calendar-outline" size={16} color="#64748B" />
                    <Text style={styles.infoText}>
                        {new Date(item.created_at).toLocaleDateString('it-IT')}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
            ;
    }



    const renderSectionHeader = ({ section }: { section: WorkoutSection }) => (
        <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.groupId ?? "")}>
            <View style={[styles.sectionDot, { backgroundColor: section.color }]} />
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Le Mie Schede</Text>
                <View style={styles.headerButtons}>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={() => navigation.navigate('WorkoutGroups')}
                    >
                        <Ionicons name="folder-open-outline" size={15} color="#007AFF" />
                        <Text style={styles.headerBtnText}>Gruppi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.historyBtn}
                        onPress={() => navigation.navigate('WorkoutHistory')}
                    >
                        <Text style={styles.historyBtnText}>📜 Storico</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={renderWorkoutCard}
                renderSectionHeader={renderSectionHeader}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="fitness-outline" size={64} color="#CBD5E1" />
                        <Text style={styles.emptyTitle}>Nessuna scheda salvata</Text>
                        <Text style={styles.emptySubtitle}>
                            Crea la tua prima scheda con l'IA o inseriscila manualmente.
                        </Text>
                    </View>
                }
            />

            {/* Bottom action buttons */}
            <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                    style={styles.manualButton}
                    onPress={() => navigation.navigate('WorkoutForm')}
                >
                    <Text style={styles.manualButtonText}>✏️ Nuova Manuale</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.generateButton}
                    onPress={() => navigation.navigate('GenerateWorkout')}
                >
                    <Text style={styles.generateButtonText}>✨ Genera con IA</Text>
                </TouchableOpacity>
            </View>

            {/* Assign Group Modal */}
            <Modal
                visible={assignTarget !== null}
                transparent
                animationType="slide"
                onRequestClose={() => setAssignTarget(null)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setAssignTarget(null)}
                >
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Assegna a un Gruppo</Text>
                        <Text style={styles.modalSubtitle} numberOfLines={1}>
                            {assignTarget?.title}
                        </Text>

                        <FlatList
                            data={groups}
                            keyExtractor={(g) => g.id}
                            style={styles.groupList}
                            renderItem={({ item: g }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.groupOption,
                                        assignTarget?.group_id === g.id && styles.groupOptionActive,
                                    ]}
                                    onPress={() => handleAssignGroup(g.id)}
                                >
                                    <View style={[styles.groupOptionDot, { backgroundColor: g.color }]} />
                                    <Text style={styles.groupOptionName}>{g.name}</Text>
                                    {assignTarget?.group_id === g.id && (
                                        <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                                    )}
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={
                                <Text style={styles.noGroupsText}>
                                    Nessun gruppo disponibile. Crea un gruppo prima dalla sezione "Gruppi".
                                </Text>
                            }
                        />

                        {/* Remove from group option */}
                        {assignTarget?.group_id && (
                            <TouchableOpacity
                                style={styles.removeGroupOption}
                                onPress={() => handleAssignGroup(null)}
                            >
                                <Ionicons name="close-circle-outline" size={20} color="#EF4444" style={{ marginRight: 10 }} />
                                <Text style={styles.removeGroupText}>Rimuovi dal Gruppo</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.cancelOption}
                            onPress={() => setAssignTarget(null)}
                        >
                            <Text style={styles.cancelText}>Annulla</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },

    // Header
    headerRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 16, marginBottom: 8,
    },
    headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#0F172A' },
    headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    },
    headerBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },
    historyBtn: { backgroundColor: '#e5e5ea', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    historyBtnText: { color: '#007AFF', fontWeight: '600', fontSize: 13 },

    // List
    listContent: { padding: 16, paddingBottom: 100 },

    // Section
    sectionHeader: {
        padding: 10,
        backgroundColor: 'white',
        flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 10,
    },
    sectionDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#334155', flex: 1 },
    sectionCount: {
        fontSize: 12, fontWeight: '600', color: '#94A3B8',
        backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    },

    // Card
    card: {
        backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    titleContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', flexShrink: 1 },
    badgeAi: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#DBEAFE',
        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, marginLeft: 8,
    },
    badgeAiText: { fontSize: 10, fontWeight: 'bold', color: '#2563EB', marginLeft: 2 },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    folderBtn: {},
    cardDescription: { fontSize: 13, color: '#64748B', marginTop: 6, marginBottom: 12 },
    cardFooter: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 10 },
    infoTag: { flexDirection: 'row', alignItems: 'center', marginRight: 16 },
    infoText: { fontSize: 12, color: '#64748B', marginLeft: 4 },

    // Empty
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#475569', marginTop: 12 },
    emptySubtitle: {
        fontSize: 14, color: '#94A3B8', textAlign: 'center',
        marginHorizontal: 32, marginTop: 4,
    },

    // Action buttons
    actionButtonsRow: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        flexDirection: 'row', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E2E8F0',
    },
    manualButton: {
        flex: 0.48, backgroundColor: '#e5e5ea', paddingVertical: 14,
        borderRadius: 10, alignItems: 'center',
    },
    manualButtonText: { color: '#1c1c1e', fontSize: 15, fontWeight: '600' },
    generateButton: {
        flex: 0.48, backgroundColor: '#007AFF', paddingVertical: 14,
        borderRadius: 10, alignItems: 'center',
    },
    generateButtonText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
    },
    modalSheet: {
        backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        padding: 20, paddingBottom: 36, maxHeight: '70%',
    },
    modalHandle: {
        width: 40, height: 4, backgroundColor: '#CBD5E1',
        borderRadius: 2, alignSelf: 'center', marginBottom: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#0F172A', marginBottom: 4 },
    modalSubtitle: { fontSize: 13, color: '#64748B', marginBottom: 16 },
    groupList: { maxHeight: 280 },
    groupOption: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    },
    groupOptionActive: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8 },
    groupOptionDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
    groupOptionName: { flex: 1, fontSize: 15, fontWeight: '500', color: '#1E293B' },
    noGroupsText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 20 },
    removeGroupOption: {
        flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
        borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 8,
    },
    removeGroupText: { fontSize: 15, color: '#EF4444', fontWeight: '500' },
    cancelOption: {
        backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 14,
        alignItems: 'center', marginTop: 10,
    },
    cancelText: { fontSize: 15, fontWeight: '600', color: '#475569' },
});
