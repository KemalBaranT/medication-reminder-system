import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError, errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { QrScannerView, type ScanDecision } from '../../components/QrScannerView';
import { ScannerHeader } from '../../components/ScannerHeader';
import { palette } from '../../theme/tokens';

/** Başarı geri bildiriminin hasta dosyasına geçmeden önce görünür kalacağı süre. */
const SUCCESS_DISPLAY_MS = 700;

/**
 * "QR Tara" düğmesinin açtığı genel bileklik tarayıcısı.
 *
 * Okunan kod backend'de bir hastayla eşleştirilir ve hastanın günlük ilaç
 * zaman çizelgesi açılır; oradan her doz QR ile doğrulanarak veya manuel
 * onayla kaydedilebilir. Tarayıcı ekranı yığından kaldırılarak (replace)
 * geçiş yapılır, böylece geri tuşu hemşireyi tekrar kameraya değil ana
 * ekrana döndürür.
 */
export default function WristbandScanScreen() {
  const [found, setFound] = useState(false);

  const handleCode = useCallback(async (code: string): Promise<ScanDecision> => {
    try {
      const patient = await api.patientByWristband(code);
      setFound(true);
      setTimeout(
        () => router.replace({ pathname: '/patient/[code]', params: { code: patient.wristbandCode } }),
        SUCCESS_DISPLAY_MS,
      );
      return { kind: 'complete', message: `Hasta bulundu: ${patient.fullName}` };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        return { kind: 'reject', message: 'Bu bileklik koduyla eşleşen hasta bulunamadı.' };
      }
      return { kind: 'reject', message: errorMessage(e) };
    }
  }, []);

  return (
    <View style={styles.container}>
      <QrScannerView instruction="Bilekliği çerçevenin içine hizalayın" onCode={handleCode} paused={found} />
      <ScannerHeader title="Hasta Bilekliğini Okutun" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.black },
});
