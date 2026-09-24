import { getDb } from '../database/db';
import { AIWorkoutInput, AIGeneratedWorkoutPlan } from '../types/workout';

// 1. Lettura della chiave API di Gemini dalle variabili d'ambiente Expo
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_AI_KEY;
// Usa il modello gemini-2.5-flash oppure gemini-2.0-flash
const MODEL_NAME = 'gemini-3.6-flash';

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;


// 2. System Prompt Legale e Funzionale
export const SYSTEM_PROMPT = `
Sei un assistente algoritmico specializzato nella strutturazione di piani di auto-allenamento per il fitness.
NON sei un Personal Trainer e NON sei un medico. Il tuo unico scopo è organizzare gli esercizi in formato strutturato sulla base dei dati forniti dall'utente.

REGOLE FONDAMENTALI:
1. RISPONDI ESCLUSIVAMENTE con un oggetto JSON valido. Nessun testo introduttivo, conclusivo o blocco markdown fuori dal JSON.
2. Non fornire diagnosi, consigli medici o prescrizioni riabilitative.
3. Se l'utente inserisce limitazioni fisiche o infortuni, escludi rigorosamente esercizi a rischio per quelle articolazioni/distretti.
4. Adatta la selezione degli esercizi ESCLUSIVAMENTE all'attrezzatura dichiarata disponibile.
5. Includi sempre nel campo "disclaimer" la seguente dicitura obbligatoria:
   "Questo piano di allenamento è un suggerimento generato automaticamente sulla base dei parametri inseriti. Non sostituisce il parere di un medico o di un professionista del fitness qualificato. Prima di iniziare, assicurati di avere un certificato medico idoneo all'attività sportiva."

SCHEMA JSON OBBLIGATORIO:
{
  "workout_title": "string",
  "description": "string",
  "disclaimer": "string",
  "days": [
    {
      "day_title": "string",
      "exercises": [
        {
          "exercise_name": "string",
          "equipment": "string",
          "target_sets": number,
          "target_reps": "string",
          "rest_seconds": number,
          "rpe_suggested": number,
          "execution_notes": "string"
        }
      ]
    }
  ]
}
`;

// 3. Funzione principale di generazione tramite Gemini API
export const generateWorkoutPlan = async (
    userInput: AIWorkoutInput
): Promise<AIGeneratedWorkoutPlan> => {
    if (!GEMINI_API_KEY) {
        throw new Error(
            'API Key Gemini non trovata! Verifica di aver impostato EXPO_PUBLIC_GEMINI_API_KEY nel file .env'
        );
    }

    const userPrompt = `
Genera una scheda di allenamento basata sui seguenti parametri dell'utente:
- Peso corporeo: ${userInput.weightKg} kg
- Livello di esperienza: ${userInput.experienceLevel}
- Frequenza: ${userInput.daysPerWeek} giorni a settimana
- Durata massima sessione: ${userInput.sessionDurationMin} minuti
- Obiettivo principale: ${userInput.goals}
- Attrezzatura disponibile: ${userInput.availableEquipment.join(', ')}
- Limitazioni fisiche o fastidi noti: ${userInput.physicalLimitations || 'Nessuna'}
- Note e storico schede passate: ${userInput.pastWorkoutNotes || 'Nessuno'}
`;

    let delay = 2000;
    try {
        while (true) {
            const response = await fetch(GEMINI_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    system_instruction: {
                        parts: [{ text: SYSTEM_PROMPT }],
                    },
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: userPrompt }],
                        },
                    ],
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0.7,
                    },
                }),
            });

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    const errText = await response.text();
                    if (errText.toLowerCase().includes("limit")) {
                        throw new Error(`Limite di utilizzo API raggiunta. Riprova tra 24 ore.`);
                    }
                    console.warn(`Errore rate limit o server (${response.status}): ${errText}. Ritento tra ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 1.5, 10000); // Backoff fino a 10s max
                    continue;
                }
                const errText = await response.text();
                throw new Error(`Errore risposta API Gemini (${response.status}): ${errText}`);
            }

            const data = await response.json();

            // Estrazione del testo JSON restituito dal modello
            const jsonString = data.candidates[0].content.parts[0].text;
            const parsedPlan: AIGeneratedWorkoutPlan = JSON.parse(jsonString);

            return parsedPlan;
        }
    } catch (error: any) {
        throw error;
    }
};

// 4. Funzione helper per salvare la scheda generata da Gemini nel DB SQLite
export const saveAIGeneratedPlanToDb = async (plan: AIGeneratedWorkoutPlan, groupId?: string | null) => {
    const db = await getDb();

    await db.withTransactionAsync(async () => {
        let dayIndex = 1;

        for (const day of plan.days) {
            const workoutId = `ai_workout_${Date.now()}_day${dayIndex}`;
            const title = `${plan.workout_title} - ${day.day_title}`;

            // Inserisce il record della scheda (con gruppo opzionale)
            await db.runAsync(
                `INSERT INTO workouts (id, title, description, is_ai_generated, group_id) VALUES (?, ?, ?, 1, ?);`,
                [workoutId, title, plan.description, groupId ?? null]
            );

            // Inserisce tutti gli esercizi legati alla giornata
            let exerciseIndex = 0;
            for (const ex of day.exercises) {
                const exerciseId = `ex_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                await db.runAsync(
                    `INSERT INTO workout_exercises (id, workout_id, exercise_name, equipment, target_sets, target_reps, rest_seconds, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
                    [
                        exerciseId,
                        workoutId,
                        ex.exercise_name,
                        ex.equipment,
                        ex.target_sets,
                        ex.target_reps,
                        ex.rest_seconds,
                        exerciseIndex++,
                    ]
                );
            }
            dayIndex++;
        }
    });
};