import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false, // Prevents sound spam every second
        shouldSetBadge: false,
    }),
});

export function useRestTimerNotifications(
    restTimer: number | null,
    add30s: () => void,
    jumpTimer: () => void
) {
    // Use a constant identifier string so Android overwrites the same notification card
    const NOTIFICATION_TAG = 'active-rest-timer';

    useEffect(() => {
        const init = async () => {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') return;

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('rest-end', {
                    name: 'Recupero Terminato',
                    importance: Notifications.AndroidImportance.MAX,
                    sound: 'default',
                });

                await Notifications.setNotificationChannelAsync('timer', {
                    name: 'Timer Recupero',
                    importance: Notifications.AndroidImportance.LOW, // Low importance prevents popup banners on every second change
                });

                await Notifications.setNotificationCategoryAsync('timer-actions', [
                    { identifier: 'REST_TIMER_ADD_30S', buttonTitle: '+30s', options: { opensAppToForeground: true } },
                    { identifier: 'REST_TIMER_STOP', buttonTitle: 'Stop', options: { isDestructive: true, opensAppToForeground: true } },
                ]);
            }
        };
        init().catch(console.error);
    }, []);

    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const actionId = response.actionIdentifier;
            if (actionId === 'REST_TIMER_ADD_30S') add30s();
            if (actionId === 'REST_TIMER_STOP') jumpTimer();
        });

        return () => subscription.remove();
    }, [add30s, jumpTimer]);

    const showCompletionNotification = async () => {
        // First, clear the active countdown notification card
        await Notifications.dismissNotificationAsync(NOTIFICATION_TAG).catch(() => { });

        // Then show the finish alert
        await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Recupero Terminato',
                body: 'Il tuo tempo di recupero è finito, torna ad allenarti! 💪',
                sound: 'default',
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: 1,
                channelId: 'rest-end',
            },
        });
    };

    const cancelNotification = async () => {
        await Notifications.dismissNotificationAsync(NOTIFICATION_TAG).catch(() => { });
    };

    // Updates the exact same notification card every second
    useEffect(() => {
        const updateNotification = async () => {
            try {
                const min = Math.floor(restTimer! / 60);
                const sec = restTimer! % 60;
                const formatted = `${min}:${sec.toString().padStart(2, '0')}`;

                // Overwriting using the identical identifier string updates it in-place
                await Notifications.scheduleNotificationAsync({
                    identifier: NOTIFICATION_TAG,
                    content: {
                        title: '⏳ Recupero in corso',
                        body: `Tempo rimanente: ${formatted}`,
                        color: '#3498db',
                        categoryIdentifier: 'timer-actions',
                        autoDismiss: false,
                        // sticky: true,
                        sound: undefined,
                    },
                    trigger: {
                        // type: null,
                        // seconds: 1,
                        channelId: 'timer',
                    },
                });
            } catch (e) {
                console.log('Errore Expo Notifications:', e);
            }
        };

        if (restTimer !== null && restTimer > 0) {
            updateNotification();
        } else if (restTimer === 0) {
            cancelNotification();
            showCompletionNotification();
        }
    }, [restTimer]);

    return { cancelNotification };
}