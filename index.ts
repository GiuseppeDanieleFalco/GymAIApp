import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
import { DeviceEventEmitter } from 'react-native';

import App from './App';

// Keep the foreground service alive
notifee.registerForegroundService((notification) => {
  return new Promise(() => {
    // Promise remains unresolved to keep the service running
  });
});

// Handle background actions for the timer
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS && detail.pressAction) {
    if (detail.pressAction.id === 'add-30s') {
      DeviceEventEmitter.emit('REST_TIMER_ADD_30S');
    } else if (detail.pressAction.id === 'stop') {
      DeviceEventEmitter.emit('REST_TIMER_STOP');
    }
  }
});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

