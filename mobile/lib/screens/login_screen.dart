import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../state/app_state.dart';

/// Hemsire, bashemsire ve doktor rolleri icin ortak giris ekrani. Basarili
/// girişten sonra kok widget (main.dart) AppState.isLoggedIn degisimini
/// dinleyip otomatik olarak HomeScreen'e gecer; burada ayrica Navigator
/// kullanilmiyor ki gezinme yiginin ikilenmesin. Ekran ayrica, backend'in
/// 401/403 dondurdugu bir oturum-sonu otomatik cikisindan sonra buraya
/// dusuldugunde tek seferlik bir bilgilendirme Toast'i gosterir (bkz.
/// [_showSessionExpiredNoticeIfAny]).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // main.dart bu ekrana yalnizca AppState.isLoggedIn false oldugunda
    // gecer - hem normal cikista hem de oturum sonu yonlendirmesinde. Ikisini
    // ayirt etmek icin AppState, yalnizca 401/403 kaynakli otomatik cikista
    // doldurulan tek seferlik bir mesaj tasir (bkz. consumeSessionExpiredMessage).
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _showSessionExpiredNoticeIfAny());
  }

  void _showSessionExpiredNoticeIfAny() {
    final message = context.read<AppState>().consumeSessionExpiredMessage();
    if (message == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Theme.of(context).colorScheme.error,
      ),
    );
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context
          .read<AppState>()
          .login(_emailController.text.trim(), _passwordController.text);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Giriş yapılamadı. Bağlantınızı kontrol edin.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.local_hospital_rounded,
                        size: 56, color: theme.colorScheme.primary),
                    const SizedBox(height: 16),
                    Text(
                      context.watch<AppState>().hospitalName,
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'İlaç Takip Sistemi - Hemşire, başhemşire ve doktor girişi',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: theme.colorScheme.outline),
                    ),
                    const SizedBox(height: 32),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            TextFormField(
                              controller: _emailController,
                              enabled: !_loading,
                              decoration: const InputDecoration(
                                labelText: 'E-posta',
                                prefixIcon: Icon(Icons.email_outlined),
                              ),
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [AutofillHints.email],
                              validator: (v) => (v == null || v.trim().isEmpty)
                                  ? 'E-posta gerekli'
                                  : null,
                            ),
                            const SizedBox(height: 16),
                            TextFormField(
                              controller: _passwordController,
                              enabled: !_loading,
                              decoration: const InputDecoration(
                                labelText: 'Şifre',
                                prefixIcon: Icon(Icons.lock_outline),
                              ),
                              obscureText: true,
                              autofillHints: const [AutofillHints.password],
                              onFieldSubmitted: (_) => _submit(),
                              validator: (v) => (v == null || v.isEmpty)
                                  ? 'Şifre gerekli'
                                  : null,
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: 16),
                              Container(
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.errorContainer,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  _error!,
                                  style: TextStyle(
                                      color:
                                          theme.colorScheme.onErrorContainer),
                                ),
                              ),
                            ],
                            const SizedBox(height: 24),
                            SizedBox(
                              height: 48,
                              child: FilledButton(
                                onPressed: _loading ? null : _submit,
                                child: _loading
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2.5,
                                            color: Colors.white),
                                      )
                                    : const Text('Giriş Yap',
                                        style: TextStyle(fontSize: 16)),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
