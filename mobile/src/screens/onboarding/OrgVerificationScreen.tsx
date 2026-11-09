import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { LoadingState, ErrorState } from '../../components/States';
import { colors, radius, spacing } from '../../theme';
import { t } from '../../i18n';
import { orgsApi, authApi } from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Department, Organization } from '../../api/types';

export function OrgVerificationScreen() {
  const { refreshProfile, signOut } = useAuth();
  const [orgs, setOrgs] = useState<Organization[] | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [designation, setDesignation] = useState('');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadOrgs = async () => {
    setLoadErr(null);
    try {
      setOrgs(await orgsApi.list());
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : t('errors.generic'));
    }
  };

  useEffect(() => {
    loadOrgs();
  }, []);

  useEffect(() => {
    if (!orgId) return;
    setDeptId(null);
    orgsApi.departments(orgId).then(setDepts).catch(() => setDepts([]));
  }, [orgId]);

  const onSubmit = async () => {
    setSubmitErr(null);
    if (!orgId) return setSubmitErr(t('org.selectOrg'));
    if (!designation.trim()) return setSubmitErr('Enter your designation');
    setSubmitting(true);
    try {
      await authApi.orgVerification({ orgId, departmentId: deptId ?? undefined, designation: designation.trim() });
      await refreshProfile(); // status stays PENDING_APPROVAL; Root shows ApplicationStatus
    } catch (err) {
      setSubmitErr(err instanceof ApiError ? err.message : t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (orgs === null && !loadErr) return <Screen><LoadingState label={t('common.loading')} /></Screen>;
  if (loadErr) return <Screen><ErrorState message={loadErr} onRetry={loadOrgs} /></Screen>;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text variant="title">{t('org.title')}</Text>
        <Text variant="body" color={colors.textMuted} style={styles.sub}>
          {t('org.subtitle')}
        </Text>
      </View>

      <Text variant="label" color={colors.textMuted} style={styles.lbl}>{t('org.organization')}</Text>
      {(orgs ?? []).map((o) => (
        <Pill key={o.id} label={`${o.name}`} hint={o.code} active={orgId === o.id} onPress={() => setOrgId(o.id)} />
      ))}

      {orgId && depts.length > 0 && (
        <>
          <Text variant="label" color={colors.textMuted} style={styles.lbl}>{t('org.department')}</Text>
          {depts.map((d) => (
            <Pill key={d.id} label={d.name} active={deptId === d.id} onPress={() => setDeptId(deptId === d.id ? null : d.id)} />
          ))}
        </>
      )}

      <View style={styles.gap} />
      <TextField label={t('org.designation')} value={designation} onChangeText={setDesignation} placeholder="e.g. Assistant Professor" />

      {!!submitErr && (
        <Text variant="body" color={colors.danger} style={styles.err}>
          {submitErr}
        </Text>
      )}

      <Button title={t('org.cta')} variant="accent" onPress={onSubmit} loading={submitting} />
      <Button title={t('common.signOut')} variant="ghost" onPress={signOut} />
    </Screen>
  );
}

function Pill({ label, hint, active, onPress }: { label: string; hint?: string; active: boolean; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <View style={styles.pillRow}>
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="semibold" color={active ? colors.primary : colors.text}>{label}</Text>
          {!!hint && <Text variant="caption" color={colors.textMuted}>{hint}</Text>}
        </View>
        <View style={[styles.radio, active && styles.radioActive]} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.lg, marginBottom: spacing.lg },
  sub: { marginTop: spacing.sm },
  lbl: { marginTop: spacing.md, marginBottom: spacing.sm },
  pill: { paddingVertical: spacing.md, marginBottom: spacing.sm },
  pillActive: { borderColor: colors.accent, borderWidth: 2 },
  pillRow: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioActive: { borderColor: colors.accent, backgroundColor: colors.accent },
  gap: { height: spacing.sm },
  err: { marginBottom: spacing.md },
});
