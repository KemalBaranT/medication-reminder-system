import { AlertTriangle, CheckCircle2, Clock, Hourglass } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { DoseUrgency, urgencyLabels } from '../domain/doseTiming';
import { palette, radius, spacing, typography } from '../theme/tokens';

/** Bir aciliyet kademesinin renk ve ikon eşlemesi; tüm ekranlarda aynıdır. */
export const urgencyTheme: Record<DoseUrgency, { fg: string; bg: string; Icon: typeof Clock }> = {
  [DoseUrgency.Overdue]: { fg: palette.overdue, bg: palette.overdueSoft, Icon: AlertTriangle },
  [DoseUrgency.Due]: { fg: palette.due, bg: palette.dueSoft, Icon: Clock },
  [DoseUrgency.Upcoming]: { fg: palette.upcoming, bg: palette.upcomingSoft, Icon: Hourglass },
  [DoseUrgency.Done]: { fg: palette.done, bg: palette.doneSoft, Icon: CheckCircle2 },
};

/**
 * Doz durum rozeti. Renk tek başına anlam taşımaz; renk körlüğü olan
 * kullanıcılar ve güneş altında okunan ekranlar için her kademe ikon ve
 * metinle birlikte gösterilir.
 */
export function StatusPill({ urgency, label }: { urgency: DoseUrgency; label?: string }) {
  const { fg, bg, Icon } = urgencyTheme[urgency];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Icon size={14} color={fg} strokeWidth={2.5} />
      <Text style={[styles.text, { color: fg }]}>{label ?? urgencyLabels[urgency]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { ...typography.label },
});
