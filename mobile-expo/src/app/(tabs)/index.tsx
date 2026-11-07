import { router } from 'expo-router';
import { CircleCheck, SearchX } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { useSession } from '../../auth/SessionProvider';
import { ConfirmAdministerModal } from '../../components/ConfirmAdministerModal';
import { SmartSearchBar } from '../../components/SmartSearchBar';
import { EmptyView, ErrorView, LoadingView } from '../../components/StateViews';
import { StatusFilterBar, type StatusFilter } from '../../components/StatusFilterBar';
import { CARD_LIST_PADDING, SwipeableDoseCard } from '../../components/SwipeableDoseCard';
import { administrationAvailability } from '../../domain/actionPolicy';
import { DoseUrgency } from '../../domain/doseTiming';
import type { ScheduleItem } from '../../domain/types';
import type { PatientWorkItem } from '../../domain/worklist';
import { useSchedule } from '../../state/ScheduleProvider';
import { palette, spacing, TAB_BAR_HEIGHT } from '../../theme/tokens';

/** Son kartın "QR Tara" düğmesinin altında kalmaması için listenin altına bırakılan boşluk. */
const FAB_CLEARANCE = 88;

/**
 * "Bugünün İlaçları" sekmesi.
 *
 * Her hasta için yalnızca TEK bir acil kart gösterilir (seçim kuralı için
 * bkz. `buildPatientWorklist`). Kart üzerinde sağa kaydırma manuel onay
 * modalını, sola kaydırma Gelişmiş QR Okuyucu'yu, dokunma ise hastanın
 * günlük zaman çizelgesini açar.
 *
 * Arama ve durum filtresi tamamen istemci tarafındadır; sunucuya ayrı
 * istek gönderilmez, yalnızca hangi kartların çizileceği belirlenir.
 * Filtre, kartta gösterilen dozun durumuna uygulanır.
 */
export default function TodayMedicationsScreen() {
  const { permissions } = useSession();
  const { items, worklist, now, loading, refreshing, error, refresh, administer } = useSchedule();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [pendingConfirm, setPendingConfirm] = useState<ScheduleItem | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return worklist.filter((w) => {
      if (!matchesFilter(w.urgency, filter)) return false;
      if (!q) return true;
      return (
        w.dose.patientName.toLocaleLowerCase('tr-TR').includes(q) ||
        w.medicationNames.some((m) => m.toLocaleLowerCase('tr-TR').includes(q))
      );
    });
  }, [worklist, query, filter]);

  const openTimeline = useCallback((item: PatientWorkItem) => {
    router.push({ pathname: '/patient/[code]', params: { code: item.patientKey } });
  }, []);

  const openScanner = useCallback((item: PatientWorkItem) => {
    router.push({ pathname: '/scan/[scheduleId]', params: { scheduleId: item.dose.id } });
  }, []);

  const openManualConfirm = useCallback((item: PatientWorkItem) => setPendingConfirm(item.dose), []);

  const confirm = async () => {
    if (!pendingConfirm) return;
    await administer(pendingConfirm.id, { barcodeVerified: false });
    setPendingConfirm(null);
  };

  const renderItem = ({ item }: { item: PatientWorkItem }) => {
    const availability = administrationAvailability(item.urgency, permissions);
    return (
      <Animated.View layout={LinearTransition.springify().damping(20)}>
        <SwipeableDoseCard
          item={item}
          now={now}
          manual={availability}
          qr={availability}
          onManualConfirm={openManualConfirm}
          onScanQr={openScanner}
          onOpen={openTimeline}
        />
      </Animated.View>
    );
  };

  let body;
  if (loading && items.length === 0) {
    body = <LoadingView />;
  } else if (error && items.length === 0) {
    body = <ErrorView message={error} onRetry={refresh} />;
  } else {
    body = (
      <FlatList
        data={visible}
        keyExtractor={(w) => w.patientKey}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, visible.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          items.length === 0 ? (
            <EmptyView icon={CircleCheck} message="Şu an için bekleyen ilaç yok" />
          ) : (
            <EmptyView icon={SearchX} message="Sonuç bulunamadı." />
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.primary} colors={[palette.primary]} />}
      />
    );
  }

  return (
    <View style={styles.root}>
      <SmartSearchBar value={query} onChangeText={setQuery} placeholder="Hasta veya ilaç ara..." />
      <StatusFilterBar selected={filter} onChange={setFilter} />
      {body}
      <ConfirmAdministerModal dose={pendingConfirm} onCancel={() => setPendingConfirm(null)} onConfirm={confirm} />
    </View>
  );
}

/**
 * Kartın aciliyet kademesini seçili filtreyle eşleştirir. "Bekliyor",
 * henüz gecikmemiş her açık dozu kapsar (saati gelmiş veya gelecek).
 */
function matchesFilter(urgency: DoseUrgency, filter: StatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'late':
      return urgency === DoseUrgency.Overdue;
    case 'pending':
      return urgency === DoseUrgency.Due || urgency === DoseUrgency.Upcoming;
    case 'administered':
      return urgency === DoseUrgency.Done;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  list: {
    paddingHorizontal: CARD_LIST_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: FAB_CLEARANCE + spacing.lg,
  },
  listEmpty: { flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT },
});
