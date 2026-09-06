import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { theme } from '@/design-system/theme';
import { Typography, Card, Skeleton } from '@/components/ui';
import { useH4Attendance, useH4CheckIn, useH4DigitalPass } from '../api/h4.api';
import { 
  CalendarCheck, QrCode, CheckCircle, ShieldCheck, 
  RotateCw, Key, Flame, Zap, MapPin, ChevronRight, Info
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { H4TopHeader } from './H4TopHeader';

const { width } = Dimensions.get('window');

// ─── Heatmap Generator ────────────────────────────────────────────────────────
// Builds a 12-week (84-day) GitHub-style contribution matrix
const generateHeatmapGrid = (records: any[]) => {
  const visitDateSet = new Set(
    records.map(r => {
      try {
        return new Date(r.date).toISOString().split('T')[0];
      } catch {
        return '';
      }
    }).filter(Boolean)
  );

  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 12 weeks = 84 days back
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const hasWorkout = visitDateSet.has(dateStr);
    days.push({
      dateStr,
      dayOfWeek: d.getDay(), // 0 = Sun, 6 = Sat
      hasWorkout,
      isToday: i === 0,
    });
  }

  // Chunk into 12 columns of 7 days
  const columns = [];
  for (let i = 0; i < days.length; i += 7) {
    columns.push(days.slice(i, i + 7));
  }

  return { columns, totalVisits: visitDateSet.size };
};

export function H4Attendance() {
  const router = useRouter();
  const { data: attendanceData, isLoading: isAttLoading } = useH4Attendance();
  const records = attendanceData?.data ?? [];
  const { data: passData, isLoading: isPassLoading, refetch: refetchPass } = useH4DigitalPass();
  const checkInMutation = useH4CheckIn();

  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Countdown timer for 60-second rotating pass
  useEffect(() => {
    const initialSeconds = passData?.expiresInSeconds || 60;
    setSecondsRemaining(initialSeconds);

    const timer = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          refetchPass();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [passData, refetchPass]);

  // Heatmap calculations
  const heatmap = useMemo(() => generateHeatmapGrid(records), [records]);

  // One-tap check-in
  const handleMarkAttendance = async () => {
    try {
      await checkInMutation.mutateAsync({});
      setSuccessMsg('Attendance marked successfully! Check-in recorded.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Check-in failed. Please scan branch QR code.';
      Alert.alert('Attendance Check-In', msg);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <H4TopHeader title="Attendance & Pass" />
      <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── 1. Digital Membership Pass (Permanent QR & Session Counter) ── */}
        <Card style={styles.passCard}>
          <View style={styles.passCardHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.memberTag}>
                <Zap size={12} color="#F0A020" />
                <Typography variant="caption" style={styles.memberTagText}>H4 MEMBERSHIP PASS</Typography>
              </View>
              <Typography variant="h2" style={styles.memberName}>
                {passData?.member?.name || 'Active Member'}
              </Typography>
              <Typography variant="caption" color="secondary" style={{ marginTop: 2 }}>
                {passData?.member?.planName || 'Gym Membership'} • Phone: {passData?.member?.phone || 'Verified'}
              </Typography>
            </View>

            <View style={[styles.countdownBadge, { backgroundColor: 'rgba(22, 163, 74, 0.12)', borderColor: 'rgba(22, 163, 74, 0.3)' }]}>
              <CheckCircle size={12} color="#16A34A" />
              <Typography variant="caption" style={[styles.countdownText, { color: '#16A34A' }]}>
                ACTIVE
              </Typography>
            </View>
          </View>

          {/* Session Credits Badge (if session-based or unlimited) */}
          <View style={styles.sessionStatusBanner}>
            <Typography variant="caption" style={{ color: '#0F172A', fontWeight: '700' }}>
              Sessions Remaining:
            </Typography>
            <Typography variant="bodySm" style={{ color: '#F0A020', fontWeight: '900' }}>
              {passData?.member?.sessionsTotal ? `${passData?.member?.sessionsRemaining} / ${passData?.member?.sessionsTotal} Sessions` : 'Unlimited Access'}
            </Typography>
          </View>

          {/* Permanent QR Code Container */}
          <View style={styles.qrWrapper}>
            <View style={styles.qrWhiteBox}>
              {isPassLoading || !passData?.qrData ? (
                <ActivityIndicator size="large" color="#F0A020" style={{ width: 170, height: 170 }} />
              ) : (
                <QRCode
                  value={passData.qrData}
                  size={170}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
              )}
            </View>

            <Typography variant="caption" style={styles.antiFraudHint}>
              Show this QR to reception desk or class trainer to check in
            </Typography>
          </View>

          {/* Member ID / Phone Identifier Box */}
          <View style={styles.pinContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Key size={14} color="#F0A020" />
              <Typography variant="caption" color="secondary">Desk Check-In Phone:</Typography>
            </View>
            <View style={styles.pinBox}>
              <Typography variant="body" style={styles.pinText}>
                {passData?.member?.phone || '••••'}
              </Typography>
            </View>
          </View>

          {/* Action Row: Self-Check-in & Scan Gym */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={styles.markBtn}
              onPress={handleMarkAttendance}
              disabled={checkInMutation.isPending}
              activeOpacity={0.85}
            >
              {checkInMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <CheckCircle size={16} color="#FFFFFF" />
                  <Typography variant="bodySm" style={styles.markBtnText}>One-Tap Present</Typography>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => router.push('/(h4)/scan' as any)}
              activeOpacity={0.85}
            >
              <QrCode size={16} color="#F0A020" />
              <Typography variant="bodySm" style={styles.scanBtnText}>Scan Desk QR</Typography>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Success Alert */}
        {successMsg && (
          <View style={styles.successBanner}>
            <CheckCircle size={16} color="#10B981" />
            <Typography variant="bodySm" style={{ color: '#10B981', fontWeight: '800', flex: 1 }}>
              {successMsg}
            </Typography>
          </View>
        )}

        {/* ── 2. GitHub-Style Workout Activity Heatmap ── */}
        <Card style={styles.heatmapCard}>
          <View style={styles.heatmapHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Flame size={18} color="#F0A020" />
              <Typography variant="h3" style={{ color: theme.colors.text }}>
                Workout Activity Grid
              </Typography>
            </View>
            <Typography variant="caption" style={{ color: '#F0A020', fontWeight: '800' }}>
              {heatmap.totalVisits} Workouts in 12 Weeks
            </Typography>
          </View>

          {/* Grid Scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            <View style={styles.gridMatrix}>
              {heatmap.columns.map((col, colIdx) => (
                <View key={colIdx} style={styles.gridColumn}>
                  {col.map((day, dayIdx) => (
                    <View
                      key={day.dateStr || dayIdx}
                      style={[
                        styles.gridCell,
                        day.hasWorkout && styles.gridCellActive,
                        day.isToday && styles.gridCellToday,
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Legend */}
          <View style={styles.legendRow}>
            <Typography variant="caption" color="secondary" style={{ fontSize: 10 }}>Less</Typography>
            <View style={[styles.legendCell, { backgroundColor: '#2D251C' }]} />
            <View style={[styles.legendCell, { backgroundColor: 'rgba(240, 160, 32, 0.4)' }]} />
            <View style={[styles.legendCell, { backgroundColor: '#F0A020' }]} />
            <Typography variant="caption" color="secondary" style={{ fontSize: 10 }}>More</Typography>
            <Typography variant="caption" color="secondary" style={{ fontSize: 10, marginLeft: 'auto' }}>
              Mon – Sun (84 Days)
            </Typography>
          </View>
        </Card>

        {/* ── 3. Unified Check-in History Section ── */}
        <View style={styles.sectionHeader}>
          <Typography variant="h3" style={{ color: theme.colors.text }}>Visit History</Typography>
          <Typography variant="caption" color="secondary">{records.length} Total Visits</Typography>
        </View>

        {isAttLoading ? (
          [1, 2, 3, 4].map((i) => <Skeleton key={i} style={styles.skeleton} />)
        ) : records.length === 0 ? (
          <Card style={styles.emptyCard}>
            <CalendarCheck size={28} color={theme.colors.textSecondary} style={{ marginBottom: 8 }} />
            <Typography variant="bodySm" color="secondary">No attendance check-ins recorded yet.</Typography>
            <Typography variant="caption" color="secondary" style={{ marginTop: 4 }}>
              Show your digital pass or scan the desk QR upon entry.
            </Typography>
          </Card>
        ) : (
          records.map((rec: any) => (
            <Card key={rec.id || rec._id} style={styles.row}>
              <View style={styles.dot} />
              <View style={{ flex: 1 }}>
                <Typography variant="bodySm" style={{ fontWeight: '800', color: theme.colors.text }}>
                  {new Date(rec.date).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Typography>
                <Typography variant="caption" color="secondary" style={{ marginTop: 2 }}>
                  {rec.gymName || 'H4 Fitness Gym'}
                </Typography>
              </View>

              <View style={styles.timeBadge}>
                <ShieldCheck size={13} color="#10B981" />
                <Typography variant="caption" style={{ fontWeight: '800', color: theme.colors.text }}>
                  {rec.checkInTime || '10:00 AM'}
                </Typography>
              </View>
            </Card>
          ))
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 18, paddingBottom: 100, gap: 16 },

  // Pass Card
  passCard: {
    padding: 18,
    backgroundColor: theme.colors.card,
    borderColor: '#3A3025',
    borderWidth: 1,
    borderRadius: 20,
    gap: 14,
  },
  passCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  memberTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(240, 160, 32, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  memberTagText: { color: '#F0A020', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  memberName: { color: theme.colors.text, fontWeight: '900', fontSize: 20 },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(240, 160, 32, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240, 160, 32, 0.3)',
  },
  countdownText: { color: '#F0A020', fontWeight: '900', fontSize: 12 },

  qrWrapper: { alignItems: 'center', marginVertical: 4 },
  qrWhiteBox: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  sessionStatusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#231D14',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3025',
  },
  progressBarTrack: {
    width: 170,
    height: 4,
    backgroundColor: '#3A3025',
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F0A020',
    borderRadius: 2,
  },
  antiFraudHint: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },

  pinContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#231D14',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3025',
  },
  pinBox: {
    backgroundColor: 'rgba(240, 160, 32, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0A020',
  },
  pinText: { color: '#F0A020', fontWeight: '900', letterSpacing: 2 },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  markBtn: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0A020',
    paddingVertical: 13,
    borderRadius: 14,
  },
  markBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  scanBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#F0A020',
    backgroundColor: 'rgba(240, 160, 32, 0.08)',
    paddingVertical: 13,
    borderRadius: 14,
  },
  scanBtnText: { color: '#F0A020', fontWeight: '800', fontSize: 13 },

  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },

  // Heatmap Card
  heatmapCard: {
    padding: 16,
    backgroundColor: theme.colors.card,
    borderColor: '#3A3025',
    borderWidth: 1,
    borderRadius: 20,
    gap: 8,
  },
  heatmapHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gridMatrix: { flexDirection: 'row', gap: 4, paddingVertical: 4 },
  gridColumn: { gap: 4 },
  gridCell: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: '#231D14',
    borderWidth: 1,
    borderColor: '#2D251C',
  },
  gridCellActive: {
    backgroundColor: '#F0A020',
    borderColor: '#D9860F',
  },
  gridCellToday: {
    borderColor: '#FFFFFF',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#3A3025',
  },
  legendCell: { width: 10, height: 10, borderRadius: 2 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingHorizontal: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: theme.colors.card,
    borderColor: '#3A3025',
    borderWidth: 1,
    borderRadius: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#231D14',
    borderWidth: 1,
    borderColor: '#3A3025',
  },
  emptyCard: { padding: 24, alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 16, borderWidth: 1, borderColor: '#3A3025' },
  skeleton: { height: 60, borderRadius: 16 },
});
