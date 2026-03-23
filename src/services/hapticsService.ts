import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const haptics = {
  impact: async (style: ImpactStyle = ImpactStyle.Light) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style });
      } catch (e) {
        console.warn('Haptics not available', e);
      }
    }
  },
  notification: async (type: NotificationType = NotificationType.Success) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.notification({ type });
      } catch (e) {
        console.warn('Haptics not available', e);
      }
    }
  },
  selectionStart: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.selectionStart();
      } catch (e) {
        console.warn('Haptics not available', e);
      }
    }
  },
  selectionChanged: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.selectionChanged();
      } catch (e) {
        console.warn('Haptics not available', e);
      }
    }
  },
  selectionEnd: async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.selectionEnd();
      } catch (e) {
        console.warn('Haptics not available', e);
      }
    }
  }
};
