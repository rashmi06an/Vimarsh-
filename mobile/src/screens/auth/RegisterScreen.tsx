import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { TextField } from '../../components/TextField';
import { Button } from '../../components/Button';
import { QrScanner } from '../../components/QrScanner';
import { colors, radius, spacing } from '../../theme';
import { t } from '../../i18n';
import { authApi, invitesApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import type { InviteValidation } from '../../api/types';
import type { AuthStackParams } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParams, 'Register'>;

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const passwordOk = (p: string) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(p);
// Canonicalise a typed/scanned code the same way the backend does (strip prefix, dashes, case).
const normalizeCode = (raw: string) =>
  (raw ?? '').toUpperCase().replace(/VIMARSH:\/\/INVITE\//g, '').replace(/[^A-Z0-9]/g, '');

export function RegisterScreen({ navigation, route }: Props) {
  const { adoptSession } = useAuth();
  const [inviteCode, setInviteCode] = useState(route.params?.inviteToken ?? '');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [invite, setInvite] = useState<InviteValidation | null>(null);
  // "Ask for a code" flow (prospective member with no invite yet).
  const [reqOpen, setReqOpen] = useState(false);
  const [reqNote, setReqNote] = useState('');
  const [reqMsg, setReqMsg] = useState<string | null>(null);
  const [reqLoading, setReqLoading] = useState(false);

  const requestCode = async () => {
    if (!fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setReqMsg('Enter your name and a valid email above first.');
      return;
    }
    setReqLoading(true);
    setReqMsg(null);
    try {
      const res = await authApi.requestAccess({ fullName: fullName.trim(), email: email.trim().toLowerCase(), note: reqNote.trim() || undefined });
      setReqMsg(res.message);
      setReqOpen(false);
    } catch (e) {
      setReqMsg(e instanceof ApiError ? e.message : 'Could not send your request. Please try again.');
    } finally {
      setReqLoading(false);
    }
  };

  // Pre-check the code so the member sees what they're joining before filling the form.
  const checkInvite = async (raw: string) => {
    const code = normalizeCode(raw);
    if (code.length < 8) {
      setInvite(null);
      return;
    }
    try {
      setInvite(await invitesApi.validate(code));
    } catch {
      setInvite(null);
    }
  };

  const onScanned = (data: string) => {
    setScanning(false);
    const code = normalizeCode(data);
    setInviteCode(code);
    checkInvite(code);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (normalizeCode(inviteCode).length < 8) e.inviteCode = t('register.inviteRequired');
    if (!fullName.trim()) e.fullName = t('common.required');
    if (!emailOk(email)) e.email = 'Enter a valid email';
    if (!passwordOk(password)) e.password = t('register.passwordHint');
    if (password !== confirm) e.confirm = t('register.passwordsNoMatch');
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    setSubmitErr(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.register({
        inviteToken: normalizeCode(inviteCode),
        email: email.trim().toLowerCase(),
        fullName: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      // Account is active and a session is returned — sign straight in.
      await adoptSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, expiresIn: res.expiresIn }, res.user);
    } catch (err) {
      setSubmitErr(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="title">{t('register.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('register.subtitle')}
        </Text>
      </View>

      <TextField
        label={t('register.inviteLabel')}
        value={inviteCode}
        onChangeText={setInviteCode}
        onEndEditing={() => checkInvite(inviteCode)}
        error={errors.inviteCode}
        placeholder={t('register.invitePlaceholder')}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button title={t('register.scan')} variant="outline" onPress={() => setScanning(true)} />

      <Button
        title={reqOpen ? 'Hide code request' : "Don't have a code? Ask an admin"}
        variant="ghost"
        onPress={() => { setReqOpen((v) => !v); setReqMsg(null); }}
      />
      {reqOpen && (
        <View style={styles.reqBox}>
          <Text variant="caption" color={colors.textMuted}>
            Enter your name and email above, then send a request. An admin will be notified and can issue you a code.
          </Text>
          <TextField label="Note to admin (optional)" value={reqNote} onChangeText={setReqNote} placeholder="e.g. Faculty, CSE at IIT Delhi" autoCapitalize="sentences" />
          <Button title="Send request" variant="accent" onPress={requestCode} loading={reqLoading} />
        </View>
      )}
      {!!reqMsg && <Text variant="caption" color={colors.primary} style={styles.reqMsg}>{reqMsg}</Text>}

      {invite?.valid && (
        <View style={styles.inviteBanner}>
          <Text variant="caption" color={colors.success ?? colors.primary}>
            {t('register.joiningAs', { role: invite.role ?? '', org: invite.orgName ?? '' })}
          </Text>
        </View>
      )}

      <View style={styles.gap} />

      <TextField label={t('common.fullName')} value={fullName} onChangeText={setFullName} error={errors.fullName} autoCapitalize="words" />
      <TextField label={t('common.email')} value={email} onChangeText={setEmail} error={errors.email} keyboardType="email-address" autoComplete="email" />
      <TextField label={t('common.password')} value={password} onChangeText={setPassword} error={errors.password} secure />
      <TextField label={t('register.confirmPassword')} value={confirm} onChangeText={setConfirm} error={errors.confirm} secure />
      <TextField label={t('common.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      {!!submitErr && (
        <Text variant="body" color={colors.danger} style={styles.err}>
          {submitErr}
        </Text>
      )}

      <Button title={t('register.cta')} variant="accent" onPress={onSubmit} loading={loading} />
      <Button title={t('register.haveAccount')} variant="ghost" onPress={() => navigation.navigate('Login')} />

      <QrScanner visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.xl },
  sub: { marginTop: spacing.sm },
  gap: { height: spacing.md },
  inviteBanner: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  err: { marginBottom: spacing.md },
  reqBox: { gap: spacing.sm, marginTop: spacing.sm, padding: spacing.md, backgroundColor: colors.surfaceAlt, borderRadius: radius.md },
  reqMsg: { marginTop: spacing.sm },
});
