import { createContext, useContext } from 'react';
import type { DoseAlert } from '../lib/doseAlerts';

/** Bildirim merkezinin (zil, rozet, açılır liste) okuduğu durum; bkz. `DoseAlertsProvider`. */
export interface DoseAlertsContextValue {
  /** Kullanıcının rolü iş listesini görmeye yetkiliyse `true`; değilse zil hiç gösterilmez. */
  enabled: boolean;
  alerts: DoseAlert[];
  unreadCount: number;
  markAllRead: () => void;
  openPatient: (wristbandCode: string) => void;
  isLoading: boolean;
}

export const DoseAlertsContext = createContext<DoseAlertsContextValue | null>(null);

export function useDoseAlerts(): DoseAlertsContextValue {
  const ctx = useContext(DoseAlertsContext);
  if (!ctx) throw new Error('useDoseAlerts, DoseAlertsProvider içinde kullanılmalıdır.');
  return ctx;
}
