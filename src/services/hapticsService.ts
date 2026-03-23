import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const haptics = {
  impact: async (style: ImpactStyle = ImpactStyle.Light) => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style });
    }
  },
  
  notification: async (type: 'SUCCESS' | 'WARNING' | 'ERROR' = 'SUCCESS') => {
    if (Capacitor.isNativePlatform()) {
      // Mapping to Capacitor types
      const capType = type === 'SUCCESS' ? 'SUCCESS' : type === 'WARNING' ? 'WARNING' : 'ERROR';
      // Note: Capacitor Haptics.notification uses specific string values
      // @ts-ignore - Capacitor types can be strict
      await Haptics.notification({ type: capType });
    }
  },

  selectionStart: async () => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.selectionStart();
    }
  },

  selectionChanged: async () => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.selectionChanged();
    }
  },

  selectionEnd: async () => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.selectionEnd();
    }
  },

  vibrate: async () => {
    if (Capacitor.isNativePlatform()) {
      await Haptics.vibrate();
    }
  }
};
