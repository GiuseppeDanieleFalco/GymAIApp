import { registerRootComponent } from 'expo'; import * as Notifications from 'expo-notifications';
import { DeviceEventEmitter } from 'react-native';
import { useEffect } from 'react';

import App from './App';

// Handle notification responses (when user clicks buttons inside the notification)
export function useNotificationActions() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const actionId = response.actionIdentifier;

      // Match the action identifiers you configured on your notification
      if (actionId === 'add-30s') {
        DeviceEventEmitter.emit('REST_TIMER_ADD_30S');
      } else if (actionId === 'stop') {
        DeviceEventEmitter.emit('REST_TIMER_STOP');
      }
    });

    return () => subscription.remove();
  }, []);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

