import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native';
import {
  Users,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  UserCheck,
  Search,
  Sparkles,
  Flame,
  Filter,
  ChevronLeft,
  Dumbbell,
  Check,
  Info,
  MapPin,
} from 'lucide-react-native';
import { fontFamilies } from '@/design-system/tokens';
import { Skeleton } from '@/components/ui';
import { useH4Classes, useH4BookClass, useH4CancelClass, GymClassItem } from '../api/h4.api';
import { H4TopHeader } from './H4TopHeader';

type CategoryFilter = 'ALL' | 'BOOKED' | 'AVAILABLE' | 'HIIT' | 'YOGA' | 'STRENGTH';

const isClassPast = (scheduleDateStr: string, endTimeStr: string) => {
  try {
    const classDate = new Date(scheduleDateStr);
    let hours = 0;
    let minutes = 0;
    
    const timeClean = endTimeStr.trim().toUpperCase();
    const isPM = timeClean.includes('PM');
    const isAM = timeClean.includes('AM');
    
    const numbersOnly = timeClean.replace(/[AM|PM]/g, '').trim();
    const parts = numbersOnly.split(':');
    
    if (parts.length >= 1) {
      hours = parseInt(parts[0], 10);
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
    }
    if (parts.length >= 2) {
      minutes = parseInt(parts[1], 10);
    }
    
    classDate.setHours(hours, minutes, 0, 0);
    return new Date() > classDate;
  } catch {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cDate = new Date(scheduleDateStr);
    cDate.setHours(0, 0, 0, 0);
    return today > cDate;
  }
};

export function H4Classes() {
  const [viewAllBranches, setViewAllBranches] = useState(false);
  const { data: classesList, isLoading, isRefetching, refetch } = useH4Classes(viewAllBranches);
  const bookMutation = useH4BookClass();
  const cancelMutation = useH4CancelClass();

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const classes = useMemo(() => {
    return Array.isArray(classesList) ? classesList : [];
  }, [classesList]);

  // Statistics
  const totalClasses = classes.length;
  const bookedClassesCount = classes.filter((c) => c.isBooked).length;
  const openSeatsCount = classes.reduce((sum, c) => sum + (c.seatsAvailable || 0), 0);

  // Filtered list
  const filteredClasses = useMemo(() => {
    return classes.filter((cls) => {
      // Category filter
      if (activeCategory === 'BOOKED' && !cls.isBooked) return false;
      if (activeCategory === 'AVAILABLE' && (cls.seatsAvailable <= 0 || cls.isBooked)) return false;
      if (activeCategory === 'HIIT' && !cls.type?.toLowerCase().includes('hiit') && !cls.name?.toLowerCase().includes('hiit')) return false;
      if (activeCategory === 'YOGA' && !cls.type?.toLowerCase().includes('yoga') && !cls.name?.toLowerCase().includes('yoga')) return false;
      if (activeCategory === 'STRENGTH' && !cls.type?.toLowerCase().includes('strength') && !cls.name?.toLowerCase().includes('strength')) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = cls.name?.toLowerCase().includes(q);
        const matchesTrainer = cls.trainerName?.toLowerCase().includes(q);
        const matchesType = cls.type?.toLowerCase().includes(q);
        const matchesBranch = cls.branchName?.toLowerCase().includes(q);
        return matchesName || matchesTrainer || matchesType || matchesBranch;
      }
      return true;
    });
  }, [classes, activeCategory, searchQuery]);

  const handleBook = async (cls: GymClassItem) => {
    const classId = cls._id || cls.id || '';
    try {
      setActionLoadingId(classId);
      await bookMutation.mutateAsync(classId);
      Alert.alert('✅ Seat Reserved!', `Your seat for ${cls.name} has been confirmed.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Could not book class';
      Alert.alert('Booking Error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (cls: GymClassItem) => {
    const classId = cls._id || cls.id || '';
    try {
      setActionLoadingId(classId);
      await cancelMutation.mutateAsync(classId);
      Alert.alert('Booking Cancelled', `Your reservation for ${cls.name} was cancelled.`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Could not cancel booking';
      Alert.alert('Cancellation Error', msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <View style={styles.root}>
      <H4TopHeader title="Group Classes" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#F0A020']} />
        }
      >
        {/* Banner Header Card */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerBadgeRow}>
            <View style={styles.sparkleTag}>
              <Sparkles size={12} color="#F0A020" />
              <Text style={styles.sparkleTagText}>H4 STUDIO SCHEDULE</Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>LIVE BOOKING</Text>
            </View>
          </View>

          <Text style={styles.bannerTitle}>Group Workouts & Studio Sessions</Text>
          <Text style={styles.bannerSubtitle}>
            Reserve your spot for high-energy studio workouts, certified coaching, and strength sessions.
          </Text>

          {/* Quick Metrics Bar */}
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{totalClasses}</Text>
              <Text style={styles.metricLabel}>Total Classes</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: '#16A34A' }]}>{bookedClassesCount}</Text>
              <Text style={styles.metricLabel}>My Reserved</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricValue, { color: '#F0A020' }]}>{openSeatsCount}</Text>
              <Text style={styles.metricLabel}>Open Seats</Text>
            </View>
          </View>

          {/* Branch Filter Switch */}
          <View style={styles.branchSwitchContainer}>
            <TouchableOpacity
              style={[styles.branchSwitchBtn, !viewAllBranches && styles.branchSwitchBtnActive]}
              onPress={() => setViewAllBranches(false)}
              activeOpacity={0.8}
            >
              <MapPin size={13} color={!viewAllBranches ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.branchSwitchText, !viewAllBranches && styles.branchSwitchTextActive]}>
                My Home Branch
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.branchSwitchBtn, viewAllBranches && styles.branchSwitchBtnActive]}
              onPress={() => setViewAllBranches(true)}
              activeOpacity={0.8}
            >
              <Sparkles size={13} color={viewAllBranches ? '#FFFFFF' : '#64748B'} />
              <Text style={[styles.branchSwitchText, viewAllBranches && styles.branchSwitchTextActive]}>
                All Partner Studios
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Search size={18} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search class name, trainer, or branch..."
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <XCircle size={16} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Category Filters Carousel */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {[
            { key: 'ALL', label: 'All Classes' },
            { key: 'BOOKED', label: `My Bookings (${bookedClassesCount})` },
            { key: 'AVAILABLE', label: 'Open Slots' },
            { key: 'HIIT', label: 'HIIT & Cardio' },
            { key: 'STRENGTH', label: 'Strength & Conditioning' },
            { key: 'YOGA', label: 'Yoga & Recovery' },
          ].map((item) => {
            const isActive = activeCategory === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveCategory(item.key as CategoryFilter)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Classes List */}
        {isLoading ? (
          <View style={{ gap: 14 }}>
            <Skeleton style={{ height: 180, borderRadius: 20 }} />
            <Skeleton style={{ height: 180, borderRadius: 20 }} />
            <Skeleton style={{ height: 180, borderRadius: 20 }} />
          </View>
        ) : filteredClasses.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Users size={32} color="#F0A020" />
            </View>
            <Text style={styles.emptyTitle}>No Classes Found</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || activeCategory !== 'ALL'
                ? 'No fitness classes match your search criteria. Try clearing filters.'
                : 'No studio workout sessions scheduled right now. Check back soon!'}
            </Text>
            {(searchQuery || activeCategory !== 'ALL') && (
              <TouchableOpacity
                style={styles.clearFilterBtn}
                onPress={() => {
                  setSearchQuery('');
                  setActiveCategory('ALL');
                }}
              >
                <Text style={styles.clearFilterText}>Reset Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.classList}>
            {filteredClasses.map((cls) => {
              const classId = cls._id || cls.id || '';
              const isFull = cls.seatsAvailable <= 0 && !cls.isBooked;
              const isActioning = actionLoadingId === classId;
              const isAttended = cls.bookingStatus?.toLowerCase() === 'attended';
              const formattedDate = new Date(cls.scheduleDate).toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });

              const isPast = isClassPast(cls.scheduleDate, cls.endTime);

              // Capacity percentage
              const totalSeats = cls.maxSeats || 10;
              const takenSeats = totalSeats - (cls.seatsAvailable || 0);
              const capacityPercent = Math.min(100, Math.max(0, (takenSeats / totalSeats) * 100));

              return (
                <View key={classId} style={[styles.classCard, cls.isBooked && styles.bookedCardBorder]}>
                  {cls.imageUrl ? (
                    <Image source={{ uri: cls.imageUrl }} style={styles.cardHeaderImage} resizeMode="cover" />
                  ) : null}

                  {/* Top Category Badge & Status */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.categoryPill}>
                      <Dumbbell size={12} color="#F0A020" />
                      <Text style={styles.categoryPillText}>{(cls.type || 'STUDIO').toUpperCase()}</Text>
                    </View>

                    {isAttended ? (
                      <View style={[styles.statusBookedBadge, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
                        <CheckCircle2 size={13} color="#16A34A" />
                        <Text style={[styles.statusBookedText, { color: '#16A34A' }]}>✓ ATTENDED</Text>
                      </View>
                    ) : isPast ? (
                      <View style={[styles.statusFullBadge, { backgroundColor: '#F3F4F6' }]}>
                        <Text style={[styles.statusFullText, { color: '#6B7280' }]}>COMPLETED</Text>
                      </View>
                    ) : cls.isBooked ? (
                      <View style={styles.statusBookedBadge}>
                        <CheckCircle2 size={13} color="#16A34A" />
                        <Text style={styles.statusBookedText}>RESERVED</Text>
                      </View>
                    ) : isFull ? (
                      <View style={styles.statusFullBadge}>
                        <Text style={styles.statusFullText}>CLASS FULL</Text>
                      </View>
                    ) : (
                      <View style={styles.statusOpenBadge}>
                        <Text style={styles.statusOpenText}>{cls.seatsAvailable} SPOTS LEFT</Text>
                      </View>
                    )}
                  </View>

                  {/* Class Title & Description */}
                  <Text style={styles.classTitle}>{cls.name}</Text>
                  {cls.description ? (
                    <Text style={styles.classDescription} numberOfLines={2}>
                      {cls.description}
                    </Text>
                  ) : null}

                  {/* Meta Items Row */}
                  <View style={styles.metaRow}>
                    {/* Branch Location Badge */}
                    <View style={[styles.metaBadge, styles.branchBadge]}>
                      <MapPin size={13} color="#F0A020" />
                      <Text style={[styles.metaText, styles.branchBadgeText]} numberOfLines={1}>
                        {cls.branchName || 'Main Studio'}
                      </Text>
                    </View>

                    <View style={styles.metaBadge}>
                      <Calendar size={13} color="#F0A020" />
                      <Text style={styles.metaText}>{formattedDate}</Text>
                    </View>

                    <View style={styles.metaBadge}>
                      <Clock size={13} color="#F0A020" />
                      <Text style={styles.metaText}>
                        {cls.startTime} - {cls.endTime}
                      </Text>
                    </View>

                    <View style={styles.metaBadge}>
                      <UserCheck size={13} color="#F0A020" />
                      <Text style={styles.metaText}>{cls.trainerName || 'H4 Certified Trainer'}</Text>
                    </View>
                  </View>

                  {/* Seat Capacity Progress Meter */}
                  <View style={styles.capacitySection}>
                    <View style={styles.capacityLabelRow}>
                      <Text style={styles.capacityLabel}>Studio Seat Capacity</Text>
                      <Text style={styles.capacityCountText}>
                        {cls.seatsAvailable} of {cls.maxSeats} available
                      </Text>
                    </View>
                    <View style={styles.capacityTrack}>
                      <View
                        style={[
                          styles.capacityFill,
                          {
                            width: `${capacityPercent}%`,
                            backgroundColor: capacityPercent > 80 ? '#DC2626' : '#F0A020',
                          },
                        ]}
                      />
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    {isPast ? (
                      <View style={[styles.reserveBtn, styles.reserveBtnDisabled, { backgroundColor: '#E5E7EB' }]}>
                        <Text style={[styles.reserveBtnText, { color: '#9CA3AF' }]}>Class Ended / Completed</Text>
                      </View>
                    ) : cls.isBooked ? (
                      <TouchableOpacity
                        style={styles.cancelBookingBtn}
                        onPress={() => handleCancel(cls)}
                        disabled={isActioning}
                        activeOpacity={0.85}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <>
                            <XCircle size={16} color="#DC2626" />
                            <Text style={styles.cancelBookingText}>Cancel Reservation</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.reserveBtn, isFull && styles.reserveBtnDisabled]}
                        onPress={() => handleBook(cls)}
                        disabled={isFull || isActioning}
                        activeOpacity={0.85}
                      >
                        {isActioning ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <CheckCircle2 size={16} color="#FFFFFF" />
                            <Text style={styles.reserveBtnText}>
                              {isFull ? 'Class Full' : 'Reserve Seat Now'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFC' },
  content: { padding: 18, paddingBottom: 100, gap: 16 },

  bannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  bannerBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sparkleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(240, 160, 32, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240, 160, 32, 0.25)',
  },
  sparkleTagText: { fontSize: 10, fontWeight: '900', color: '#F0A020', letterSpacing: 0.8 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  livePillText: { fontSize: 9, fontWeight: '900', color: '#16A34A', letterSpacing: 0.5 },

  bannerTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  bannerSubtitle: { fontSize: 13, color: '#64748B', lineHeight: 18 },

  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  metricItem: { alignItems: 'center', gap: 2 },
  metricValue: { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  metricLabel: { fontSize: 11, color: '#64748B' },
  metricDivider: { width: 1, height: 24, backgroundColor: '#E2E8F0' },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A' },

  filterScroll: { gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#F0A020',
    borderColor: '#F0A020',
  },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  filterChipTextActive: { color: '#FFFFFF' },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(240, 160, 32, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19 },
  clearFilterBtn: {
    backgroundColor: 'rgba(240, 160, 32, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240, 160, 32, 0.3)',
    marginTop: 6,
  },
  clearFilterText: { fontSize: 13, fontWeight: '800', color: '#F0A020' },

  classList: { gap: 16 },
  classCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  cardHeaderImage: {
    width: '100%',
    height: 130,
    borderRadius: 14,
    marginBottom: 4,
  },
  bookedCardBorder: {
    borderColor: 'rgba(22, 163, 74, 0.4)',
    backgroundColor: '#FAFFFC',
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(240, 160, 32, 0.12)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryPillText: { fontSize: 10, fontWeight: '900', color: '#F0A020', letterSpacing: 0.5 },

  statusBookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBookedText: { fontSize: 10, fontWeight: '900', color: '#16A34A', letterSpacing: 0.5 },

  statusFullBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusFullText: { fontSize: 10, fontWeight: '900', color: '#DC2626', letterSpacing: 0.5 },

  statusOpenBadge: {
    backgroundColor: 'rgba(240, 160, 32, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOpenText: { fontSize: 10, fontWeight: '900', color: '#F0A020', letterSpacing: 0.5 },

  classTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  classDescription: { fontSize: 13, color: '#64748B', lineHeight: 18 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metaText: { fontSize: 12, fontWeight: '600', color: '#334155' },

  capacitySection: { gap: 6, paddingTop: 4 },
  capacityLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  capacityLabel: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  capacityCountText: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
  capacityTrack: { height: 6, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  capacityFill: { height: '100%', borderRadius: 3 },

  actionRow: { paddingTop: 6 },
  reserveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0A020',
    paddingVertical: 14,
    borderRadius: 14,
  },
  reserveBtnDisabled: { backgroundColor: '#CBD5E1' },
  reserveBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },

  cancelBookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    paddingVertical: 13,
    borderRadius: 14,
  },
  cancelBookingText: { fontSize: 14, fontWeight: '800', color: '#DC2626' },

  branchSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    gap: 4,
    marginTop: 2,
  },
  branchSwitchBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  branchSwitchBtnActive: {
    backgroundColor: '#F0A020',
  },
  branchSwitchText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  branchSwitchTextActive: {
    color: '#FFFFFF',
  },

  branchBadge: {
    backgroundColor: 'rgba(240, 160, 32, 0.08)',
    borderColor: 'rgba(240, 160, 32, 0.25)',
  },
  branchBadgeText: {
    color: '#D97706',
    fontWeight: '700',
  },
});
