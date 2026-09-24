import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { initDatabase } from './src/database/db';

import WorkoutsListScreen from './src/screens/WorkoutsListScreen';
import WorkoutDetailScreen from './src/screens/WorkoutDetailScreen';
import GenerateWorkoutScreen from './src/screens/GenerateWorkoutScreen';
import ActiveSessionScreen from './src/screens/ActiveSessionScreen';
import WorkoutHistoryScreen from './src/screens/WorkoutHistoryScreen';
import WorkoutFormScreen from './src/screens/WorkoutFormScreen';
import ExerciseProgressScreen from './src/screens/ExerciseProgressScreen';
import WorkoutGroupsScreen from './src/screens/WorkoutGroupsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    async function setup() {
      try {
        await initDatabase(); // Inizializza il database locale SQLite
        setIsDbReady(true);
      } catch (error) {
        console.error("Errore nell'inizializzazione del DB:", error);
      }
    }
    setup();
  }, []);

  if (!isDbReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Preparazione ambiente fitness...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="WorkoutsList"
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen
          name="WorkoutsList"
          component={WorkoutsListScreen}
          options={{ title: 'Le Tue Schede' }}
        />
        <Stack.Screen
          name="WorkoutDetail"
          component={WorkoutDetailScreen}
          options={{ title: 'Dettaglio Scheda' }}
        />
        <Stack.Screen
          name="GenerateWorkout"
          component={GenerateWorkoutScreen}
          options={{ title: 'Generatore AI' }}
        />
        <Stack.Screen
          name="ActiveSession"
          component={ActiveSessionScreen}
          options={{ title: 'Allenamento in corso', headerLeft: () => null }} // Impedisce il tasto back accidentale
        />
        <Stack.Screen
          name="WorkoutHistory"
          component={WorkoutHistoryScreen}
          options={{ title: 'Storico Allenamenti' }}
        />

        <Stack.Screen
          name="WorkoutForm"
          component={WorkoutFormScreen}
          options={{ title: 'Gestione Scheda' }}
        />

        <Stack.Screen
          name="ExerciseProgress"
          component={ExerciseProgressScreen}
          options={{ title: 'Progressi Esercizio' }}
        />
        <Stack.Screen
          name="WorkoutGroups"
          component={WorkoutGroupsScreen}
          options={{ title: 'Gestione Gruppi' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
  },
});