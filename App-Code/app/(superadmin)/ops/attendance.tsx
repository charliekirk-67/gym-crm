import React, { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Tabs, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Scan, UserCheck, ShieldCheck } from 'lucide-react-native';
import { theme } from '@/design-system/theme';
import { Typography, Card, Select, Button, Modal, EmptyState, Badge, Input } from '@/components/ui';
import { SafeAreaWrapper } from '@/components/layout';
import { useToast } from '@/hooks/useToast';
import { API_CLIENT } from '@/lib/api-client';

let CameraView: any = null;
let useCameraPermissions: any = () => [null, async () => ({ granted: false })];

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExpoCamera = require('expo-camera');
  CameraView = ExpoCamera.CameraView;
  useCameraPermissions = ExpoCamera.useCameraPermissions;
} catch (e) {
  console.warn('expo-camera failed to load:', e);
}

export default function MemberAttendanceScreen() {
  const toast = useToast();
  const router = useRouter();

  // Mode: 'member_checkin' (Front Desk scanning members) vs 'staff_clockin' (Staff scanning daily desk QR)
  const [activeTab, setActiveTab] = useState<'member_checkin' | 'staff_clockin'>('member_checkin');

  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [backupPin, setBackupPin] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'member' | 'staff'>('member');
  const [selectedMemberHistory, setSelectedMemberHistory] = useState<{ memberName: string; history: any[] } | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Camera permissions hook
  const [permission, requestPermission] = useCameraPermissions();

  // 1. Query Member List
  const { data: membersList } = useQuery<any[]>({
    queryKey: ['h4-active-members-attendance'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/members');
      const allMembers = data.members || data || [];
      return allMembers.filter((m: any) => m.status === 'Active');
    },
  });

  // 2. Query Today's Member Attendance
  const { data: todayAttendance, isLoading: isTodayLoading, refetch: refetchToday } = useQuery<any[]>({
    queryKey: ['h4-today-attendance'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/attendance/today');
      return data || [];
    },
  });

  // 3. Query Today's Staff Duty Clock-Ins
  const { data: todayStaffAttendance, isLoading: isStaffLoading, refetch: refetchStaffToday } = useQuery<any[]>({
    queryKey: ['h4-staff-today-attendance'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/attendance/staff-today');
      return data?.data || data?.records || data || [];
    },
  });

  // 4. Mark Member Attendance Mutation (Accepts memberId or dynamic QR payload or 4-digit PIN)
  const markAttendanceMutation = useMutation({
    mutationFn: async (payload: { memberId?: string; tokenOrPass?: string; pin?: string }) => {
      const { data } = await API_CLIENT.post('/attendance', payload);
      return data;
    },
    onSuccess: (data: any) => {
      toast.show(data?.message || 'Attendance marked successfully!', 'success');
      setSelectedMemberId('');
      setBackupPin('');
      setShowScanner(false);
      refetchToday();
    },
    onError: (err: any) => {
      toast.show(err.response?.data?.message || 'Failed to mark attendance', 'error');
    },
  });

  // 5. Staff Clock-In Mutation (Accepts duty token from daily branch QR)
  const staffClockInMutation = useMutation({
    mutationFn: async (payload: { dutyToken?: string }) => {
      const { data } = await API_CLIENT.post('/attendance/staff-clock-in', payload);
      return data;
    },
    onSuccess: (data: any) => {
      toast.show(data?.message || 'Staff duty clock-in successful!', 'success');
      setShowScanner(false);
      refetchStaffToday();
    },
    onError: (err: any) => {
      toast.show(err.response?.data?.message || 'Duty clock-in failed', 'error');
    },
  });

  // Scanner permission and open handler
  const handleStartScanner = async (mode: 'member' | 'staff') => {
    setScannerMode(mode);
    if (!CameraView) {
      setShowScanner(true);
      return;
    }
    if (!permission || !permission.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to scan QR codes.');
        return;
      }
    }
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!data) return;
    setShowScanner(false);

    if (scannerMode === 'staff') {
      let dutyToken = data;
      try {
        const parsed = JSON.parse(data);
        if (parsed.dutyToken) dutyToken = parsed.dutyToken;
      } catch {}
      staffClockInMutation.mutate({ dutyToken });
    } else {
      let tokenOrPass = data;
      let memberId: string | undefined = undefined;
      try {
        const parsed = JSON.parse(data);
        if (parsed.p) tokenOrPass = parsed.p;
        if (parsed.m) memberId = parsed.m;
      } catch {}
      markAttendanceMutation.mutate({ tokenOrPass, memberId: memberId || data });
    }
  };

  // View Attendance History
  const handleViewHistory = async (member: any) => {
    setLoadingHistory(true);
    try {
      const { data } = await API_CLIENT.get(`/attendance/member/${member._id || member.id}`);
      setSelectedMemberHistory({
        memberName: member.name,
        history: data || [],
      });
    } catch {
      toast.show('Failed to fetch attendance history', 'error');
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <SafeAreaWrapper scrollable={false}>
      <Tabs.Screen 
        options={{ 
          title: 'Attendance Desk',
          headerLeft: () => (
            <TouchableOpacity 
              onPress={() => router.replace('/(superadmin)/ops-hub')}
              style={styles.headerBackBtn}
              activeOpacity={0.7}
            >
              <ArrowLeft color={theme.colors.text} size={20} />
            </TouchableOpacity>
          )
        }} 
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Dual Mode Switcher Tabs */}
        <View style={styles.topTabsContainer}>
          <TouchableOpacity
            style={[styles.topTabBtn, activeTab === 'member_checkin' && styles.topTabBtnActive]}
            onPress={() => {
              setActiveTab('member_checkin');
              setShowScanner(false);
            }}
            activeOpacity={0.8}
          >
            <Scan size={15} color={activeTab === 'member_checkin' ? '#0F172A' : '#64748B'} />
            <Typography
              variant="bodySm"
              style={[styles.topTabText, activeTab === 'member_checkin' && styles.topTabTextActive]}
            >
              Member Check-In
            </Typography>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.topTabBtn, activeTab === 'staff_clockin' && styles.topTabBtnActive]}
            onPress={() => {
              setActiveTab('staff_clockin');
              setShowScanner(false);
            }}
            activeOpacity={0.8}
          >
            <UserCheck size={15} color={activeTab === 'staff_clockin' ? '#0F172A' : '#64748B'} />
            <Typography
              variant="bodySm"
              style={[styles.topTabText, activeTab === 'staff_clockin' && styles.topTabTextActive]}
            >
              Staff Duty Clock-In
            </Typography>
          </TouchableOpacity>
        </View>

        {/* ─── TAB 1: MEMBER CHECK-IN ─── */}
        {activeTab === 'member_checkin' && (
          <>
            <View style={styles.gridContainer}>
              {/* Manual Member Check-in Card */}
              <Card style={styles.actionCard}>
                <Typography variant="body" style={styles.cardHeader}>Member Check-In</Typography>
                <View style={{ marginBottom: theme.spacing.sm }}>
                  <Select 
                    label=""
                    options={(membersList || []).map((m: any) => ({ 
                      label: `${m.name} (${m.phone})${m.sessionsRemaining != null ? ` - ${m.sessionsRemaining} left` : ''}`, 
                      value: m._id || m.id 
                    }))}
                    value={selectedMemberId}
                    onValueChange={(val) => setSelectedMemberId(String(val))}
                    placeholder="Select Member"
                  />
                </View>
                <Button 
                  title="Check In Member"
                  disabled={!selectedMemberId}
                  loading={markAttendanceMutation.isPending}
                  onPress={() => {
                    markAttendanceMutation.mutate({
                      memberId: selectedMemberId
                    });
                  }}
                  style={styles.checkInBtn}
                />
              </Card>

              {/* QR Scanner Card */}
              <Card style={StyleSheet.flatten([styles.actionCard, { alignItems: 'center', justifyContent: 'center' }])}>
                <Typography variant="body" style={[styles.cardHeader, { textAlign: 'center' }]}>Member Pass Scan</Typography>
                <Typography variant="caption" color="secondary" style={styles.qrDesc}>
                  Scan member's digital QR pass from their mobile app.
                </Typography>
                <Button 
                  title={showScanner && scannerMode === 'member' ? "Stop Scanner" : "📱 Scan Member Pass"}
                  onPress={() => {
                    if (showScanner && scannerMode === 'member') {
                      setShowScanner(false);
                    } else {
                      handleStartScanner('member');
                    }
                  }}
                  style={showScanner && scannerMode === 'member' ? styles.stopScannerBtn : styles.startScannerBtn}
                />
              </Card>
            </View>

            {/* Live Camera Scanner Box for Members */}
            {showScanner && scannerMode === 'member' && (
              <Card style={styles.scannerCard}>
                <Typography variant="bodySm" style={{ fontWeight: '700', marginBottom: theme.spacing.sm }}>
                  {CameraView ? "Point camera at member's live 60s QR code" : "QR Scanner Fallback (Input ID or Pass)"}
                </Typography>
                {CameraView ? (
                  <View style={styles.cameraContainer}>
                    <CameraView 
                      style={StyleSheet.absoluteFill} 
                      onBarcodeScanned={handleBarcodeScanned}
                      barcodeScannerSettings={{
                        barcodeTypes: ['qr'],
                      }}
                    />
                  </View>
                ) : (
                  <View style={{ width: '100%' }}>
                    <Typography variant="caption" color="secondary" style={{ marginBottom: theme.spacing.sm }}>
                      Camera module not available in this environment.
                    </Typography>
                    <Input 
                      label="Enter Member ID or QR Payload"
                      value={selectedMemberId}
                      onChangeText={setSelectedMemberId}
                      placeholder="Paste ID or token"
                    />
                    <Button 
                      title="Check In Manually"
                      disabled={!selectedMemberId}
                      loading={markAttendanceMutation.isPending}
                      onPress={() => {
                        markAttendanceMutation.mutate({ memberId: selectedMemberId });
                      }}
                      style={{ marginTop: theme.spacing.sm }}
                    />
                  </View>
                )}
              </Card>
            )}

            {/* Today's Member Attendance Table */}
            <Typography variant="h3" style={styles.sectionHeader}>Today's Member Check-Ins</Typography>

            {isTodayLoading ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
            ) : (todayAttendance || []).length === 0 ? (
              <EmptyState 
                iconText="📋"
                title="No Members Checked In Today"
                description="Scan member passes or check them in manually to get started."
              />
            ) : (
              <Card style={{ padding: 0 }}>
                {(todayAttendance || []).map((att: any, idx: number) => {
                  const member = att.memberId;
                  return (
                    <View 
                      key={att._id || idx} 
                      style={[
                        styles.attRow, 
                        idx === (todayAttendance || []).length - 1 && { borderBottomWidth: 0 }
                      ]}
                    >
                      <View style={{ flex: 1.5 }}>
                        <Typography variant="bodySm" style={{ fontWeight: '700' }}>
                          {member?.name || 'Reception Check-in'}
                        </Typography>
                        <Typography variant="caption" color="secondary">
                          {member?.phone || 'Verified Pass'}
                        </Typography>
                      </View>
                      <View style={styles.timeCol}>
                        <Badge label={att.checkInTime || 'Checked In'} variant="active" />
                      </View>
                      <View style={styles.actionsCol}>
                        <TouchableOpacity 
                          onPress={() => handleViewHistory(member || att)}
                          style={styles.historyBtn}
                          disabled={loadingHistory}
                        >
                          <Typography variant="caption" style={styles.historyBtnText}>History</Typography>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {/* ─── TAB 2: STAFF DUTY CLOCK-IN ─── */}
        {activeTab === 'staff_clockin' && (
          <>
            <Card style={styles.dutyClockInCard}>
              <View style={styles.dutyCardHeader}>
                <View style={styles.dutyIconBadge}>
                  <ShieldCheck size={24} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography variant="body" style={{ fontWeight: '800' }}>
                    Daily Branch Duty Clock-In
                  </Typography>
                  <Typography variant="caption" color="secondary">
                    Scan the printed Daily Branch Duty QR placed at the gym reception desk to record your shift.
                  </Typography>
                </View>
              </View>

              <View style={styles.dutyActionRow}>
                <Button
                  title={showScanner && scannerMode === 'staff' ? "Close Duty Scanner" : "📷 Scan Reception Desk QR"}
                  onPress={() => {
                    if (showScanner && scannerMode === 'staff') {
                      setShowScanner(false);
                    } else {
                      handleStartScanner('staff');
                    }
                  }}
                  loading={staffClockInMutation.isPending}
                  style={showScanner && scannerMode === 'staff' ? styles.stopScannerBtn : styles.clockInStaffBtn}
                />
              </View>
            </Card>

            {/* Live Camera for Staff Duty Scan */}
            {showScanner && scannerMode === 'staff' && (
              <Card style={styles.scannerCard}>
                <Typography variant="bodySm" style={{ fontWeight: '700', marginBottom: theme.spacing.sm }}>
                  Point camera at the Daily Branch Duty QR on reception desk
                </Typography>
                {CameraView ? (
                  <View style={styles.cameraContainer}>
                    <CameraView 
                      style={StyleSheet.absoluteFill} 
                      onBarcodeScanned={handleBarcodeScanned}
                      barcodeScannerSettings={{
                        barcodeTypes: ['qr'],
                      }}
                    />
                  </View>
                ) : (
                  <View style={{ width: '100%', alignItems: 'center', gap: 10 }}>
                    <Typography variant="caption" color="secondary">
                      Camera preview not linked. Tap below to confirm duty clock-in.
                    </Typography>
                    <Button
                      title="Confirm Shift Duty Clock-In"
                      loading={staffClockInMutation.isPending}
                      onPress={() => staffClockInMutation.mutate({})}
                      style={styles.clockInStaffBtn}
                    />
                  </View>
                )}
              </Card>
            )}

            {/* Today's Staff Duty Roster */}
            <Typography variant="h3" style={styles.sectionHeader}>Staff On Duty Today</Typography>

            {isStaffLoading ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: theme.spacing.lg }} />
            ) : (todayStaffAttendance || []).length === 0 ? (
              <EmptyState 
                iconText="🛡️"
                title="No Staff Clocked In Yet"
                description="Staff members who scan the branch duty QR will appear here."
              />
            ) : (
              <Card style={{ padding: 0 }}>
                {(todayStaffAttendance || []).map((duty: any, idx: number) => {
                  return (
                    <View 
                      key={duty.id || duty._id || idx} 
                      style={[
                        styles.attRow, 
                        idx === (todayStaffAttendance || []).length - 1 && { borderBottomWidth: 0 }
                      ]}
                    >
                      <View style={{ flex: 1.5 }}>
                        <Typography variant="bodySm" style={{ fontWeight: '700' }}>
                          {duty.trainer?.name || duty.trainerName || 'Staff Member'}
                        </Typography>
                        <Typography variant="caption" color="secondary">
                          {duty.branch?.name || duty.branchName || 'Branch Duty'}
                        </Typography>
                      </View>
                      <View style={styles.timeCol}>
                        <Badge label={duty.checkInTime ? new Date(duty.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'On Duty'} variant="active" />
                      </View>
                      <View style={styles.actionsCol}>
                        <Badge label="VERIFIED" variant="active" />
                      </View>
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        )}
      </ScrollView>

      {/* MEMBER ATTENDANCE HISTORY MODAL */}
      <Modal 
        visible={!!selectedMemberHistory} 
        onClose={() => setSelectedMemberHistory(null)} 
        title={`Attendance History - ${selectedMemberHistory?.memberName}`}
      >
        <ScrollView style={{ maxHeight: 300 }}>
          {(selectedMemberHistory?.history || []).length === 0 ? (
            <Typography variant="caption" color="secondary" style={{ textAlign: 'center', marginVertical: theme.spacing.md }}>
              No check-in history found for this member.
            </Typography>
          ) : (
            (selectedMemberHistory?.history || []).map((hist: any, idx: number) => (
              <View key={hist._id || idx} style={styles.historyRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <Calendar size={14} color={theme.colors.textSecondary} />
                  <Typography variant="bodySm">
                    {new Date(hist.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </Typography>
                </View>
                <Badge label={hist.checkInTime} variant="active" />
              </View>
            ))
          )}
        </ScrollView>
      </Modal>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  topTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    gap: 4,
    marginBottom: theme.spacing.lg,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  topTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  topTabText: {
    fontWeight: '700',
    color: '#64748B',
  },
  topTabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  gridContainer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  actionCard: {
    flex: 1,
    padding: theme.spacing.md,
    justifyContent: 'flex-start',
  },
  cardHeader: {
    fontWeight: '800',
    marginBottom: theme.spacing.md,
  },
  checkInBtn: {
    backgroundColor: '#adff2f', // Web neon green color
    height: 40,
    minHeight: 40,
  },
  startScannerBtn: {
    backgroundColor: '#adff2f',
    height: 40,
    minHeight: 40,
    width: '100%',
  },
  stopScannerBtn: {
    backgroundColor: '#ef4444',
    height: 40,
    minHeight: 40,
    width: '100%',
  },
  qrDesc: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    minHeight: 36,
  },
  scannerCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  cameraContainer: {
    width: '100%',
    height: 200,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  dutyClockInCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  dutyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dutyIconBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dutyActionRow: {
    width: '100%',
  },
  clockInStaffBtn: {
    backgroundColor: '#adff2f',
    height: 44,
    width: '100%',
  },
  sectionHeader: {
    fontWeight: '800',
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
  },
  attRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  timeCol: {
    flex: 1,
    alignItems: 'center',
  },
  actionsCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  historyBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgTertiary,
  },
  historyBtnText: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.xs,
  },
});
