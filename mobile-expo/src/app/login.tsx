import { Hospital, Lock, Mail } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '../api/client';
import { useSession } from '../auth/SessionProvider';
import { palette, radius, spacing } from '../theme/tokens';

/**
 * Personel giriş ekranı.
 *
 * Hastane adı kimlik doğrulaması gerektirmeyen `GET /settings` ile okunur;
 * her müşteri hastane kendi adını görür (beyaz etiketleme). Alanlar boş
 * gönderilemez; sunucuya gitmeden önce alan altında uyarı gösterilir.
 */
export default function LoginScreen() {
  const { signIn, hospitalName } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailMissing = touched && email.trim().length === 0;
  const passwordMissing = touched && password.length === 0;

  const handleSubmit = async () => {
    setTouched(true);
    if (!email.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Hospital size={56} color={palette.primary} style={styles.logo} />
            <Text style={styles.hospital}>{hospitalName}</Text>
            <Text style={styles.subtitle}>İlaç Takip Sistemi - Hemşire, başhemşire ve doktor girişi</Text>

            <View style={styles.card}>
              <Field icon={<Mail size={20} color={palette.textMuted} />} error={emailMissing ? 'E-posta gerekli' : undefined}>
                <TextInput
                  style={styles.input}
                  placeholder="E-posta"
                  placeholderTextColor={palette.textMuted}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="username"
                  editable={!submitting}
                  value={email}
                  onChangeText={setEmail}
                  returnKeyType="next"
                />
              </Field>

              <Field icon={<Lock size={20} color={palette.textMuted} />} error={passwordMissing ? 'Şifre gerekli' : undefined}>
                <TextInput
                  style={styles.input}
                  placeholder="Şifre"
                  placeholderTextColor={palette.textMuted}
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  editable={!submitting}
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="go"
                />
              </Field>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [styles.button, (pressed || submitting) && { opacity: 0.85 }]}
                onPress={handleSubmit}
                disabled={submitting}
                accessibilityRole="button"
              >
                {submitting ? <ActivityIndicator color={palette.onPrimary} /> : <Text style={styles.buttonText}>Giriş Yap</Text>}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ icon, error, children }: { icon: ReactNode; error?: string; children: ReactNode }) {
  return (
    <View>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        {icon}
        {children}
      </View>
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  content: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  logo: { alignSelf: 'center' },
  hospital: { marginTop: spacing.lg, fontSize: 24, fontWeight: '700', color: palette.text, textAlign: 'center' },
  subtitle: { marginTop: spacing.xs, fontSize: 14, color: palette.textSubtle, textAlign: 'center' },
  card: {
    marginTop: spacing.xxl,
    backgroundColor: palette.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 54,
    paddingHorizontal: spacing.md,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
  },
  fieldError: { borderColor: palette.overdue },
  fieldErrorText: { marginTop: 4, marginLeft: spacing.md, fontSize: 12, color: palette.overdue },
  input: { flex: 1, fontSize: 16, color: palette.text, height: '100%' },
  errorBox: { padding: spacing.md, backgroundColor: palette.errorContainer, borderRadius: radius.md },
  errorText: { fontSize: 14, color: palette.onErrorContainer },
  button: {
    marginTop: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 16, fontWeight: '600', color: palette.onPrimary },
});
