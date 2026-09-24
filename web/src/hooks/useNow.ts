import { useEffect, useState } from 'react';

/**
 * Belirtilen aralıkla yenilenen "şu an" değeri. Doz rozetleri (gecikti /
 * sıradaki doz) ve onay penceresindeki canlı saat, sayfa açık kaldıkça
 * yeniden yükleme gerektirmeden güncel kalsın diye kullanılır; bir
 * hemşire paneli vardiya boyunca açık bırakabilir.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
