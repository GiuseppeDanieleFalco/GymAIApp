import React, { useState, useCallback } from 'react';
import {
    StyleSheet, Text, View, FlatList, TouchableOpacity,
    TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
    getAllGroups, createGroup, deleteGroup, renameGroup, WorkoutGroup,
} from '../database/groupQueries';

const COLOR_PRESETS = [
    '#2563EB', '#16A34A', '#DC2626', '#D97706',
    '#7C3AED', '#0891B2', '#BE185D', '#EA580C',
];

export default function WorkoutGroupsScreen() {
    const [groups, setGroups] = useState<WorkoutGroup[]>([]);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupColor, setNewGroupColor] = useState(COLOR_PRESETS[0]);
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    const loadGroups = async () => {
        try {
            const data = await getAllGroups();
            setGroups(data);
        } catch (error) {
            console.error('Error loading groups:', error);
        }
    };

    useFocusEffect(useCallback(() => { loadGroups(); }, []));

    const handleCreate = async () => {
        if (!newGroupName.trim()) {
            Alert.alert('Attenzione', 'Inserisci un nome per il gruppo.');
            return;
        }
        try {
            await createGroup(newGroupName, newGroupColor);
            setNewGroupName('');
            setNewGroupColor(COLOR_PRESETS[0]);
            await loadGroups();
        } catch (error) {
            Alert.alert('Errore', 'Impossibile creare il gruppo.');
        }
    };

    const handleDelete = (group: WorkoutGroup) => {
        Alert.alert(
            'Elimina Gruppo',
            `Elimina "${group.name}"?\nLe schede assegnate resteranno senza gruppo.`,
            [
                { text: 'Annulla', style: 'cancel' },
                {
                    text: 'Elimina', style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteGroup(group.id);
                            await loadGroups();
                        } catch {
                            Alert.alert('Errore', 'Impossibile eliminare il gruppo.');
                        }
                    },
                },
            ]
        );
    };

    const handleStartRename = (group: WorkoutGroup) => {
        setEditingGroupId(group.id);
        setEditingName(group.name);
    };

    const handleConfirmRename = async (id: string) => {
        if (!editingName.trim()) return;
        try {
            await renameGroup(id, editingName);
            setEditingGroupId(null);
            await loadGroups();
        } catch {
            Alert.alert('Errore', 'Impossibile rinominare il gruppo.');
        }
    };

    const renderGroup = ({ item }: { item: WorkoutGroup }) => (
        <View style={styles.groupCard}>
            <View style={[styles.colorDot, { backgroundColor: item.color }]} />
            <View style={styles.groupInfo}>
                {editingGroupId === item.id ? (
                    <View style={styles.editRow}>
                        <TextInput
                            style={styles.editInput}
                            value={editingName}
                            onChangeText={setEditingName}
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={() => handleConfirmRename(item.id)}
                        />
                        <TouchableOpacity onPress={() => handleConfirmRename(item.id)} style={styles.actionBtn}>
                            <Ionicons name="checkmark" size={20} color="#16A34A" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingGroupId(null)}>
                            <Ionicons name="close" size={20} color="#94A3B8" />
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <Text style={styles.groupName}>{item.name}</Text>
                        <Text style={styles.groupCount}>{item.workout_count ?? 0} schede</Text>
                    </>
                )}
            </View>
            {editingGroupId !== item.id && (
                <View style={styles.groupActions}>
                    <TouchableOpacity onPress={() => handleStartRename(item)} style={styles.actionBtn}>
                        <Ionicons name="pencil-outline" size={18} color="#2563EB" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item)} style={styles.actionBtn}>
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={groups}
                keyExtractor={(item) => item.id}
                renderItem={renderGroup}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <>
                        <Text style={styles.pageTitle}>Gestione Gruppi</Text>
                        <Text style={styles.pageSubtitle}>
                            Organizza le tue schede in gruppi personalizzati.
                        </Text>

                        {/* Create Form */}
                        <View style={styles.createCard}>
                            <Text style={styles.createTitle}>Nuovo Gruppo</Text>
                            <TextInput
                                style={styles.nameInput}
                                placeholder="Es. Push/Pull/Legs, Forza, Estate..."
                                value={newGroupName}
                                onChangeText={setNewGroupName}
                                placeholderTextColor="#94A3B8"
                                returnKeyType="done"
                            />
                            <Text style={styles.colorLabel}>Colore</Text>
                            <View style={styles.colorRow}>
                                {COLOR_PRESETS.map((color) => (
                                    <TouchableOpacity
                                        key={color}
                                        style={[
                                            styles.colorCircle,
                                            { backgroundColor: color },
                                            newGroupColor === color && styles.colorCircleSelected,
                                        ]}
                                        onPress={() => setNewGroupColor(color)}
                                    />
                                ))}
                            </View>
                            <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
                                <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                                <Text style={styles.createBtnText}>Crea Gruppo</Text>
                            </TouchableOpacity>
                        </View>

                        {groups.length > 0 && (
                            <Text style={styles.listLabel}>I Tuoi Gruppi</Text>
                        )}
                    </>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="folder-open-outline" size={52} color="#CBD5E1" />
                        <Text style={styles.emptyText}>Nessun gruppo creato ancora.</Text>
                        <Text style={styles.emptySubtext}>
                            Crea il tuo primo gruppo per organizzare le schede.
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    listContent: { padding: 16, paddingBottom: 40 },
    pageTitle: { fontSize: 22, fontWeight: 'bold', color: '#0F172A', marginBottom: 4 },
    pageSubtitle: { fontSize: 14, color: '#64748B', marginBottom: 20 },

    // Create card
    createCard: {
        backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
        marginBottom: 24, borderWidth: 1, borderColor: '#E2E8F0',
    },
    createTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
    nameInput: {
        backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14,
        paddingVertical: 12, fontSize: 15, color: '#0F172A',
        borderWidth: 1, borderColor: '#CBD5E1', marginBottom: 12,
    },
    colorLabel: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 8 },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
    colorCircle: {
        width: 32, height: 32, borderRadius: 16,
        marginRight: 10, marginBottom: 8,
    },
    colorCircleSelected: {
        borderWidth: 3, borderColor: '#0F172A',
    },
    createBtn: {
        flexDirection: 'row', backgroundColor: '#2563EB', borderRadius: 10,
        paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    },
    createBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },

    // List label
    listLabel: { fontSize: 14, fontWeight: '600', color: '#94A3B8', marginBottom: 8, letterSpacing: 0.5 },

    // Group card
    groupCard: {
        backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16,
        marginBottom: 10, flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: '#E2E8F0',
    },
    colorDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
    groupInfo: { flex: 1 },
    groupName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    groupCount: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
    groupActions: { flexDirection: 'row', alignItems: 'center' },
    actionBtn: { marginLeft: 12 },

    // Inline edit
    editRow: { flexDirection: 'row', alignItems: 'center' },
    editInput: {
        flex: 1, backgroundColor: '#F1F5F9', borderRadius: 8,
        paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
        borderWidth: 1, borderColor: '#CBD5E1', marginRight: 8,
    },

    // Empty
    emptyContainer: { alignItems: 'center', paddingTop: 30 },
    emptyText: { fontSize: 16, fontWeight: '600', color: '#64748B', marginTop: 12 },
    emptySubtext: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 4 },
});
