export type ToastType = 'success' | 'error';

export interface ToastEvent {
  id: number;
  type: ToastType;
  message: string;
}

type Listener = (toast: ToastEvent) => void;

/**
 * Bir toast'in her yerden yukseltilebilmesi icin minimal pub/sub - bir
 * React bilesenin `onSuccess` mutasyonundan veya tamamen React agacinin
 * disinda calisan ve bu yuzden cagirabilecegi bir hook'u olmayan
 * `lib/api.ts`teki Axios yanit interceptor'indan. Pratikte `ToastViewport`
 * tek abonedir; modul duz bir olay veriyolu olarak kalir (React import'u
 * yoktur), boylece bilesen olmayan kodlardan cagirmanin maliyeti sifirdir.
 */
const listeners = new Set<Listener>();
let nextId = 1;

function emit(type: ToastType, message: string) {
  const event: ToastEvent = { id: nextId++, type, message };
  listeners.forEach((listener) => listener(event));
}

export const toast = {
  success: (message: string) => emit('success', message),
  error: (message: string) => emit('error', message),
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
