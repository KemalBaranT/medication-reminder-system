/**
 * Panel bildirimleri için Web Audio API ile sentezlenen, kurumsal ve yumuşak
 * "ding" sesi.
 *
 * **Neden ses dosyası değil sentez:** Ek bir varlık indirmeye, önbellek ve
 * MIME yapılandırmasına gerek kalmaz; ses her tarayıcıda aynı çalar ve
 * birkaç satırla ayarlanabilir. Ses iki kısmi harmonikli, hızlı atak ve
 * üstel sönümlü bir çan tonudur; servis ortamında irkiltmeden fark edilir.
 * Tonlar mobil uygulamanın bildirim sesinden (E6 → B5) alınmıştır; hemşire
 * aynı uyarıyı iki cihazda aynı ses karakteriyle tanır.
 *
 * **Tarayıcı otomatik oynatma politikası:** Tarayıcılar, kullanıcı sayfayla
 * etkileşime geçmeden `AudioContext` ile ses çalınmasına izin vermez. Bu
 * yüzden bağlam ilk tıklama/tuş vuruşunda "kilidi açılmış" olarak
 * hazırlanır ({@link primeNotificationSound}); o ana kadar gelen uyarılar
 * sessiz toast olarak gösterilir.
 */
let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  return context;
}

/** İlk kullanıcı etkileşiminde ses bağlamını hazırlar. Uygulama kökünde bir kez çağrılır. */
export function primeNotificationSound(): () => void {
  const unlock = () => {
    const ctx = getContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}

function bell(ctx: AudioContext, frequency: number, startAt: number, volume: number) {
  const partials: [number, number][] = [
    [1, 1],
    [2, 0.22],
    [3.01, 0.08],
  ];
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, startAt);
  master.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.3);
  master.connect(ctx.destination);

  for (const [ratio, amp] of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * ratio, startAt);
    gain.gain.setValueAtTime(amp, startAt);
    osc.connect(gain).connect(master);
    osc.start(startAt);
    osc.stop(startAt + 1.35);
  }
}

/**
 * Yumuşak bildirim sesini çalar. `urgent` iken ikinci ton biraz daha
 * belirgindir (gecikmiş ilaç), aksi halde tek, alçak bir "ding" çalar.
 * Ses bağlamı henüz kilidi açılmamışsa sessizce hiçbir şey yapmaz.
 */
export function playNotificationSound(urgent = false): void {
  const ctx = getContext();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime + 0.01;
  bell(ctx, 1318.51, now, 0.12);
  if (urgent) bell(ctx, 987.77, now + 0.2, 0.14);
}
