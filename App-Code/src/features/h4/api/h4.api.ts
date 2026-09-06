// H4 Member API layer — TanStack Query hooks
// Consumes existing backend: /api/member-portal/*
// AGENTS.md §4, §12 — server data via TanStack Query

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_CLIENT } from '@/lib/api-client';
import type { H4Plan, H4AttendanceRecord, H4PaymentRecord, H4DashboardData } from '../types';

// ─── Query Keys ─────────────────────────────────────────────────────────────
export const H4_KEYS = {
  dashboard: ['h4', 'dashboard'] as const,
  plan:       ['h4', 'plan']       as const,
  attendance: ['h4', 'attendance'] as const,
  payments:   ['h4', 'payments']   as const,
  classes:    ['h4', 'classes']    as const,
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
// Backend returns: { success, member, attendance[], partnerGyms[], sessionStatus, lastVisitedGym }
// We normalise this into the H4DashboardData shape the components expect.
export const useH4Dashboard = () =>
  useQuery<H4DashboardData>({
    queryKey: H4_KEYS.dashboard,
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/member-portal/dashboard');

      const attendanceList = data.attendance || data.recentHistory || [];
      const attendance: H4AttendanceRecord[] = attendanceList.map((a: any) => ({
        id:           a._id || a.id || '',
        date:         a.date || a.startedAt || new Date().toISOString(),
        checkInTime:  a.checkInTime || (a.startedAt ? new Date(a.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM'),
        checkOutTime: a.checkOutTime || undefined,
        gymName:      a.gymName || undefined,
      }));

      const paymentsList = data.recentPayments || [];
      const recentPayments: H4PaymentRecord[] = paymentsList.map((p: any) => ({
        id:           p._id || p.id || '',
        date:         p.date || new Date().toISOString(),
        amount:       p.amount ?? 0,
        method:       p.method || 'Cash',
        planName:     p.planName || p.description || undefined,
        status:       p.status || 'Paid',
      }));

      return {
        attendanceCount:  data.attendanceCount ?? attendance.length,
        recentAttendance: attendance,
        recentPayments:   recentPayments,
        sessionStatus:    data.sessionStatus ?? null,
        lastVisitedGym:   data.lastVisitedGym ?? null,
        member:           data.member ?? null,
      };
    },
    staleTime: 15_000,
  });

// ─── Plan ────────────────────────────────────────────────────────────────────
export const useH4Plan = () =>
  useQuery<H4Plan>({
    queryKey: H4_KEYS.plan,
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/member-portal/plan');
      const plan = data?.planId ?? data;
      return {
        planName:   plan?.name    ?? data?.planName  ?? null,
        expiryDate: data?.expiryDate ?? null,
        startDate:  data?.joinDate   ?? null,
        status:     data?.status     ?? 'Unknown',
        price:      data?.planPrice  ?? plan?.price ?? null,
      };
    },
    staleTime: 60_000,
  });

// ─── Attendance ──────────────────────────────────────────────────────────────
export const useH4Attendance = () =>
  useQuery<{ data: H4AttendanceRecord[]; total: number }>({
    queryKey: H4_KEYS.attendance,
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/member-portal/attendance');
      const records: H4AttendanceRecord[] = (Array.isArray(data) ? data : data.data ?? []).map(
        (a: any) => ({
          id:           a._id || a.id || '',
          date:         a.date || a.startedAt || '',
          checkInTime:  a.checkInTime || '',
          checkOutTime: a.checkOutTime || undefined,
          gymName:      a.gymName || undefined,
        })
      );
      return { data: records, total: records.length };
    },
    staleTime: 60_000,
  });

// ─── Payments ────────────────────────────────────────────────────────────────
export const useH4Payments = () =>
  useQuery<{ data: H4PaymentRecord[]; total: number }>({
    queryKey: H4_KEYS.payments,
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/member-portal/payments');
      const records: H4PaymentRecord[] = (Array.isArray(data) ? data : data.data ?? []).map(
        (p: any) => ({
          id: p._id || p.id || '',
          date: p.date || '',
          amount: p.amount ?? 0,
          method: p.method || 'Cash',
          planName: p.planName || p.description || undefined,
          status: p.status || 'Paid',
        })
      );
      return { data: records, total: records.length };
    },
    staleTime: 60_000,
  });

// ─── Digital Pass (Rotating TOTP QR & PIN) ──────────────────────────────────
export interface H4DigitalPass {
  success: boolean;
  member: {
    id: string;
    name: string;
    phone?: string;
    status?: string;
    gymId?: string;
    branchId?: string | null;
  };
  memberId: string;
  token: string;
  pin: string;
  expiresInSeconds: number;
  qrData: string;
}

export const useH4DigitalPass = () =>
  useQuery<H4DigitalPass>({
    queryKey: ['h4', 'digital-pass'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/member-portal/digital-pass');
      return data;
    },
    refetchInterval: 45_000, // Refresh automatically before token expires
  });

// ─── Check-in Mutation ────────────────────────────────────────────────────────
export const useH4CheckIn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { gymId?: string; branchId?: string; qrCode?: string }) => {
      const { data } = await API_CLIENT.post('/member-portal/sessions/check-in', {
        gymId: payload?.gymId || 'HOME_GYM',
        branchId: payload?.branchId,
        qrCode: payload?.qrCode || 'H4_GYM_STANDARD_QR',
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: H4_KEYS.attendance });
      qc.invalidateQueries({ queryKey: H4_KEYS.dashboard });
    },
  });
};

// ─── Classes Hooks ────────────────────────────────────────────────────────────
export interface GymClassItem {
  _id: string;
  id?: string;
  name: string;
  type: string;
  description?: string;
  trainerName: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  maxSeats: number;
  seatsAvailable: number;
  isBooked: boolean;
  bookingStatus?: string | null;
  branchName?: string;
  branchAddress?: string;
  imageUrl?: string;
}

export const useH4Classes = (allBranches: boolean = false) =>
  useQuery<GymClassItem[]>({
    queryKey: [...H4_KEYS.classes, allBranches ? 'all' : 'branch'],
    queryFn: async () => {
      const url = allBranches ? '/member-portal/classes?allBranches=true' : '/member-portal/classes';
      const { data } = await API_CLIENT.get(url);
      return Array.isArray(data) ? data : data?.data ?? [];
    },
    staleTime: 30_000,
  });

export const useH4BookClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string) => {
      const { data } = await API_CLIENT.post(`/member-portal/classes/${classId}/book`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: H4_KEYS.classes });
      qc.invalidateQueries({ queryKey: H4_KEYS.dashboard });
    },
  });
};

export const useH4CancelClass = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (classId: string) => {
      const { data } = await API_CLIENT.delete(`/member-portal/classes/${classId}/book`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: H4_KEYS.classes });
      qc.invalidateQueries({ queryKey: H4_KEYS.dashboard });
    },
  });
};

// ─── Workout & Diet Hooks ───────────────────────────────────────────────────
export const useH4WorkoutPlans = () =>
  useQuery<any[]>({
    queryKey: ['h4', 'workout-plans'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/workout-plans');
      const items = Array.isArray(data) ? data : (data?.data ?? []);
      return items.map((item: any) => {
        let exercises = item.exercises;
        if (typeof exercises === 'string') {
          try {
            exercises = JSON.parse(exercises);
          } catch {}
        }
        return { ...item, exercises: Array.isArray(exercises) ? exercises : [] };
      });
    },
    staleTime: 30_000,
  });

export const useH4DietPlans = () =>
  useQuery<any[]>({
    queryKey: ['h4', 'diet-plans'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/diet-plans');
      const items = Array.isArray(data) ? data : (data?.data ?? []);
      return items.map((item: any) => {
        let meals = item.meals;
        if (typeof meals === 'string') {
          try {
            meals = JSON.parse(meals);
          } catch {}
        }
        return { ...item, meals: Array.isArray(meals) ? meals : [] };
      });
    },
    staleTime: 30_000,
  });
