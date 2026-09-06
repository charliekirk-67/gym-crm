import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getMembers, getPlans, createMember, updateMember, deleteMember, getMemberAuditTrail } from '../services/apiService';
import Modal from '../components/Modal';
import { AuthContext } from '../context/AuthContext';
import { QRCodeCanvas } from 'qrcode.react';
import API from '../services/api';
import { Pencil, Trash2, Smartphone, FileText, RefreshCw, ArrowRightLeft, Download } from 'lucide-react';

const Members = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useContext(AuthContext);
    const [members, setMembers] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isQRModalOpen, setIsQRModalOpen] = useState(false);
    const [viewingQRMember, setViewingQRMember] = useState(null);
    const [editingMember, setEditingMember] = useState(null);
    const [branches, setBranches] = useState([]);
    const [branchFilter, setBranchFilter] = useState('');
    const [formData, setFormData] = useState({ name: '', phone: '', email: '', planId: '', joinDate: '', branchId: '', gymId: '', password: '' });
    const [wizardStep, setWizardStep] = useState(1);
    const [questionnaire, setQuestionnaire] = useState({
        fitnessGoal: 'Fat Loss',
        experienceLevel: 'Beginner',
        workoutFrequency: '3-4 Days / Week',
        dietPreference: 'Vegetarian',
        medicalHistory: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        specialNotes: ''
    });
    const [highlightId, setHighlightId] = useState(null);
    const highlightRef = useRef(null);
    const [convertingLeadId, setConvertingLeadId] = useState(null);
    const appliedConvertLeadRef = useRef(null);
    const pendingInterestedPlanRef = useRef('');

    // Renew & Transfer states
    const [renewMemberData, setRenewMemberData] = useState(null);
    const [renewForm, setRenewForm] = useState({ planId: '', paidAmount: '', method: 'Cash' });
    const [transferMemberData, setTransferMemberData] = useState(null);
    const [transferBranchId, setTransferBranchId] = useState('');
    const [submittingAction, setSubmittingAction] = useState(false);


    const [gyms, setGyms] = useState([]);
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [auditData, setAuditData] = useState(null);
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Read URL params from global search
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const searchParam = params.get('search');
        const highlightParam = params.get('highlight');
        if (searchParam) setSearchTerm(searchParam);
        if (highlightParam) setHighlightId(highlightParam);
    }, [location.search]);

    // Convert a Lead into a Member: open the Add Member modal pre-filled with
    // whatever the lead already captured (see Leads.jsx -> convertToMember).
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const convertLeadId = params.get('convertLeadId');
        if (!convertLeadId || appliedConvertLeadRef.current === convertLeadId) return;
        appliedConvertLeadRef.current = convertLeadId;

        const leadName = params.get('name') || '';
        const leadPhone = params.get('phone') || '';
        const leadEmail = params.get('email') || '';
        const leadGymId = params.get('gymId') || '';
        const leadBranchId = params.get('branchId') || '';
        const leadInterestedPlan = params.get('interestedPlan') || '';

        setEditingMember(null);
        setFormData({
            name: leadName,
            phone: leadPhone,
            email: leadEmail,
            planId: '',
            joinDate: new Date().toISOString().split('T')[0],
            branchId: leadBranchId || user?.branchId || '',
            gymId: leadGymId || '',
            password: ''
        });
        setConvertingLeadId(convertLeadId);
        setIsModalOpen(true);
        // Stash for the plan-matching effect below — `plans` may not be loaded yet.
        pendingInterestedPlanRef.current = leadInterestedPlan;

        // Clear the query string so a refresh doesn't reopen/reapply the pre-fill.
        navigate(location.pathname, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    // Best-effort match of a converting lead's free-text "interested plan" to a
    // real Plan by name, once the plans list has actually loaded.
    useEffect(() => {
        const leadInterestedPlan = pendingInterestedPlanRef.current;
        if (!leadInterestedPlan || !convertingLeadId || plans.length === 0) return;
        const matchedPlan = plans.find(p => p.name?.trim().toLowerCase() === leadInterestedPlan.trim().toLowerCase());
        if (matchedPlan) {
            setFormData(prev => ({ ...prev, planId: matchedPlan._id }));
        }
        pendingInterestedPlanRef.current = '';
    }, [plans, convertingLeadId]);

    // Scroll to highlighted member
    useEffect(() => {
        if (highlightId && highlightRef.current) {
            highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => setHighlightId(null), 3000);
        }
    }, [highlightId, members]);

    useEffect(() => {
        fetchData();
    }, [page, statusFilter]);

    const fetchData = async () => {
        try {
            const [membersData, plansData, branchesRes] = await Promise.all([
                getMembers(statusFilter, page),
                getPlans(),
                API.get('/branches')
            ]);
            setMembers(membersData.members || []);
            setPages(membersData.pages || 1);
            setPlans(plansData);
            setBranches(branchesRes.data || []);

            if (user?.role === 'superadmin' || user?.role === 'fitpass_admin') {
                const gymsRes = await API.get('/superadmin/gyms');
                // Include H4 gym in the list so superadmin can switch to it!
                const h4GymRes = await API.get('/superadmin/h4-gym');
                const list = gymsRes.data || [];
                const hasH4 = list.some(g => g.name === 'H4' || g._id === h4GymRes.data._id);
                if (!hasH4 && h4GymRes.data) {
                    list.unshift(h4GymRes.data);
                }
                setGyms(list);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setPage(1);
        fetchData();
    }, [statusFilter]);

    const handleOpenModal = (member = null) => {
        setConvertingLeadId(null);
        if (member) {
            setEditingMember(member);
            setFormData({
                name: member.name,
                phone: member.phone,
                email: member.email || '',
                planId: member.planId?._id || '',
                joinDate: member.joinDate ? member.joinDate.split('T')[0] : '',
                branchId: member.branchId?._id || member.branchId || '',
                gymId: member.gymId?._id || member.gymId || '',
                password: ''
            });
        } else {
            setEditingMember(null);
            setFormData({ name: '', phone: '', email: '', planId: '', joinDate: new Date().toISOString().split('T')[0], branchId: user?.branchId || '', gymId: '', password: '' });
        }
        setIsModalOpen(true);
    };

    const handleOpenAudit = async (member) => {
        setLoadingAudit(true);
        setIsAuditModalOpen(true);
        setAuditData(null);
        try {
            const data = await getMemberAuditTrail(member._id);
            setAuditData(data);
        } catch {
            alert('Failed to load member audit trail');
            setIsAuditModalOpen(false);
        } finally {
            setLoadingAudit(false);
        }
    };

    const handleDownloadQR = () => {
        const canvas = document.getElementById('member-qr');
        const url = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `QR - ${viewingQRMember.name}.png`;
        link.href = url;
        link.click();
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        try {
            if (editingMember) {
                await updateMember(editingMember._id, formData);
                alert(`✅ Member "${formData.name}" details updated successfully.`);
            } else {
                const newMember = await createMember({ ...formData, questionnaire });
                if (convertingLeadId) {
                    try {
                        await API.put(`/leads/${convertingLeadId}`, {
                            status: 'Converted',
                            convertedMemberId: newMember._id
                        });
                    } catch (leadError) {
                        console.error('Member created, but failed to mark lead as converted:', leadError);
                    }
                    setConvertingLeadId(null);
                }
                alert(`🎉 Member "${formData.name}" registered successfully!`);
                if (newMember?._id) {
                    setHighlightId(newMember._id);
                }
            }
            fetchData();
            setIsModalOpen(false);
            setWizardStep(1);
            setFormData({
                name: '',
                phone: '',
                email: '',
                planId: '',
                joinDate: new Date().toISOString().split('T')[0],
                branchId: user?.branchId || '',
                gymId: '',
                password: '',
                discount: 0,
                paidAmount: '',
                paymentMethod: 'Cash'
            });
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving member');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this member?')) {
            try {
                await deleteMember(id);
                fetchData();
            } catch {
                alert('Error deleting member');
            }
        }
    };

    const filteredMembers = members.filter(m => {
        const matchSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.phone.includes(searchTerm);
        const matchBranch = !branchFilter || (m.branchId?._id || m.branchId || '') === branchFilter;
        return matchSearch && matchBranch;
    });

    const activeCount = members.filter(m => m.status === 'Active').length;
    const expiredCount = members.filter(m => m.status === 'Expired').length;
    const frozenCount = members.filter(m => m.status === 'Frozen').length;

    const handleDownloadCSV = async (exportFullRoster = false) => {
        setIsExporting(true);
        try {
            let exportData = filteredMembers;

            // If user requests full roster export, fetch all members from backend without pagination limits
            if (exportFullRoster) {
                const fullRes = await getMembers(statusFilter, 1, searchTerm, 10000);
                if (fullRes?.members && Array.isArray(fullRes.members)) {
                    exportData = fullRes.members.filter(m => {
                        const matchBranch = !branchFilter || (m.branchId?._id || m.branchId || '') === branchFilter;
                        return matchBranch;
                    });
                }
            }

            if (!exportData || exportData.length === 0) {
                alert('No member records available for export.');
                return;
            }

            const headers = [
                'Member ID',
                'Full Name',
                'Phone Number',
                'Email Address',
                'Membership Status',
                'Plan Name',
                'Plan Total Price (INR)',
                'Amount Paid (INR)',
                'Pending Balance (INR)',
                'Payment Status',
                'Home Branch',
                'Gym / Tenant ID',
                'Join Date',
                'Expiry Date',
                'Days Remaining / Overdue',
                'Total Sessions Granted',
                'Sessions Remaining',
                'Sessions Used',
                'Last Check-In Time',
                'Is Account Frozen',
                'Member Registered At',
                'Last Updated At'
            ];

            const now = new Date();

            const rows = exportData.map(m => {
                const branchObj = branches.find(b => b._id === (m.branchId?._id || m.branchId));
                const branchName = branchObj ? branchObj.name : (m.branchId?.name || 'Main Branch');
                const planName = m.planId?.name || 'N/A';
                const planPrice = Number(m.planPrice || m.planId?.price || 0);
                const paidAmount = Number(m.paidAmount || 0);
                const dueAmount = Math.max(0, planPrice - paidAmount);
                
                let paymentStatus = 'Paid in Full';
                if (paidAmount === 0 && planPrice > 0) {
                    paymentStatus = 'Unpaid';
                } else if (dueAmount > 0) {
                    paymentStatus = `Partial Due (₹${dueAmount.toLocaleString('en-IN')})`;
                }

                const joinDateStr = m.joinDate ? new Date(m.joinDate).toISOString().slice(0, 10) : 'N/A';
                const expiryDateStr = m.expiryDate ? new Date(m.expiryDate).toISOString().slice(0, 10) : 'N/A';
                
                let daysLeftStr = 'N/A';
                if (m.expiryDate) {
                    const exp = new Date(m.expiryDate);
                    const diffTime = exp.getTime() - now.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) {
                        daysLeftStr = `${diffDays} Days Active`;
                    } else if (diffDays === 0) {
                        daysLeftStr = 'Expires Today';
                    } else {
                        daysLeftStr = `${Math.abs(diffDays)} Days Overdue`;
                    }
                }

                const sessionsTotal = Number(m.sessionsTotal || 0);
                const sessionsRemaining = Number(m.sessionsRemaining || 0);
                const sessionsUsed = Math.max(0, sessionsTotal - sessionsRemaining);

                const lastCheckInStr = m.lastCheckInAt ? new Date(m.lastCheckInAt).toLocaleString('en-IN') : 'No check-ins logged';
                const isFrozenStr = m.status === 'Frozen' ? 'Yes (Frozen)' : 'No';
                const createdAtStr = m.createdAt ? new Date(m.createdAt).toLocaleString('en-IN') : 'N/A';
                const updatedAtStr = m.updatedAt ? new Date(m.updatedAt).toLocaleString('en-IN') : 'N/A';

                return [
                    `"${(m._id || m.id || '').toString().replace(/"/g, '""')}"`,
                    `"${(m.name || '').replace(/"/g, '""')}"`,
                    `"${(m.phone || '').replace(/"/g, '""')}"`,
                    `"${(m.email || 'N/A').replace(/"/g, '""')}"`,
                    `"${(m.status || 'Active').replace(/"/g, '""')}"`,
                    `"${planName.replace(/"/g, '""')}"`,
                    planPrice,
                    paidAmount,
                    dueAmount,
                    `"${paymentStatus.replace(/"/g, '""')}"`,
                    `"${branchName.replace(/"/g, '""')}"`,
                    `"${(m.gymId || 'Default').replace(/"/g, '""')}"`,
                    `"${joinDateStr}"`,
                    `"${expiryDateStr}"`,
                    `"${daysLeftStr}"`,
                    sessionsTotal,
                    sessionsRemaining,
                    sessionsUsed,
                    `"${lastCheckInStr.replace(/"/g, '""')}"`,
                    `"${isFrozenStr}"`,
                    `"${createdAtStr.replace(/"/g, '""')}"`,
                    `"${updatedAtStr.replace(/"/g, '""')}"`
                ];
            });

            const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const todayStr = new Date().toISOString().slice(0, 10);
            const exportTypeStr = exportFullRoster ? 'Full_Roster' : 'Filtered_View';
            link.href = url;
            link.setAttribute('download', `Gym_Members_Detailed_${exportTypeStr}_${todayStr}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export CSV:', error);
            alert('Failed to generate CSV export. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    if (loading) return <div className="spinner"></div>;
    return (
        <div>
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Members Management</h2>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Manage member profiles, subscriptions, and download detailed reports</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: 'var(--bg-secondary, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '8px', overflow: 'hidden' }}>
                        <button
                            className="btn"
                            onClick={() => handleDownloadCSV(false)}
                            disabled={isExporting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.5rem 0.85rem', background: 'transparent',
                                border: 'none', color: 'var(--primary, #F0A020)', fontWeight: 600,
                                cursor: isExporting ? 'wait' : 'pointer'
                            }}
                            title="Export currently filtered view to CSV"
                        >
                            <Download size={16} /> {isExporting ? 'Exporting...' : 'Export Filtered'}
                        </button>
                        <div style={{ width: '1px', background: 'var(--border-color, #3A3025)' }} />
                        <button
                            className="btn"
                            onClick={() => handleDownloadCSV(true)}
                            disabled={isExporting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.5rem 0.85rem', background: 'rgba(240, 160, 32, 0.12)',
                                border: 'none', color: 'var(--primary, #F0A020)', fontWeight: 700,
                                cursor: isExporting ? 'wait' : 'pointer'
                            }}
                            title="Export entire member database to CSV"
                        >
                            Export Full Database
                        </button>
                    </div>
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>+ Add New Member</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <input
                    className="input"
                    style={{ flex: '1', minWidth: '200px' }}
                    placeholder="Search by name or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                    className="input"
                    style={{ flex: '1', minWidth: '150px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Expired">Expired</option>
                    <option value="Frozen">❄️ Frozen</option>
                </select>
                {!user?.branchId && branches.length > 0 && (
                    <select
                        className="input"
                        style={{ flex: '1', minWidth: '150px' }}
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b._id} value={b._id}>🏢 {b.name}</option>)}
                    </select>
                )}
            </div>

            <div className="table-container">

                <table>
                    <thead>
                        <tr>
                            <th>Member ID</th>
                            <th>Member</th>
                            <th className="hide-mobile">Phone</th>
                            <th>Plan</th>
                            <th className="hide-mobile">Branch</th>
                            <th className="hide-mobile">Expiry Date</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMembers.length === 0 ? (
                            <tr>
                                <td colSpan="8">
                                    <div className="empty-state">
                                        <div className="empty-state-icon">👥</div>
                                        <h3>No members found</h3>
                                        <p>Try adjusting your search query or status filter.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredMembers.map((member, idx) => (
                            <tr
                                key={member._id}
                                ref={member._id === highlightId ? highlightRef : null}
                                style={member._id === highlightId ? {
                                    background: 'var(--primary-light)',
                                    outline: '2px solid var(--primary)',
                                    transition: 'background 1s, outline 1s'
                                } : {}}
                            >
                                <td>
                                    <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: 'var(--primary, #f59e0b)', background: 'rgba(245, 158, 11, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                        {member.displayId || member.empid || `MEM${1001 + idx}`}
                                    </span>
                                </td>
                                <td>
                                    <div style={{ fontWeight: '600' }}>{member.name}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{member.email}</div>
                                </td>
                                <td className="hide-mobile">{member.phone}</td>
                                <td>{member.planId?.name || 'N/A'}</td>
                                <td className="hide-mobile">
                                    {member.branchId ? (
                                        <span style={{ background: 'rgba(14,165,233,0.1)', color: '#0ea5e9', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600' }}>
                                            🏢 {branches.find(b => b._id === (member.branchId?._id || member.branchId))?.name || 'Branch'}
                                        </span>
                                    ) : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>}
                                </td>
                                <td className="hide-mobile">{new Date(member.expiryDate).toLocaleDateString()}</td>
                                <td><span className={`badge badge-${member.status.toLowerCase()}`}>{member.status}</span></td>
                                <td>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <button className="btn" style={{ padding: '0.4rem', border: '1px solid var(--border-color)', color: '#10b981', background: 'rgba(16,185,129,0.1)' }} title="Renew Plan" onClick={() => {
                                            setRenewMemberData(member);
                                            setRenewForm({ planId: member.planId?._id || member.planId || '', paidAmount: member.planId?.price || '', method: 'Cash' });
                                        }}>
                                            <RefreshCw size={16} />
                                        </button>
                                        <button className="btn" style={{ padding: '0.4rem', border: '1px solid var(--border-color)', color: '#0ea5e9', background: 'rgba(14,165,233,0.1)' }} title="Transfer Branch" onClick={() => {
                                            setTransferMemberData(member);
                                            setTransferBranchId(member.branchId?._id || member.branchId || '');
                                        }}>
                                            <ArrowRightLeft size={16} />
                                        </button>
                                        {user?.role === 'superadmin' && (
                                            <button className="btn" style={{ padding: '0.4rem', border: '1px solid var(--border-color)', color: 'var(--primary)', background: 'rgba(240,160,32,0.1)' }} title="Audit Trail" onClick={() => handleOpenAudit(member)}>
                                                <FileText size={16} />
                                            </button>
                                        )}
                                        <button className="btn" style={{ padding: '0.4rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }} title="Show QR" onClick={() => { setViewingQRMember(member); setIsQRModalOpen(true); }}>
                                            <Smartphone size={16} />
                                        </button>
                                        <button className="btn" style={{ padding: '0.4rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }} onClick={() => handleOpenModal(member)}>
                                            <Pencil size={16} />
                                        </button>
                                        {['superadmin', 'admin', 'fitpass_admin', 'h4_admin'].includes(user?.role) && (
                                            <button className="btn btn-danger" style={{ padding: '0.4rem' }} onClick={() => handleDelete(member._id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </td>

                            </tr>

                        ))}
                    </tbody>
                </table>
            </div>
                 {/* Pagination Controls */}
            {pages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
                    <button
                        className="btn"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                        style={{ opacity: page === 1 ? 0.5 : 1 }}
                    >
                        ◀ Previous
                    </button>
                    <span style={{ fontWeight: '600' }}>Page {page} of {pages}</span>
                    <button
                        className="btn"
                        disabled={page === pages}
                        onClick={() => setPage(page + 1)}
                        style={{ opacity: page === pages ? 0.5 : 1 }}
                    >
                        Next ▶
                    </button>
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setConvertingLeadId(null); setWizardStep(1); }}
                closeOnOverlayClick={false}
                title={editingMember ? 'Edit Member Details' : `📝 Member Registration & Assessment (${wizardStep}/3)`}
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                            e.preventDefault();
                        }
                    }}
                >
                    {convertingLeadId && (
                        <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '0.6rem 0.85rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: '600' }}>
                            🎯 Converting lead to member — details pre-filled below.
                        </div>
                    )}

                    {!editingMember && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            <div style={{ flex: 1, padding: '0.5rem', background: wizardStep >= 1 ? 'var(--primary, #f59e0b)' : 'rgba(255,255,255,0.05)', color: wizardStep >= 1 ? '#000' : 'var(--text-secondary)', borderRadius: '6px', textAlign: 'center', fontSize: '0.78rem', fontWeight: '700' }}>
                                1. Personal & Plan
                            </div>
                            <div style={{ flex: 1, padding: '0.5rem', background: wizardStep >= 2 ? 'var(--primary, #f59e0b)' : 'rgba(255,255,255,0.05)', color: wizardStep >= 2 ? '#000' : 'var(--text-secondary)', borderRadius: '6px', textAlign: 'center', fontSize: '0.78rem', fontWeight: '700' }}>
                                2. Goals (MCQ)
                            </div>
                            <div style={{ flex: 1, padding: '0.5rem', background: wizardStep >= 3 ? 'var(--primary, #f59e0b)' : 'rgba(255,255,255,0.05)', color: wizardStep >= 3 ? '#000' : 'var(--text-secondary)', borderRadius: '6px', textAlign: 'center', fontSize: '0.78rem', fontWeight: '700' }}>
                                3. Health & Notes
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 1: Personal & Plan Info ─── */}
                    {(editingMember || wizardStep === 1) && (
                        <div className="form-grid">
                            <div className="input-group full-width">
                                <label>Full Name *</label>
                                <input className="input" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Phone Number *</label>
                                <input className="input" type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} required />
                            </div>
                            <div className="input-group">
                                <label>Email (Optional)</label>
                                <input className="input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                            </div>
                            <div className="input-group">
                                <label>Subscription Plan *</label>
                                <select
                                    className="input"
                                    value={formData.planId}
                                    onChange={(e) => {
                                        const selected = plans.find(p => p._id === e.target.value);
                                        const catPrice = selected ? Number(selected.price) : 0;
                                        const disc = Math.max(0, Number(formData.discount) || 0);
                                        const net = Math.max(0, catPrice - disc);
                                        setFormData({
                                            ...formData,
                                            planId: e.target.value,
                                            paidAmount: net
                                        });
                                    }}
                                    required
                                >
                                    <option value="">Select a plan</option>
                                    {plans.map(p => <option key={p._id} value={p._id}>{p.name} (₹{p.price})</option>)}
                                </select>
                            </div>

                            {/* Plan Pricing & Discount Breakdown */}
                            {formData.planId && (
                                (() => {
                                    const selected = plans.find(p => p._id === formData.planId);
                                    const catPrice = selected ? Number(selected.price) : 0;
                                    const disc = Math.max(0, Number(formData.discount) || 0);
                                    const net = Math.max(0, catPrice - disc);
                                    const paid = Math.max(0, Number(formData.paidAmount) || 0);
                                    const pending = Math.max(0, net - paid);

                                    return (
                                        <div className="full-width" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', marginTop: '0.25rem', marginBottom: '0.5rem' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Catalogue Price</span>
                                                    <strong style={{ fontSize: '1rem', color: '#fff' }}>₹{catPrice}</strong>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Discount Given</span>
                                                    <strong style={{ fontSize: '1rem', color: disc > 0 ? '#10b981' : '#fff' }}>-₹{disc}</strong>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Net Agreed Fee</span>
                                                    <strong style={{ fontSize: '1.1rem', color: 'var(--primary, #f59e0b)' }}>₹{net}</strong>
                                                </div>
                                                <div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Pending Balance</span>
                                                    <strong style={{ fontSize: '1rem', color: pending > 0 ? '#ef4444' : '#10b981' }}>
                                                        {pending > 0 ? `₹${pending} Due` : '₹0 Settled'}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}

                            {!editingMember && formData.planId && (
                                <>
                                    <div className="input-group">
                                        <label>Manual Discount (₹)</label>
                                        <input
                                            className="input"
                                            type="number"
                                            min="0"
                                            value={formData.discount || ''}
                                            onChange={(e) => {
                                                const discVal = Math.max(0, Number(e.target.value) || 0);
                                                const selected = plans.find(p => p._id === formData.planId);
                                                const catPrice = selected ? Number(selected.price) : 0;
                                                const net = Math.max(0, catPrice - discVal);
                                                setFormData({
                                                    ...formData,
                                                    discount: e.target.value,
                                                    paidAmount: net
                                                });
                                            }}
                                            placeholder="0 (No discount)"
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Amount Paid Upfront (₹) *</label>
                                        <input
                                            className="input"
                                            type="number"
                                            min="0"
                                            value={formData.paidAmount}
                                            onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                                            placeholder="Amount collected now"
                                            required
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Payment Method</label>
                                        <select
                                            className="input"
                                            value={formData.paymentMethod || 'Cash'}
                                            onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="UPI">UPI</option>
                                            <option value="Card">Card</option>
                                            <option value="Bank Transfer">Bank Transfer</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {!user?.branchId && (
                                <div className="input-group">
                                    <label>Branch (optional)</label>
                                    <select className="input" value={formData.branchId} onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}>
                                        <option value="">No Branch / All Locations</option>
                                        {branches.map(b => <option key={b._id} value={b._id}>🏢 {b.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {['superadmin', 'fitpass_admin'].includes(user?.role) && (
                                <div className="input-group">
                                    <label>Gym Division / Partner Gym</label>
                                    <select className="input" value={formData.gymId} onChange={(e) => setFormData({ ...formData, gymId: e.target.value })} required>
                                        <option value="">Select Gym</option>
                                        {gyms.map(g => <option key={g._id || g.id} value={g._id || g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="input-group">
                                <label>{editingMember ? 'Reset Password (optional)' : 'Password (optional, default: Phone)'}</label>
                                <input className="input" type="password" placeholder="Set member password" value={formData.password || ''} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                            </div>
                            {!editingMember && (
                                <div className="input-group">
                                    <label>Join Date *</label>
                                    <input className="input" type="date" value={formData.joinDate} onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })} required />
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── STEP 2: MCQ Fitness & Lifestyle Questionnaire ─── */}
                    {!editingMember && wizardStep === 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div className="input-group">
                                <label style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Q1. What is the member's Primary Fitness Goal? (Multiple Choice)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    {[
                                        { val: 'Fat Loss', label: '🔥 Fat Loss & Toning' },
                                        { val: 'Muscle Hypertrophy', label: '💪 Muscle Mass & Bodybuilding' },
                                        { val: 'Athletic Endurance', label: '🏃 Athletic Endurance & Cardio' },
                                        { val: 'General Wellness', label: '🧘 Mobility & General Health' }
                                    ].map(opt => (
                                        <div
                                            key={opt.val}
                                            onClick={() => setQuestionnaire({ ...questionnaire, fitnessGoal: opt.val })}
                                            style={{
                                                padding: '0.85rem',
                                                borderRadius: '8px',
                                                border: `2px solid ${questionnaire.fitnessGoal === opt.val ? 'var(--primary, #f59e0b)' : 'var(--border-color, #d1d5db)'}`,
                                                background: questionnaire.fitnessGoal === opt.val ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-card, rgba(0,0,0,0.02))',
                                                cursor: 'pointer',
                                                fontSize: '0.88rem',
                                                fontWeight: questionnaire.fitnessGoal === opt.val ? '700' : '600',
                                                color: questionnaire.fitnessGoal === opt.val ? 'var(--primary, #d97706)' : 'var(--text-color, #1f2937)'
                                            }}
                                        >
                                            {opt.label}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Q2. Gym Training Experience Level? (Multiple Choice)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                    {[
                                        { val: 'Beginner', label: '🐣 Beginner (< 6 mos)' },
                                        { val: 'Intermediate', label: '🏋️ Intermediate (1-2 yrs)' },
                                        { val: 'Advanced', label: '🏆 Advanced (3+ yrs)' }
                                    ].map(opt => (
                                        <div
                                            key={opt.val}
                                            onClick={() => setQuestionnaire({ ...questionnaire, experienceLevel: opt.val })}
                                            style={{
                                                padding: '0.75rem 0.5rem',
                                                borderRadius: '8px',
                                                border: `2px solid ${questionnaire.experienceLevel === opt.val ? 'var(--primary, #f59e0b)' : 'var(--border-color, #d1d5db)'}`,
                                                background: questionnaire.experienceLevel === opt.val ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-card, rgba(0,0,0,0.02))',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.82rem',
                                                fontWeight: questionnaire.experienceLevel === opt.val ? '700' : '600',
                                                color: questionnaire.experienceLevel === opt.val ? 'var(--primary, #d97706)' : 'var(--text-color, #1f2937)'
                                            }}
                                        >
                                            {opt.label}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Q3. Planned Workout Frequency? (Multiple Choice)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                    {['1-2 Days / Week', '3-4 Days / Week', '5-6 Days / Week'].map(freq => (
                                        <div
                                            key={freq}
                                            onClick={() => setQuestionnaire({ ...questionnaire, workoutFrequency: freq })}
                                            style={{
                                                padding: '0.75rem 0.5rem',
                                                borderRadius: '8px',
                                                border: `2px solid ${questionnaire.workoutFrequency === freq ? 'var(--primary, #f59e0b)' : 'var(--border-color, #d1d5db)'}`,
                                                background: questionnaire.workoutFrequency === freq ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-card, rgba(0,0,0,0.02))',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                fontSize: '0.82rem',
                                                fontWeight: questionnaire.workoutFrequency === freq ? '700' : '600',
                                                color: questionnaire.workoutFrequency === freq ? 'var(--primary, #d97706)' : 'var(--text-color, #1f2937)'
                                            }}
                                        >
                                            {freq}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="input-group">
                                <label style={{ fontWeight: '700', marginBottom: '0.5rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Q4. Dietary / Nutrition Preference? (Multiple Choice)</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    {[
                                        { val: 'Vegetarian', label: '🥗 Vegetarian' },
                                        { val: 'Non-Vegetarian', label: '🍗 Non-Vegetarian' },
                                        { val: 'Vegan', label: '🌱 Vegan / Plant-Based' },
                                        { val: 'Keto', label: '🥩 High Protein / Keto' }
                                    ].map(diet => (
                                        <div
                                            key={diet.val}
                                            onClick={() => setQuestionnaire({ ...questionnaire, dietPreference: diet.val })}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '8px',
                                                border: `2px solid ${questionnaire.dietPreference === diet.val ? 'var(--primary, #f59e0b)' : 'var(--border-color, #d1d5db)'}`,
                                                background: questionnaire.dietPreference === diet.val ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-card, rgba(0,0,0,0.02))',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                fontWeight: questionnaire.dietPreference === diet.val ? '700' : '600',
                                                color: questionnaire.dietPreference === diet.val ? 'var(--primary, #d97706)' : 'var(--text-color, #1f2937)'
                                            }}
                                        >
                                            {diet.label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── STEP 3: Specific Health & Emergency Textbox Questions ─── */}
                    {!editingMember && wizardStep === 3 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div className="input-group">
                                <label style={{ fontWeight: '700', marginBottom: '0.4rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Q5. Medical History, Past Injuries or Pre-existing Conditions (Text Box)</label>
                                <textarea
                                    className="input"
                                    rows="3"
                                    placeholder="Enter details (e.g. Lower back pain, asthma, past surgery, hypertension, or 'None')"
                                    value={questionnaire.medicalHistory}
                                    onChange={(e) => setQuestionnaire({ ...questionnaire, medicalHistory: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="input-group">
                                    <label style={{ fontWeight: '700', marginBottom: '0.4rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Emergency Contact Name</label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="e.g. John Doe (Spouse / Parent)"
                                        value={questionnaire.emergencyContactName}
                                        onChange={(e) => setQuestionnaire({ ...questionnaire, emergencyContactName: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label style={{ fontWeight: '700', marginBottom: '0.4rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Emergency Phone</label>
                                    <input
                                        className="input"
                                        type="text"
                                        placeholder="e.g. 9876543210"
                                        value={questionnaire.emergencyContactPhone}
                                        onChange={(e) => setQuestionnaire({ ...questionnaire, emergencyContactPhone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="input-group">
                                <label style={{ fontWeight: '700', marginBottom: '0.4rem', display: 'block', color: 'var(--text-color, #1f2937)' }}>Q6. Specific Fitness Remarks & Coach Instructions (Text Box)</label>
                                <textarea
                                    className="input"
                                    rows="2"
                                    placeholder="Any specific instructions, target weight, or special trainer notes..."
                                    value={questionnaire.specialNotes}
                                    onChange={(e) => setQuestionnaire({ ...questionnaire, specialNotes: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {/* Wizard Navigation & Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1.75rem' }}>
                        {editingMember ? (
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={(e) => handleSubmit(e)}
                            >
                                Update Member Details
                            </button>
                        ) : (
                            <>
                                {wizardStep > 1 && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setWizardStep(prev => prev - 1);
                                        }}
                                    >
                                        ◀ Back
                                    </button>
                                )}

                                {wizardStep < 3 ? (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        style={{ marginLeft: 'auto' }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!formData.name || !formData.phone || !formData.planId) {
                                                alert('Please fill in Member Name, Phone Number, and select a Subscription Plan first.');
                                                return;
                                            }
                                            setWizardStep(prev => prev + 1);
                                        }}
                                    >
                                        Next: {wizardStep === 1 ? 'Fitness Questionnaire ▶' : 'Medical Details ▶'}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        style={{ marginLeft: 'auto' }}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleSubmit(e);
                                        }}
                                    >
                                        Submit Registration ✅
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </form>
            </Modal>

            {/* QR Code Modal */}
            <Modal isOpen={isQRModalOpen} onClose={() => setIsQRModalOpen(false)} title="Member QR Attendance Code">
                {viewingQRMember && (
                    <div style={{ textAlign: 'center', padding: '1rem' }}>
                        <div style={{ padding: '1.5rem', background: 'white', borderRadius: '12px', display: 'inline-block', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                            <QRCodeCanvas
                                id="member-qr"
                                value={viewingQRMember._id}
                                size={200}
                                level="H"
                                includeMargin={true}
                            />
                        </div>
                        <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{viewingQRMember.name}</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Member ID: {viewingQRMember._id}</p>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleDownloadQR}>Download QR Code</button>
                    </div>
                )}
            </Modal>

            {/* Audit Trail Modal */}
            <Modal isOpen={isAuditModalOpen} onClose={() => setIsAuditModalOpen(false)} title="Member Profile & Audit Trail">
                {loadingAudit ? (
                    <div style={{ textAlign: 'center', padding: '3rem' }}>
                        <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
                        <p style={{ color: 'var(--text-secondary)' }}>Loading audit trail...</p>
                    </div>
                ) : auditData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                        
                        {/* Member Card */}
                        <div style={{ background: 'var(--card-bg, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '12px', padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '0.25rem' }}>{auditData.member.name}</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>📞 {auditData.member.phone} | ✉️ {auditData.member.email || 'No email'}</p>
                                </div>
                                <span className={`badge badge-${auditData.member.status.toLowerCase()}`}>{auditData.member.status}</span>
                            </div>
                            
                            <hr style={{ borderColor: 'var(--border-color, #3A3025)', margin: '1rem 0' }} />
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Current Division/Gym</span>
                                    <strong style={{ color: '#fff' }}>🏢 {auditData.member.gymName}</strong>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Joined Date</span>
                                    <strong style={{ color: '#fff' }}>📅 {new Date(auditData.member.joinDate).toLocaleDateString()} ({auditData.member.joinMonth})</strong>
                                </div>
                            </div>
                        </div>

                        {/* Financials & Subscription Plan */}
                        <div style={{ background: 'var(--card-bg, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '12px', padding: '1.5rem' }}>
                            <h4 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '1rem', marginTop: 0 }}>Subscription & Financial Summary</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Current Plan</span>
                                    <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{auditData.member.currentPlan ? auditData.member.currentPlan.name : 'No active plan'}</strong>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Catalogue Price</span>
                                    <strong style={{ fontSize: '1.05rem', color: '#fff' }}>₹{auditData.member.financials.catalogPrice || auditData.member.financials.planPrice}</strong>
                                </div>
                                {auditData.member.financials.discountAmount > 0 && (
                                    <div style={{ background: 'rgba(16,185,129,0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'block' }}>Discount Given</span>
                                        <strong style={{ fontSize: '1.05rem', color: '#10b981' }}>-₹{auditData.member.financials.discountAmount}</strong>
                                    </div>
                                )}
                                <div style={{ background: 'rgba(245,158,11,0.05)', padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--primary, #f59e0b)', display: 'block' }}>Net Agreed Fee</span>
                                    <strong style={{ fontSize: '1.1rem', color: 'var(--primary, #f59e0b)' }}>₹{auditData.member.financials.planPrice}</strong>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Total Paid</span>
                                    <strong style={{ fontSize: '1.1rem', color: '#10b981' }}>₹{auditData.member.financials.paidAmount}</strong>
                                </div>
                                <div style={{ background: auditData.member.financials.pendingAmount > 0 ? 'rgba(198,40,40,0.1)' : 'rgba(16,185,129,0.05)', padding: '0.75rem', borderRadius: '8px', border: auditData.member.financials.pendingAmount > 0 ? '1px solid #C62828' : '1px solid rgba(16,185,129,0.2)' }}>
                                    <span style={{ fontSize: '0.75rem', color: auditData.member.financials.pendingAmount > 0 ? '#ff8a80' : '#10b981', display: 'block' }}>Pending Balance</span>
                                    <strong style={{ fontSize: '1.1rem', color: auditData.member.financials.pendingAmount > 0 ? '#C62828' : '#10b981' }}>
                                        {auditData.member.financials.pendingAmount > 0 ? `₹${auditData.member.financials.pendingAmount} Due` : '₹0 Settled'}
                                    </strong>
                                </div>
                            </div>
                        </div>

                        {/* Division Switch History */}
                        <div style={{ background: 'var(--card-bg, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '12px', padding: '1.5rem' }}>
                            <h4 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '1rem', marginTop: 0 }}>Division Transition History</h4>
                            {auditData.divisionSwitches.length === 0 ? (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>No transition events recorded. Member has remained in their initial division since registration.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {auditData.divisionSwitches.map((sw, idx) => (
                                        <div key={idx} style={{ padding: '0.75rem', background: 'rgba(240,160,32,0.04)', borderLeft: '3px solid var(--primary)', borderRadius: '0 8px 8px 0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                <strong style={{ fontSize: '0.88rem', color: '#fff' }}>{sw.details}</strong>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(sw.timestamp).toLocaleString()}</span>
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Authorized by: {sw.performedBy}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* SuperAdmin Conversion controls */}
                        {['superadmin', 'fitpass_admin'].includes(user?.role) && (
                            <div style={{ background: 'var(--card-bg, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '12px', padding: '1.5rem' }}>
                                <h4 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '1.0rem', marginTop: 0 }}>🔄 Convert Member Type / Division</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                                        Instantly transition this member's type by migrating them to a different division/gym. This will trigger audit logging.
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <select
                                            style={{
                                                padding: '0.5rem 1rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color, #3A3025)',
                                                background: 'var(--bg-secondary, #231D14)',
                                                color: '#fff',
                                                fontSize: '0.88rem',
                                                flex: 1,
                                                minWidth: '200px'
                                            }}
                                            value={auditData.member.gymId || ''}
                                            onChange={async (e) => {
                                                const newGymId = e.target.value;
                                                if (newGymId === auditData.member.gymId) return;
                                                if (window.confirm(`Are you sure you want to transition this member to the selected gym/division?`)) {
                                                    try {
                                                        setLoadingAudit(true);
                                                        await updateMember(auditData.member.id, { gymId: newGymId });
                                                        // Refetch audit trail data
                                                        const freshAudit = await getMemberAuditTrail(auditData.member.id);
                                                        setAuditData(freshAudit);
                                                        fetchData(); // update background members table
                                                    } catch (err) {
                                                        alert(err.response?.data?.message || 'Failed to transition member');
                                                    } finally {
                                                        setLoadingAudit(false);
                                                    }
                                                }
                                            }}
                                        >
                                            <option value="" disabled>Select Division / Gym</option>
                                            {gyms.map(g => (
                                                <option key={g._id || g.id} value={g._id || g.id}>
                                                    {g.name === 'H4' ? '🏢 H4 (Gym Membership)' : `🏋️ ${g.name} (FitPass Partner)`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Member Fitness, Diet & Health Profile */}
                        {(() => {
                            const assessmentLog = auditData.auditLogs?.find(l => l.action === 'MEMBER_ASSESSMENT');
                            let parsed = {
                                fitnessGoal: 'Fat Loss & Toning',
                                experienceLevel: 'Beginner (< 6 mos)',
                                workoutFrequency: '3-4 Days / Week',
                                dietPreference: 'Vegetarian',
                                medicalHistory: 'None declared',
                                emergencyContact: 'None provided',
                                specialNotes: 'Standard fitness orientation & onboarding routine'
                            };

                            if (assessmentLog?.details) {
                                const d = assessmentLog.details;
                                const goalMatch = d.match(/Goal:\s*([^|]+)/i);
                                const expMatch = d.match(/Experience:\s*([^|]+)/i);
                                const freqMatch = d.match(/Frequency:\s*([^|]+)/i);
                                const dietMatch = d.match(/Diet:\s*([^|]+)/i);
                                const medMatch = d.match(/Medical:\s*([^|]+)/i);
                                const emergMatch = d.match(/Emergency:\s*([^|]+)/i);
                                const notesMatch = d.match(/Notes:\s*(.+)$/i);

                                if (goalMatch) parsed.fitnessGoal = goalMatch[1].trim();
                                if (expMatch) parsed.experienceLevel = expMatch[1].trim();
                                if (freqMatch) parsed.workoutFrequency = freqMatch[1].trim();
                                if (dietMatch) parsed.dietPreference = dietMatch[1].trim();
                                if (medMatch) parsed.medicalHistory = medMatch[1].trim();
                                if (emergMatch) parsed.emergencyContact = emergMatch[1].trim();
                                if (notesMatch) parsed.specialNotes = notesMatch[1].trim();
                            }

                            return (
                                <div style={{ background: 'var(--card-bg, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '12px', padding: '1.5rem' }}>
                                    <h4 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '1rem', marginTop: 0 }}>
                                        🥗 Member Lifestyle, Diet & Health Profile
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>🥗 Diet & Nutrition</span>
                                            <strong style={{ fontSize: '0.95rem', color: '#10b981' }}>{parsed.dietPreference}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>🔥 Primary Fitness Goal</span>
                                            <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{parsed.fitnessGoal}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>🏋️ Training Experience</span>
                                            <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{parsed.experienceLevel}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>📅 Workout Frequency</span>
                                            <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{parsed.workoutFrequency}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>🩺 Medical / Injuries</span>
                                            <strong style={{ fontSize: '0.92rem', color: '#fff' }}>{parsed.medicalHistory}</strong>
                                        </div>
                                        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>🚨 Emergency Contact</span>
                                            <strong style={{ fontSize: '0.92rem', color: '#fff' }}>{parsed.emergencyContact}</strong>
                                        </div>
                                    </div>
                                    {parsed.specialNotes && (
                                        <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', background: 'rgba(240,160,32,0.04)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>📝 Coach Remarks & Instructions:</span>
                                            <p style={{ fontSize: '0.85rem', color: '#fff', margin: '0.2rem 0 0 0' }}>{parsed.specialNotes}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Comprehensive Audit Logs */}
                        <div style={{ background: 'var(--card-bg, #2D251C)', border: '1px solid var(--border-color, #3A3025)', borderRadius: '12px', padding: '1.5rem' }}>
                            <h4 style={{ fontSize: '1rem', color: 'var(--primary)', marginBottom: '1rem', marginTop: 0 }}>Comprehensive Action Audit Logs</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                {auditData.auditLogs.map((log) => (
                                    <div key={log._id} style={{ padding: '0.6rem', borderBottom: '1px solid var(--border-color, #3A3025)', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                                        <div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>{log.action}</span>
                                            <p style={{ fontSize: '0.82rem', color: '#fff', margin: '0.15rem 0' }}>{log.details}</p>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Actor: {log.userName} ({log.userRole})</span>
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{new Date(log.createdAt).toLocaleDateString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                ) : (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No audit data available</p>
                )}

            </Modal>

            {/* Renew Plan Modal */}
            <Modal isOpen={!!renewMemberData} onClose={() => setRenewMemberData(null)} title={`🔄 Upgrade / Renew Plan: ${renewMemberData?.name}`}>
                <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSubmittingAction(true);
                    try {
                        const selected = plans.find(p => p._id === renewForm.planId);
                        const catalogPrice = selected ? selected.price : 0;
                        const disc = Math.max(0, Number(renewForm.discount) || 0);
                        const finalPrice = Math.max(0, catalogPrice - disc);

                        await API.post(`/members/${renewMemberData._id}/renew`, {
                            ...renewForm,
                            discount: disc,
                            finalPrice,
                            paidAmount: Number(renewForm.paidAmount) || 0
                        });
                        setRenewMemberData(null);
                        fetchData();
                    } catch (err) {
                        alert(err.response?.data?.message || 'Failed to renew membership');
                    } finally {
                        setSubmittingAction(false);
                    }
                }}>
                    <div className="input-group">
                        <label>Select Plan *</label>
                        <select
                            className="input"
                            value={renewForm.planId}
                            onChange={(e) => {
                                const selected = plans.find(p => p._id === e.target.value);
                                const catPrice = selected ? selected.price : 0;
                                const disc = Number(renewForm.discount) || 0;
                                const net = Math.max(0, catPrice - disc);
                                setRenewForm({
                                    ...renewForm,
                                    planId: e.target.value,
                                    paidAmount: net
                                });
                            }}
                            required
                        >
                            <option value="">Select Plan</option>
                            {plans.map(p => (
                                <option key={p._id} value={p._id}>{p.name} — ₹{p.price} ({p.duration ? `${p.duration} days` : `${p.sessions} sessions`})</option>
                            ))}
                        </select>
                    </div>

                    {renewForm.planId && (
                        (() => {
                            const selected = plans.find(p => p._id === renewForm.planId);
                            const catPrice = selected ? Number(selected.price) : 0;
                            const disc = Math.max(0, Number(renewForm.discount) || 0);
                            const net = Math.max(0, catPrice - disc);
                            const paid = Math.max(0, Number(renewForm.paidAmount) || 0);
                            const pending = Math.max(0, net - paid);

                            return (
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem', marginBottom: '1.25rem' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Catalogue Price</span>
                                            <strong style={{ fontSize: '1rem', color: '#fff' }}>₹{catPrice}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Discount Applied</span>
                                            <strong style={{ fontSize: '1rem', color: disc > 0 ? '#10b981' : '#fff' }}>-₹{disc}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Net Agreed Fee</span>
                                            <strong style={{ fontSize: '1.1rem', color: 'var(--primary, #f59e0b)' }}>₹{net}</strong>
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Pending Balance</span>
                                            <strong style={{ fontSize: '1rem', color: pending > 0 ? '#ef4444' : '#10b981' }}>
                                                {pending > 0 ? `₹${pending} Due` : '₹0 Settled'}
                                            </strong>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label>Manual Discount (₹)</label>
                            <input
                                className="input"
                                type="number"
                                min="0"
                                value={renewForm.discount || ''}
                                onChange={(e) => {
                                    const discVal = Math.max(0, Number(e.target.value) || 0);
                                    const selected = plans.find(p => p._id === renewForm.planId);
                                    const catPrice = selected ? Number(selected.price) : 0;
                                    const net = Math.max(0, catPrice - discVal);
                                    setRenewForm({
                                        ...renewForm,
                                        discount: e.target.value,
                                        paidAmount: net
                                    });
                                }}
                                placeholder="0 (No discount)"
                            />
                        </div>

                        <div className="input-group">
                            <label>Amount Paid Now (₹) *</label>
                            <input
                                className="input"
                                type="number"
                                min="0"
                                value={renewForm.paidAmount}
                                onChange={(e) => setRenewForm({ ...renewForm, paidAmount: e.target.value })}
                                placeholder="Amount collected"
                                required
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Payment Method</label>
                        <select
                            className="input"
                            value={renewForm.method}
                            onChange={(e) => setRenewForm({ ...renewForm, method: e.target.value })}
                        >
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Card">Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={submittingAction}>
                        {submittingAction ? 'Processing Plan Upgrade...' : 'Confirm Plan Upgrade / Renewal'}
                    </button>
                </form>
            </Modal>

            {/* Transfer Branch Modal */}
            <Modal isOpen={!!transferMemberData} onClose={() => setTransferMemberData(null)} title={`🏢 Transfer Branch: ${transferMemberData?.name}`}>
                <form onSubmit={async (e) => {
                    e.preventDefault();
                    setSubmittingAction(true);
                    try {
                        await API.put(`/members/${transferMemberData._id}/transfer`, { targetBranchId: transferBranchId });
                        setTransferMemberData(null);
                        fetchData();
                    } catch (err) {
                        alert(err.response?.data?.message || 'Failed to transfer branch');
                    } finally {
                        setSubmittingAction(false);
                    }
                }}>
                    <div className="input-group">
                        <label>Target Gym Branch *</label>
                        <select
                            className="input"
                            value={transferBranchId}
                            onChange={(e) => setTransferBranchId(e.target.value)}
                        >
                            <option value="">No Branch (Global Gym Access)</option>
                            {branches.map(b => (
                                <option key={b._id} value={b._id}>🏢 {b.name} — {b.address || 'Main Location'}</option>
                            ))}
                        </select>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Transferring this member updates their branch assignment for attendance, trainer assignments, and revenue reports.
                    </p>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={submittingAction}>
                        {submittingAction ? 'Transferring...' : 'Confirm Branch Transfer'}
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export default Members;

