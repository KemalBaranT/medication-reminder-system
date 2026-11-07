import { router } from 'expo-router';
import { MapPin, SearchX, UsersRound } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import { SmartSearchBar } from '../../components/SmartSearchBar';
import { EmptyView, ErrorView, LoadingView, StatusChip } from '../../components/StateViews';
import type { Patient } from '../../domain/types';
import { formatLocation } from '../../domain/worklist';
import { palette, radius, shadow, spacing, TAB_BAR_HEIGHT } from '../../theme/tokens';

const STATUS: Record<Patient['status'], { label: string; color: string }> = {
  admitted: { label: 'Yatıyor', color: palette.done },
  discharged: { label: 'Taburcu', color: '#9E9E9E' },
  transferred: { label: 'Nakil', color: palette.due },
};

/**
 * "Hastalar" sekmesi: servisteki hastaların salt okunur listesi. Hasta
 * ekleme ve düzenleme web panelinden yapılır.
 *
 * Yüzlerce hastalı bir serviste doğru hastayı aşağı kaydırarak bulmak
 * pratik olmadığından, arama çubuğu ad/soyad veya protokol numarasına
 * göre anlık, istemci tarafı filtreleme yapar; liste zaten bellekte
 * olduğu için sunucuya ek istek gitmez. Bir hastaya dokunmak, o hastanın
 * günlük ilaç zaman çizelgesini açar.
 */
export default function PatientsScreen() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setPatients(await api.patients());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return patients;
    return patients.filter(
      (p) => p.fullName.toLocaleLowerCase('tr-TR').includes(q) || p.hospitalPatientNo.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [patients, query]);

  let body;
  if (loading && patients.length === 0) {
    body = <LoadingView />;
  } else if (error && patients.length === 0) {
    body = (
      <ErrorView
        message={error}
        onRetry={() => {
          setLoading(true);
          void load();
        }}
      />
    );
  } else {
    body = (
      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, filtered.length === 0 && styles.listEmpty]}
        renderItem={({ item }) => <PatientCard patient={item} />}
        ListEmptyComponent={
          patients.length === 0 ? (
            <EmptyView icon={UsersRound} message="Kayıtlı hasta bulunamadı." />
          ) : (
            <EmptyView icon={SearchX} message="Sonuç bulunamadı." />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={palette.primary}
            colors={[palette.primary]}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      />
    );
  }

  return (
    <View style={styles.root}>
      <SmartSearchBar value={query} onChangeText={setQuery} placeholder="Ad, soyad veya protokol no ara..." />
      {body}
    </View>
  );
}

function PatientCard({ patient }: { patient: Patient }) {
  const status = STATUS[patient.status] ?? STATUS.admitted;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/patient/[code]', params: { code: patient.wristbandCode } })}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: palette.background }]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{patient.fullName.trim().charAt(0).toLocaleUpperCase('tr-TR') || '?'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {patient.fullName}
          </Text>
          <StatusChip label={status.label} color={status.color} />
        </View>
        <Text style={styles.protocol}>Protokol {patient.hospitalPatientNo}</Text>
        <View style={styles.locationRow}>
          <MapPin size={15} color={palette.primary} />
          <Text style={styles.location} numberOfLines={1}>
            {formatLocation(patient)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 88 + spacing.lg },
  listEmpty: { flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginVertical: 6,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: spacing.lg,
    paddingRight: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    ...shadow.card,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: palette.onSecondaryContainer },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 15.5, fontWeight: '700', color: palette.text },
  protocol: { marginTop: 4, fontSize: 12.5, color: palette.textSubtle },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  location: { flex: 1, fontSize: 13.5, fontWeight: '600', color: palette.text },
});
