export enum ImpactStyle {
  Heavy = 'HEAVY',
  Medium = 'MEDIUM',
  Light = 'LIGHT',
}

export enum NotificationType {
  Success = 'SUCCESS',
  Warning = 'WARNING',
  Error = 'ERROR',
}

export const haptics = {
  impact: (options?: { style: ImpactStyle }) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }
  },
  notification: (options?: { type: NotificationType }) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([10, 50, 10]);
    }
  },
  selectionStart: () => {},
  selectionChanged: () => {},
  selectionEnd: () => {},
};
