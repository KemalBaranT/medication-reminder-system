import { Toaster } from 'sonner';

/**
 * Panelin tek toast yüzeyi. Uygulama kökünde bir kez mount edilir.
 *
 * Sağ üstten kayarak girer; üst üste binen toast'lar yığın halinde
 * toplanır ve üzerine gelindiğinde açılır. Görünüm, panelin kart diliyle
 * (beyaz zemin, ince kenarlık, katmanlı yumuşak gölge) uyumlu olacak
 * şekilde `index.css` içindeki `.app-toast` sınıflarıyla belirlenir; doz
 * uyarıları kademe rengini sol kenardaki vurgu çizgisiyle taşır
 * (`toast-due`, `toast-overdue`).
 */
export function AppToaster() {
  return (
    <Toaster
      position="top-right"
      offset={{ top: 76, right: 24 }}
      gap={10}
      visibleToasts={4}
      closeButton
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: 'app-toast',
          title: 'app-toast-title',
          description: 'app-toast-description',
          actionButton: 'app-toast-action',
          closeButton: 'app-toast-close',
          success: 'toast-success',
          error: 'toast-error',
        },
      }}
    />
  );
}
