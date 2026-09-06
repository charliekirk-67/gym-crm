import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, ActivityIndicator, TextInput, BackHandler, TouchableOpacity, Alert, Share } from 'react-native';
import { useLocalSearchParams, Tabs, useRouter } from 'expo-router';
import { Search, ArrowLeft, Pencil, Trash2, Download, Phone, Mail, Calendar } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/design-system/theme';
import { Typography, Card, Input, Badge, EmptyState, Button, Modal, Select } from '@/components/ui';
import { useGenericList, useGenericCreate, useGenericUpdate, useGenericDelete, useBranches } from '@/features/superadmin/api/superadmin.api';
import { SafeAreaWrapper } from '@/components/layout';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { API_CLIENT } from '@/lib/api-client';

export default function OpsDetailScreen() {
  const toast = useToast();
  const params = useLocalSearchParams();
  const router = useRouter();
  const { selectedBranchId } = useAuth();
  
  const moduleKey = (params.module as string) || '';
  const moduleName = (params.name as string) || 'Operation Detail';

  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);

  // Filters State
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterBrand] = useState('');
  
  // Equipment specific tab state
  const [equipmentTab, setEquipmentTab] = useState<'inventory' | 'maintenance'>('inventory');

  // Handle hardware back press to return back to operations hub tab
  useEffect(() => {
    const onBackPress = () => {
      router.replace('/(superadmin)/ops-hub');
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [router]);

  // Queries
  const getEndpoint = () => {
    switch (moduleKey) {
      case 'profile': return '/gyms';
      case 'members': return '/members';
      case 'leads': return '/leads';
      case 'plans': return '/plans';
      case 'classes': return '/classes';
      case 'assessments': return '/body-assessments';
      case 'equipments': return '/equipments';
      case 'staff': return '/staff';
      case 'branches': return '/branches';
      case 'payments': return '/payments';
      case 'expenses': return '/expenses';
      case 'attendance': return '/attendance';
      case 'trainer_attendance': return '/trainer-attendance';
      case 'payroll': return '/payroll';
      default: return '/members';
    }
  };

  const { data: listData, isLoading } = useGenericList<any>(
    `h4-${moduleKey}`,
    getEndpoint()
  );

  // Auxiliary data queries for select dropdowns
  const { data: h4Plans } = useGenericList<any>('h4-plans', '/plans');
  const { data: h4Branches } = useBranches();
  const { data: h4Members } = useGenericList<any>('h4-members', '/members');

  // Maintenance logs query
  const { data: maintenanceLogs, isLoading: isLogsLoading } = useGenericList<any>(
    'h4-maintenance-logs',
    '/equipments/maintenance/logs',
    { enabled: moduleKey === 'equipments' && equipmentTab === 'maintenance' }
  );

  // Lead pipeline summary stats
  const { data: leadsSummary } = useQuery({
    queryKey: ['h4-leads-summary'],
    queryFn: async () => {
      const { data } = await API_CLIENT.get('/leads/summary');
      return data;
    },
    enabled: moduleKey === 'leads',
  });

  // Mutations
  const createMutation = useGenericCreate(`h4-${moduleKey}`, getEndpoint());
  const updateMutation = useGenericUpdate(`h4-${moduleKey}`, getEndpoint());
  const deleteMutation = useGenericDelete(`h4-${moduleKey}`, getEndpoint());

  // Form Fields States
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('Active');
  const [source, setSource] = useState('Walk-in');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('30');
  const [durationUnit, setDurationUnit] = useState('days');
  const [sessions, setSessions] = useState('0');
  const [trainerName, setTrainerName] = useState('');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('07:00');
  const [memberId, setMemberId] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [brand, setBrand] = useState('');
  const [role, setRole] = useState('trainer');
  const [salary, setSalary] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [category, setCategory] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');

  const isCreateable = [
    'members', 'leads', 'plans', 'classes', 'assessments', 'equipments', 'staff', 'payments', 'expenses', 'branches'
  ].includes(moduleKey);

  const isExportable = ['members', 'leads', 'payments', 'expenses'].includes(moduleKey);

  const getFilteredData = () => {
    let data = listData || [];
    
    if (moduleKey === 'pending_dues') {
      data = data.filter((m: any) => m.pendingBalance && m.pendingBalance > 0);
    } else if (moduleKey === 'freeze_system') {
      data = data.filter((m: any) => m.status === 'Frozen');
    }

    // Apply Filters
    if (filterStatus) {
      data = data.filter((item: any) => item.status === filterStatus);
    }
    if (filterRole) {
      data = data.filter((item: any) => item.role === filterRole);
    }
    if (filterBrand) {
      data = data.filter((item: any) => item.brand === filterBrand);
    }

    if (!search) return data;
    const query = search.toLowerCase();
    return data.filter((item: any) => {
      const targetString = (
        item.name || 
        item.memberName || 
        item.title || 
        item.email || 
        item.category || 
        ''
      ).toLowerCase();
      return targetString.includes(query);
    });
  };

  const filtered = getFilteredData();

  // Calculate Equipment KPIs
  const equipmentKPIs = React.useMemo(() => {
    if (moduleKey !== 'equipments' || !listData) return null;
    return {
      total: listData.length,
      functional: listData.filter((e: any) => e.status === 'Functional').length,
      maintenance: listData.filter((e: any) => e.status === 'Maintenance' || e.status === 'Under Maintenance').length,
      broken: listData.filter((e: any) => e.status === 'Broken' || e.status === 'Out of Order').length,
    };
  }, [listData, moduleKey]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const openCreate = () => {
    setEditItem(null);
    resetFormStates();
    setShowCreateModal(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    // Populate form states based on module
    setName(item.name || '');
    setPhone(item.phone || '');
    setEmail(item.email || '');
    setPlanId(item.planId?._id || item.planId || '');
    setBranchId(item.branchId || '');
    setStatus(item.status || 'Active');
    setSource(item.source || 'Walk-in');
    setPrice(String(item.price || ''));
    setDuration(String(item.duration || '30'));
    setDurationUnit(item.durationUnit || 'days');
    setSessions(String(item.sessions || '0'));
    setTrainerName(item.trainerName || '');
    setStartTime(item.startTime || '06:00');
    setEndTime(item.endTime || '07:00');
    setMemberId(item.memberId || '');
    setWeight(String(item.weight || ''));
    setBodyFat(String(item.bodyFat || ''));
    setBrand(item.brand || '');
    setRole(item.role || 'trainer');
    setSalary(String(item.baseSalary || ''));
    setAmount(String(item.amount || ''));
    setMethod(item.method || 'Cash');
    setCategory(item.category || '');
    setMerchant(item.merchant || '');
    setDescription(item.description || '');
    
    setShowCreateModal(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Record',
      'Are you sure you want to permanently delete this record?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate(id, {
              onSuccess: () => {
                toast.show('Record deleted successfully', 'success');
              },
              onError: (err: any) => {
                toast.show(err.response?.data?.message || 'Failed to delete record', 'error');
              }
            });
          }
        }
      ]
    );
  };

  const handleExportCSV = async () => {
    try {
      const endpoint = `${getEndpoint()}/export/csv`;
      const { data } = await API_CLIENT.get(endpoint);
      if (data) {
        await Share.share({
          message: data,
          title: `Exported H4 ${moduleName}`,
        });
        toast.show('CSV shared successfully', 'success');
      }
    } catch {
      toast.show('Failed to export CSV file', 'error');
    }
  };

  const handleCreateSubmit = () => {
    let payload: any = {};
    const finalBranchId = selectedBranchId || branchId || null;

    switch (moduleKey) {
      case 'members':
        if (!name || !phone || !planId) {
          toast.show('Name, phone, and subscription plan are required', 'error');
          return;
        }
        payload = { name, phone, email, planId, branchId: finalBranchId };
        break;
      case 'leads':
        if (!name || !phone) {
          toast.show('Name and phone number are required', 'error');
          return;
        }
        payload = { name, phone, email, status, source, branchId: finalBranchId };
        break;
      case 'plans':
        if (!name || !price || !duration) {
          toast.show('Plan name, price, and duration are required', 'error');
          return;
        }
        payload = {
          name,
          price: Number(price),
          duration: Number(duration),
          durationUnit,
          sessions: Number(sessions) || 0
        };
        break;
      case 'classes':
        if (!name || !trainerName) {
          toast.show('Class name and trainer name are required', 'error');
          return;
        }
        payload = { name, trainerName, startTime, endTime, branchId: finalBranchId };
        break;
      case 'assessments':
        if (!memberId || !weight || !bodyFat) {
          toast.show('Select member and provide weight & body fat details', 'error');
          return;
        }
        const memberObj = h4Members?.find((m: any) => m._id === memberId);
        payload = {
          memberId,
          memberName: memberObj ? memberObj.name : 'Unknown',
          weight: Number(weight),
          bodyFat: Number(bodyFat),
          date: new Date()
        };
        break;
      case 'equipments':
        if (!name || !brand) {
          toast.show('Equipment name and brand are required', 'error');
          return;
        }
        payload = { name, brand, status, purchaseDate: new Date(), branchId: finalBranchId };
        break;
      case 'staff':
        if (!name || !email || !phone || !salary) {
          toast.show('Name, email, phone, and salary are required', 'error');
          return;
        }
        payload = { name, email, phone, role, baseSalary: Number(salary), branchId: finalBranchId };
        break;
      case 'payments':
        if (!memberId || !amount) {
          toast.show('Member name and payment amount are required', 'error');
          return;
        }
        const payMemberObj = h4Members?.find((m: any) => m._id === memberId);
        payload = {
          memberId,
          memberName: payMemberObj ? payMemberObj.name : 'Unknown',
          amount: Number(amount),
          method,
          date: new Date(),
          branchId: finalBranchId
        };
        break;
      case 'expenses':
        if (!category || !amount) {
          toast.show('Expense category and amount are required', 'error');
          return;
        }
        payload = { category, amount: Number(amount), merchant, description, date: new Date(), branchId: finalBranchId };
        break;
      case 'branches':
        if (!name || !phone) {
          toast.show('Branch name and contact phone are required', 'error');
          return;
        }
        payload = { name, phone, email, address: description || '' };
        break;
      default:
        return;
    }

    if (editItem) {
      updateMutation.mutate({ id: editItem._id, payload }, {
        onSuccess: () => {
          toast.show(`${moduleName} record updated successfully!`, 'success');
          setShowCreateModal(false);
          setEditItem(null);
          resetFormStates();
        },
        onError: (err: any) => {
          toast.show(err.response?.data?.message || `Failed to update ${moduleName}`, 'error');
        }
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.show(`${moduleName} record created successfully!`, 'success');
          setShowCreateModal(false);
          resetFormStates();
        },
        onError: (err: any) => {
          toast.show(err.response?.data?.message || `Failed to create ${moduleName}`, 'error');
        }
      });
    }
  };

  const resetFormStates = () => {
    setName('');
    setPhone('');
    setEmail('');
    setPlanId('');
    setBranchId('');
    setStatus('Active');
    setSource('Walk-in');
    setPrice('');
    setDuration('30');
    setDurationUnit('days');
    setSessions('0');
    setTrainerName('');
    setStartTime('06:00');
    setEndTime('07:00');
    setMemberId('');
    setWeight('');
    setBodyFat('');
    setBrand('');
    setRole('trainer');
    setSalary('');
    setAmount('');
    setMethod('UPI');
    setCategory('');
    setMerchant('');
    setDescription('');
  };

  const renderCardItem = (item: any) => {
    const showActions = ['members', 'leads', 'plans', 'classes', 'equipments', 'staff', 'expenses', 'branches'].includes(moduleKey);

    return (
      <Card key={item._id || item.id} style={styles.recordCard}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Typography variant="body" style={styles.cardTitle}>
              {item.name || item.memberName || item.category || 'Record'}
            </Typography>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            {item.status && (
              <Badge 
                label={item.status} 
                variant={
                  item.status === 'Active' || item.status === 'Functional' ? 'active' : 
                  item.status === 'Frozen' ? 'frozen' : 'expired'
                } 
              />
            )}
            {showActions && (
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
                  <Pencil size={14} color={theme.colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item._id)} style={styles.iconBtnDelete}>
                  <Trash2 size={14} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Content detail layout depending on moduleKey */}
        {renderCardContentDetails(item)}
      </Card>
    );
  };

  const renderCardContentDetails = (item: any) => {
    switch (moduleKey) {
      case 'members':
      case 'pending_dues':
      case 'freeze_system':
        return (
          <>
            <View style={styles.infoRow}>
              <Typography variant="caption" color="secondary">Phone: {item.phone || 'N/A'}</Typography>
              <Typography variant="caption" color="secondary">Plan: {item.planId?.name || 'Custom'}</Typography>
            </View>
            <View style={styles.infoFooter}>
              <Typography variant="caption" color="muted">Expiry: {formatDate(item.expiryDate)}</Typography>
              {item.pendingBalance > 0 && (
                <Typography variant="caption" color="error" style={{ fontWeight: '700' }}>
                  Dues: ₹{item.pendingBalance}
                </Typography>
              )}
            </View>
          </>
        );

      case 'leads':
        return (
          <View style={{ gap: 6 }}>
            <View style={styles.infoRow}>
              <View style={styles.iconMetaRow}>
                <Phone size={13} color={theme.colors.primary} />
                <Typography variant="caption" color="secondary">{item.phone || 'N/A'}</Typography>
              </View>
              <Badge label={item.source || 'Walk-in'} variant="info" />
            </View>

            {item.email ? (
              <View style={styles.iconMetaRow}>
                <Mail size={13} color={theme.colors.textSecondary} />
                <Typography variant="caption" color="secondary">{item.email}</Typography>
              </View>
            ) : null}

            <View style={styles.infoFooter}>
              <View style={styles.iconMetaRow}>
                <Calendar size={13} color={theme.colors.primary} />
                <Typography variant="caption" color="secondary">
                  Follow-up: {formatDate(item.followUpDate || item.createdAt)}
                </Typography>
              </View>

              {item.status ? (
                <Badge
                  label={item.status}
                  variant={
                    item.status === 'Converted' ? 'active' :
                    item.status === 'Contacted' || item.status === 'Interested' ? 'info' :
                    item.status === 'Lost' ? 'expired' : 'frozen'
                  }
                />
              ) : null}
            </View>

            {item.notes ? (
              <Typography variant="caption" color="muted" style={{ marginTop: 2 }} numberOfLines={2}>
                Notes: {item.notes}
              </Typography>
            ) : null}
          </View>
        );

      case 'plans':
        return (
          <View style={styles.infoRow}>
            <Typography variant="caption" color="secondary">Duration: {item.duration} {item.durationUnit}</Typography>
            <Typography variant="body" style={styles.priceText}>₹{item.price}</Typography>
          </View>
        );

      case 'classes':
        return (
          <>
            <View style={styles.infoRow}>
              <Typography variant="caption" color="secondary">Trainer: {item.trainerName || 'N/A'}</Typography>
              <Typography variant="caption" color="secondary">Schedule: {item.startTime} - {item.endTime}</Typography>
            </View>
            <View style={[styles.infoFooter, { marginTop: theme.spacing.xs }]}>
              <Typography variant="caption" color="primary" style={{ fontWeight: '700' }}>
                📍 {item.branchName || 'Main Studio'}
              </Typography>
              <Badge
                label={`${(item.bookings || []).filter((b: any) => b.status === 'Attended').length} / ${(item.bookings || []).length} Attended`}
                variant="info"
              />
            </View>
          </>
        );

      case 'assessments':
        return (
          <View style={styles.infoRow}>
            <Typography variant="caption" color="secondary">Weight: {item.weight} kg</Typography>
            <Typography variant="caption" color="secondary">Body Fat: {item.bodyFat}%</Typography>
          </View>
        );

      case 'equipments':
        return (
          <View style={styles.infoRow}>
            <Typography variant="caption" color="secondary">Brand: {item.brand || 'N/A'}</Typography>
            <Typography variant="caption" color="secondary">Purchased: {formatDate(item.purchaseDate)}</Typography>
          </View>
        );

      case 'staff':
        return (
          <>
            <View style={styles.infoRow}>
              <Typography variant="caption" color="secondary">Role: {item.role}</Typography>
              <Typography variant="caption" color="secondary">Salary: ₹{item.baseSalary}</Typography>
            </View>
            <Typography variant="caption" color="muted">Email: {item.email}</Typography>
          </>
        );

      case 'payments':
        return (
          <View style={styles.infoRow}>
            <Typography variant="caption" color="secondary">Method: {item.method || 'Online'}</Typography>
            <Typography variant="body" style={styles.priceText}>+ ₹{item.amount}</Typography>
          </View>
        );

      case 'expenses':
        return (
          <View style={styles.infoRow}>
            <Typography variant="caption" color="secondary">Merchant: {item.merchant || 'N/A'}</Typography>
            <Typography variant="body" style={styles.expenseText}>- ₹{item.amount}</Typography>
          </View>
        );

      case 'branches':
        return (
          <>
            <View style={styles.infoRow}>
              <Typography variant="caption" color="secondary">Phone: {item.phone}</Typography>
              <Typography variant="caption" color="secondary">Email: {item.email || 'N/A'}</Typography>
            </View>
            {item.address && (
              <Typography variant="caption" color="muted" style={{ marginTop: theme.spacing.xs }}>
                Address: {item.address}
              </Typography>
            )}
          </>
        );

      default:
        return <Typography variant="caption">{JSON.stringify(item)}</Typography>;
    }
  };

  const renderCreateFormContent = () => {
    const plansOptions = (h4Plans || []).map((p: any) => ({ label: `${p.name} - ₹${p.price}`, value: p._id }));
    const branchesOptions = (h4Branches || []).map((b: any) => ({ label: b.name, value: b._id }));
    const membersOptions = (h4Members || []).map((m: any) => ({ label: `${m.name} (${m.phone})`, value: m._id }));

    switch (moduleKey) {
      case 'members':
        return (
          <>
            <Input label="Member Name *" value={name} onChangeText={setName} placeholder="e.g. Sanjai Pandian" />
            <Input label="Phone Number *" value={phone} onChangeText={setPhone} placeholder="e.g. +91 98765 43210" keyboardType="phone-pad" />
            <Input label="Email Address" value={email} onChangeText={setEmail} placeholder="e.g. sanjai@gmail.com" keyboardType="email-address" />
            <Select label="Subscription Plan *" options={plansOptions} value={planId} onValueChange={(val) => setPlanId(String(val))} placeholder="Select plan duration" />
            {!selectedBranchId && (
              <Select label="Assign to Branch" options={branchesOptions} value={branchId} onValueChange={(val) => setBranchId(String(val))} placeholder="Select local branch" />
            )}
          </>
        );
      case 'leads':
        return (
          <>
            <Input label="Lead Name *" value={name} onChangeText={setName} placeholder="e.g. Rajesh Kumar" />
            <Input label="Phone Number *" value={phone} onChangeText={setPhone} placeholder="e.g. +91 95000 12345" keyboardType="phone-pad" />
            <Input label="Email Address" value={email} onChangeText={setEmail} placeholder="e.g. rajesh@gmail.com" keyboardType="email-address" />
            <Select
              label="Lead Status"
              options={[
                { label: 'New', value: 'New' },
                { label: 'Contacted', value: 'Contacted' },
                { label: 'Interested', value: 'Interested' },
                { label: 'Converted', value: 'Converted' },
                { label: 'Lost', value: 'Lost' },
              ]}
              value={status}
              onValueChange={(val) => setStatus(String(val))}
            />
            <Select
              label="Lead Source"
              options={[
                { label: 'Walk-in', value: 'Walk-in' },
                { label: 'Social Media', value: 'Social Media' },
                { label: 'Website', value: 'Website' },
                { label: 'Referral', value: 'Referral' },
              ]}
              value={source}
              onValueChange={(val) => setSource(String(val))}
            />
          </>
        );
      case 'plans':
        return (
          <>
            <Input label="Plan Name *" value={name} onChangeText={setName} placeholder="e.g. 3 Months Unlimited" />
            <Input label="Price (₹) *" value={price} onChangeText={setPrice} placeholder="e.g. 4500" keyboardType="numeric" />
            <Input label="Duration *" value={duration} onChangeText={setDuration} placeholder="e.g. 90" keyboardType="numeric" />
            <Select
              label="Duration Unit"
              options={[
                { label: 'Days', value: 'days' },
                { label: 'Months', value: 'months' },
              ]}
              value={durationUnit}
              onValueChange={(val) => setDurationUnit(String(val))}
            />
            <Input label="Session Counts (0 = Unlimited)" value={sessions} onChangeText={setSessions} placeholder="e.g. 24" keyboardType="numeric" />
          </>
        );
      case 'classes':
        return (
          <>
            <Input label="Class Name *" value={name} onChangeText={setName} placeholder="e.g. Morning Yoga" />
            <Input label="Trainer Name *" value={trainerName} onChangeText={setTrainerName} placeholder="e.g. Coach Arun" />
            <Input label="Start Time (HH:MM) *" value={startTime} onChangeText={setStartTime} placeholder="e.g. 06:00" />
            <Input label="End Time (HH:MM) *" value={endTime} onChangeText={setEndTime} placeholder="e.g. 07:00" />
            {!selectedBranchId && (
              <Select label="Assign to Branch" options={branchesOptions} value={branchId} onValueChange={(val) => setBranchId(String(val))} placeholder="Select branch (Optional)" />
            )}
          </>
        );
      case 'assessments':
        return (
          <>
            <Select label="Select Member *" options={membersOptions} value={memberId} onValueChange={(val) => setMemberId(String(val))} placeholder="Choose member profile" />
            <Input label="Weight (kg) *" value={weight} onChangeText={setWeight} placeholder="e.g. 78.5" keyboardType="numeric" />
            <Input label="Body Fat Percentage (%) *" value={bodyFat} onChangeText={setBodyFat} placeholder="e.g. 18.2" keyboardType="numeric" />
          </>
        );
      case 'equipments':
        return (
          <>
            <Input label="Equipment Name *" value={name} onChangeText={setName} placeholder="e.g. Commercial Treadmill T5" />
            <Input label="Brand *" value={brand} onChangeText={setBrand} placeholder="e.g. Jerai Fitness" />
            <Select
              label="Equipment Status"
              options={[
                { label: 'Functional', value: 'Functional' },
                { label: 'Under Maintenance', value: 'Maintenance' },
              ]}
              value={status}
              onValueChange={(val) => setStatus(String(val))}
            />
          </>
        );
      case 'staff':
        return (
          <>
            <Input label="Staff Name *" value={name} onChangeText={setName} placeholder="e.g. Sivasankar" />
            <Input label="Email Address *" value={email} onChangeText={setEmail} placeholder="e.g. siva@h4gyms.com" keyboardType="email-address" />
            <Input label="Phone Number *" value={phone} onChangeText={setPhone} placeholder="e.g. +91 96000 54321" keyboardType="phone-pad" />
            <Select
              label="Staff Role"
              options={[
                { label: 'Trainer', value: 'trainer' },
                { label: 'Receptionist', value: 'receptionist' },
                { label: 'Branch Manager', value: 'admin' },
              ]}
              value={role}
              onValueChange={(val) => setRole(String(val))}
            />
            <Input label="Base Salary (₹) *" value={salary} onChangeText={setSalary} placeholder="e.g. 25000" keyboardType="numeric" />
          </>
        );
      case 'payments':
        return (
          <>
            <Select label="Select Member Profile *" options={membersOptions} value={memberId} onValueChange={(val) => setMemberId(String(val))} placeholder="Choose member paying" />
            <Input label="Payment Amount (₹) *" value={amount} onChangeText={setAmount} placeholder="e.g. 3500" keyboardType="numeric" />
            <Select
              label="Payment Method"
              options={[
                { label: 'UPI / GPay / PhonePe', value: 'UPI' },
                { label: 'Cash', value: 'Cash' },
                { label: 'Debit/Credit Card', value: 'Card' },
                { label: 'Net Banking', value: 'NetBanking' },
              ]}
              value={method}
              onValueChange={(val) => setMethod(String(val))}
            />
          </>
        );
      case 'expenses':
        return (
          <>
            <Input label="Expense Category *" value={category} onChangeText={setCategory} placeholder="e.g. Maintenance, Electricity, Rent" />
            <Input label="Amount (₹) *" value={amount} onChangeText={setAmount} placeholder="e.g. 850" keyboardType="numeric" />
            <Input label="Merchant / Paid To" value={merchant} onChangeText={setMerchant} placeholder="e.g. TNEB Office" />
            <Input label="Description / Remarks" value={description} onChangeText={setDescription} placeholder="e.g. May month electricity bill" />
          </>
        );
      case 'branches':
        return (
          <>
            <Input label="Branch Name *" value={name} onChangeText={setName} placeholder="e.g. H5 East Branch" />
            <Input label="Phone Number *" value={phone} onChangeText={setPhone} placeholder="e.g. +91 97000 99999" keyboardType="phone-pad" />
            <Input label="Email Address" value={email} onChangeText={setEmail} placeholder="e.g. branch@h4gyms.com" keyboardType="email-address" />
            <Input label="Address Details" value={description} onChangeText={setDescription} placeholder="e.g. Avadi High Road, Chennai" />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaWrapper scrollable={false}>
      <Tabs.Screen 
        options={{ 
          title: moduleName,
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
      <View style={styles.container}>
        {/* Leads Pipeline Cards */}
        {moduleKey === 'leads' && leadsSummary && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryScroll}>
            <Card style={styles.summaryCard}>
              <Typography variant="caption" color="secondary">Total Leads</Typography>
              <Typography variant="h2">{leadsSummary.total || 0}</Typography>
            </Card>
            <Card style={styles.summaryCard}>
              <Typography variant="caption" color="secondary">Follow-ups Due</Typography>
              <Typography variant="h2" color="error">{leadsSummary.followUpDue || 0}</Typography>
            </Card>
            <Card style={styles.summaryCard}>
              <Typography variant="caption" color="secondary">Conversion Rate</Typography>
              <Typography variant="h2" style={{ color: '#10b981' }}>{leadsSummary.conversionRate || 0}%</Typography>
            </Card>
            {(leadsSummary.statusCounts || []).map((sc: any) => (
              <Card key={sc._id} style={styles.summaryCard}>
                <Typography variant="caption" color="secondary">{sc._id}</Typography>
                <Typography variant="h2">{sc.count}</Typography>
              </Card>
            ))}
          </ScrollView>
        )}

        {/* Equipment Status KPIs */}
        {moduleKey === 'equipments' && equipmentKPIs && (
          <View style={styles.kpiRow}>
            <Card style={styles.kpiCardItem}>
              <Typography variant="caption" color="muted">Total Assets</Typography>
              <Typography variant="h3">{equipmentKPIs.total} Items</Typography>
            </Card>
            <Card style={styles.kpiCardItem}>
              <Typography variant="caption" color="muted">Operational</Typography>
              <Typography variant="h3" style={{ color: '#10b981' }}>{equipmentKPIs.functional} Active</Typography>
            </Card>
            <Card style={styles.kpiCardItem}>
              <Typography variant="caption" color="muted">In Service</Typography>
              <Typography variant="h3" style={{ color: '#f59e0b' }}>{equipmentKPIs.maintenance} Repair</Typography>
            </Card>
          </View>
        )}

        {/* Equipment Tab Toggler */}
        {moduleKey === 'equipments' && (
          <View style={styles.tabHeader}>
            <TouchableOpacity 
              onPress={() => setEquipmentTab('inventory')}
              style={[styles.tabBtn, equipmentTab === 'inventory' && styles.tabBtnActive]}
            >
              <Typography variant="bodySm" style={equipmentTab === 'inventory' ? styles.tabTextActive : styles.tabText}>
                Equipments List
              </Typography>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => setEquipmentTab('maintenance')}
              style={[styles.tabBtn, equipmentTab === 'maintenance' && styles.tabBtnActive]}
            >
              <Typography variant="bodySm" style={equipmentTab === 'maintenance' ? styles.tabTextActive : styles.tabText}>
                Maintenance Logs
              </Typography>
            </TouchableOpacity>
          </View>
        )}

        {/* Filters and Search controls */}
        {moduleKey !== 'profile' && moduleKey !== 'analytics' && (
          <View style={styles.filterRow}>
            {/* Search */}
            <View style={styles.searchRow}>
              <Search size={16} color={theme.colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search..."
                placeholderTextColor={theme.colors.textMuted}
                style={styles.searchInput}
              />
            </View>

            {/* Dynamic Dropdown Filters */}
            {moduleKey === 'members' && (
              <View style={styles.selectFilterWrapper}>
                <Select
                  label=""
                  options={[
                    { label: 'All Statuses', value: '' },
                    { label: 'Active', value: 'Active' },
                    { label: 'Frozen', value: 'Frozen' },
                    { label: 'Expired', value: 'Expired' },
                  ]}
                  value={filterStatus}
                  onValueChange={(val) => setFilterStatus(String(val))}
                  placeholder="Filter Status"
                />
              </View>
            )}

            {moduleKey === 'staff' && (
              <View style={styles.selectFilterWrapper}>
                <Select
                  label=""
                  options={[
                    { label: 'All Roles', value: '' },
                    { label: 'Trainer', value: 'trainer' },
                    { label: 'Receptionist', value: 'receptionist' },
                    { label: 'Branch Manager', value: 'admin' },
                  ]}
                  value={filterRole}
                  onValueChange={(val) => setFilterRole(String(val))}
                  placeholder="Filter Role"
                />
              </View>
            )}

            {/* Export and Create buttons */}
            <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
              {isExportable && (
                <TouchableOpacity onPress={handleExportCSV} style={styles.exportBtn}>
                  <Download size={18} color={theme.colors.text} />
                </TouchableOpacity>
              )}
              {isCreateable && (
                <Button
                  title="+ Add New"
                  onPress={openCreate}
                  style={styles.createBtn}
                />
              )}
            </View>
          </View>
        )}

        {/* Content list body */}
        {isLoading || (moduleKey === 'equipments' && equipmentTab === 'maintenance' && isLogsLoading) ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Typography style={{ marginTop: theme.spacing.md }}>Loading records...</Typography>
          </View>
        ) : (
          <ScrollView 
            style={styles.scroll} 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
          >
            {moduleKey === 'profile' && listData ? (
              <View>
                <Card style={styles.profileCard}>
                  <Typography variant="h3" style={{ marginBottom: theme.spacing.sm }}>
                    {listData[0]?.name || 'H4 Head Office'}
                  </Typography>
                  <Typography variant="bodySm" color="secondary" style={styles.profileText}>
                    Address: {listData[0]?.address || 'No Address Specified'}
                  </Typography>
                  <Typography variant="bodySm" color="secondary" style={styles.profileText}>
                    Phone: {listData[0]?.phone || '555-0100'}
                  </Typography>
                  <Typography variant="bodySm" color="secondary" style={styles.profileText}>
                    Email: {listData[0]?.email || 'h4@gymcrm.com'}
                  </Typography>
                  <Typography variant="bodySm" color="secondary" style={styles.profileText}>
                    Default check-in duration: {listData[0]?.defaultSessionDurationMinutes || 120} minutes
                  </Typography>
                </Card>
              </View>
            ) : moduleKey === 'equipments' && equipmentTab === 'maintenance' ? (
              (maintenanceLogs || []).length === 0 ? (
                <EmptyState
                  iconText="🔧"
                  title="No Logs Available"
                  description="Log maintenance history from the web application."
                />
              ) : (
                (maintenanceLogs || []).map((log: any) => (
                  <Card key={log._id || log.id} style={styles.recordCard}>
                    <View style={styles.cardHeader}>
                      <Typography variant="body" style={styles.cardTitle}>{log.equipmentName || 'Equipment'}</Typography>
                      <Badge label={log.type || 'Repair'} variant="warning" />
                    </View>
                    <View style={styles.infoRow}>
                      <Typography variant="caption" color="secondary">Cost: ₹{log.cost}</Typography>
                      <Typography variant="caption" color="secondary">Date: {formatDate(log.serviceDate)}</Typography>
                    </View>
                    {log.description && (
                      <Typography variant="caption" color="muted" style={{ marginTop: theme.spacing.xs }}>
                        Notes: {log.description}
                      </Typography>
                    )}
                  </Card>
                ))
              )
            ) : filtered.length === 0 ? (
              <EmptyState
                iconText="🔍"
                title="No Records Found"
                description="Click '+ Add New' or adjust filters."
              />
            ) : (
              filtered.map((item) => renderCardItem(item))
            )}
          </ScrollView>
        )}
      </View>

      {/* CREATE / EDIT MODAL */}
      <Modal
        visible={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditItem(null);
        }}
        title={editItem ? `Edit ${moduleName.replace(/s$/, '')}` : `Add New ${moduleName.replace(/s$/, '')}`}
      >
        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
          {renderCreateFormContent()}
        </ScrollView>
        <Button
          title={editItem ? "Save Changes" : "Save Record"}
          loading={createMutation.isPending || updateMutation.isPending}
          onPress={handleCreateSubmit}
          style={{ marginTop: theme.spacing.lg }}
        />
      </Modal>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.md,
  },
  summaryScroll: {
    maxHeight: 70,
    marginBottom: theme.spacing.md,
  },
  summaryCard: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    marginRight: theme.spacing.sm,
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  kpiCardItem: {
    flex: 1,
    padding: theme.spacing.sm,
    alignItems: 'center',
  },
  tabHeader: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.bgTertiary,
    borderRadius: theme.radii.md,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  tabBtnActive: {
    backgroundColor: theme.colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgTertiary,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    borderColor: '#3f3f46',
    paddingHorizontal: theme.spacing.md,
    height: 48,
  },
  searchIcon: {
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: theme.colors.text,
    ...theme.typography.bodySm,
  },
  selectFilterWrapper: {
    width: 110,
    height: 48,
    justifyContent: 'center',
  },
  createBtn: {
    height: 48,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
  },
  exportBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    borderWidth: 1.5,
    borderColor: '#3f3f46',
    backgroundColor: theme.colors.bgTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing['2xl'],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.lg,
  },
  recordCard: {
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  cardTitle: {
    fontWeight: '700',
    color: theme.colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    alignItems: 'center',
  },
  iconBtn: {
    padding: theme.spacing.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.radii.sm,
  },
  iconBtnDelete: {
    padding: theme.spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: theme.radii.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  infoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.xs,
  },
  priceText: {
    fontWeight: '800',
    color: theme.colors.success,
  },
  expenseText: {
    fontWeight: '800',
    color: theme.colors.error,
  },
  profileCard: {
    padding: theme.spacing.lg,
  },
  profileText: {
    marginBottom: theme.spacing.xs,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.xs,
  },
  iconMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
