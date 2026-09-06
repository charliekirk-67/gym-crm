import { useState, useEffect, useContext } from 'react';
import { getStaff, createStaff, updateStaff, deleteStaff } from '../services/apiService';
import Modal from '../components/Modal';
import { AuthContext } from '../context/AuthContext';
import { Pencil, Trash2, Eye, EyeOff, ShieldCheck, Users, ToggleLeft, ToggleRight, Sparkles, Check, CheckSquare } from 'lucide-react';

const Staff = () => {
    const { user } = useContext(AuthContext);
    const [activeTab, setActiveTab] = useState('directory'); // 'directory' | 'matrix'
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    
    // Filters
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'trainer'
    });
    const [error, setError] = useState('');

    // --- Dynamic Permissions Matrix state ---
    const initialMatrix = {
        superadmin: {
            members: true, workouts: true, settings: true, finance: true, classes: true, reports: true
        },
        admin: {
            members: true, workouts: true, settings: true, finance: true, classes: true, reports: true
        },
        receptionist: {
            members: true, workouts: false, settings: false, finance: false, classes: true, reports: false
        },
        trainer: {
            members: true, workouts: true, settings: false, finance: false, classes: true, reports: false
        },
        member: {
            members: false, workouts: true, settings: false, finance: false, classes: false, reports: false
        }
    };

    const [matrix, setMatrix] = useState(() => {
        const saved = localStorage.getItem('cfg_permission_matrix');
        return saved ? JSON.parse(saved) : initialMatrix;
    });

    const [matrixMessage, setMatrixMessage] = useState('');

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            const data = await getStaff();
            setStaffList(data);
        } catch (error) {
            console.error('Error fetching staff list:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (staff = null) => {
        setError('');
        setShowPassword(false);
        if (staff) {
            setEditingStaff(staff);
            setFormData({
                name: staff.name,
                email: staff.email,
                password: '',
                role: staff.role
            });
        } else {
            setEditingStaff(null);
            setFormData({
                name: '',
                email: '',
                password: '',
                role: 'trainer'
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (editingStaff) {
                const payload = { ...formData };
                if (!payload.password) {
                    delete payload.password;
                }
                await updateStaff(editingStaff._id, payload);
            } else {
                await createStaff(formData);
            }
            fetchStaff();
            setIsModalOpen(false);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save staff member');
        }
    };

    const handleDelete = async (staffMember) => {
        if (staffMember._id === user?._id || staffMember.id === user?.id) {
            alert('You cannot delete your own account.');
            return;
        }
        if (window.confirm(`Are you sure you want to remove ${staffMember.name} from the gym staff?`)) {
            try {
                await deleteStaff(staffMember._id);
                fetchStaff();
            } catch (err) {
                alert(err.response?.data?.message || 'Error deleting staff member');
            }
        }
    };

    const toggleMatrixPermission = (role, moduleKey) => {
        if (role === 'superadmin') return; // Superadmin permissions are immutable/locked
        const updated = {
            ...matrix,
            [role]: {
                ...matrix[role],
                [moduleKey]: !matrix[role][moduleKey]
            }
        };
        setMatrix(updated);
        localStorage.setItem('cfg_permission_matrix', JSON.stringify(updated));
        
        setMatrixMessage('Permission configuration synced locally!');
        setTimeout(() => setMatrixMessage(''), 2500);
    };

    const filteredStaff = staffList.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) || 
                              s.email.toLowerCase().includes(search.toLowerCase());
        const matchesRole = roleFilter ? s.role === roleFilter : true;
        return matchesSearch && matchesRole;
    });

    return (
        <div className="fade-in">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldCheck color="var(--primary)" /> Staff & Access Matrix
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                        Configure dynamic role capabilities and manage gym staff member logins.
                    </p>
                </div>
                {activeTab === 'directory' && (
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        👤 Add New Staff
                    </button>
                )}
            </div>

            {/* TAB SELECTOR */}
            <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid var(--border)', maxWidth: 'max-content' }}>
                <button 
                    className={`btn ${activeTab === 'directory' ? 'btn-primary' : ''}`} 
                    style={{ background: activeTab === 'directory' ? '' : 'none', border: 'none', color: activeTab === 'directory' ? '' : 'var(--text-secondary)' }}
                    onClick={() => setActiveTab('directory')}
                >
                    Staff Directory ({staffList.length})
                </button>
                <button 
                    className={`btn ${activeTab === 'matrix' ? 'btn-primary' : ''}`} 
                    style={{ background: activeTab === 'matrix' ? '' : 'none', border: 'none', color: activeTab === 'matrix' ? '' : 'var(--text-secondary)' }}
                    onClick={() => setActiveTab('matrix')}
                >
                    Permission Matrix
                </button>
            </div>

            {/* Directory Tab */}
            {activeTab === 'directory' && (
                <>
                    {/* Filter Bar */}
                    <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input 
                            className="form-control" 
                            style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}
                            placeholder="Search by name or email..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <select 
                            className="form-control" 
                            style={{ width: '180px', marginBottom: 0 }}
                            value={roleFilter}
                            onChange={e => setRoleFilter(e.target.value)}
                        >
                            <option value="">All Roles</option>
                            <option value="trainer">Trainer</option>
                            <option value="receptionist">Receptionist</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner"></div></div>
                    ) : (
                        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Staff ID</th>
                                        <th>Name</th>
                                        <th>Email Address</th>
                                        <th>Role</th>
                                        <th>Created At</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStaff.length > 0 ? (
                                        filteredStaff.map((staff, idx) => (
                                            <tr key={staff._id || staff.id}>
                                                <td>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: 'var(--primary, #f59e0b)', background: 'rgba(245, 158, 11, 0.08)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                        {staff.displayId || staff.empid || `EMP${1001 + idx}`}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: '600' }}>{staff.name}</td>
                                                <td>{staff.email}</td>
                                                <td>
                                                    <span className={`badge`} style={{
                                                        padding: '0.25rem 0.6rem',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '700',
                                                        textTransform: 'uppercase',
                                                        background: staff.role === 'admin' ? 'rgba(239, 68, 68, 0.1)' : 
                                                                    staff.role === 'trainer' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                                        color: staff.role === 'admin' ? '#ef4444' : 
                                                               staff.role === 'trainer' ? '#6366f1' : '#f59e0b'
                                                    }}>
                                                        {staff.role}
                                                    </span>
                                                </td>
                                                <td>{new Date(staff.createdAt).toLocaleDateString('en-IN')}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button 
                                                            className="btn" 
                                                            style={{ padding: '0.4rem', border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}
                                                            onClick={() => handleOpenModal(staff)}
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button 
                                                            className="btn btn-danger" 
                                                            style={{ padding: '0.4rem' }}
                                                            onClick={() => handleDelete(staff)}
                                                            disabled={staff._id === user?._id || staff.id === user?.id}
                                                            title={staff._id === user?._id || staff.id === user?.id ? 'Cannot delete yourself' : ''}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan="5">
                                                <div className="empty-state" style={{ textAlign: 'center', padding: '3rem' }}>
                                                    <h3>No staff members found</h3>
                                                    <p>Try adjusting your search query or role filter.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Matrix Tab */}
            {activeTab === 'matrix' && (
                <div className="fade-in">
                    {matrixMessage && (
                        <div style={{
                            background: 'rgba(46, 125, 50, 0.1)', border: '1px solid var(--success)',
                            color: 'var(--success)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', fontWeight: '600'
                        }}>
                            ✓ {matrixMessage}
                        </div>
                    )}

                    <div className="card" style={{ padding: '2rem', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>System Modules Permission Matrix</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>Configure granular feature access for each default user group.</p>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '0.3rem 0.6rem', borderRadius: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                                Immutable Superadmin Mode Active
                            </span>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table className="table" style={{ width: '100%', textAlign: 'center' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: 'left' }}>System Capability</th>
                                        <th>Superadmin</th>
                                        <th>Admin</th>
                                        <th>Receptionist</th>
                                        <th>Trainer</th>
                                        <th>Member</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { key: 'members', label: 'Manage Member Profiles & Statuses' },
                                        { key: 'workouts', label: 'Assign Workout & Diet Programs' },
                                        { key: 'settings', label: 'Modify Branding & Cooldown Settings' },
                                        { key: 'finance', label: 'Access Financials, Dues & Taxes' },
                                        { key: 'classes', label: 'Manage Classes & Timetables' },
                                        { key: 'reports', label: 'Generate Audits & Executive Reports' }
                                    ].map(mod => (
                                        <tr key={mod.key}>
                                            <td style={{ textAlign: 'left', fontWeight: '700', fontSize: '0.875rem' }}>{mod.label}</td>
                                            
                                            {/* Superadmin always true */}
                                            <td>
                                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                    <CheckSquare size={20} color="var(--primary)" style={{ opacity: 0.8 }} />
                                                </div>
                                            </td>

                                            {/* Roles editable */}
                                            {['admin', 'receptionist', 'trainer', 'member'].map(role => {
                                                const hasAccess = matrix[role][mod.key];
                                                return (
                                                    <td key={role}>
                                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                                            <button 
                                                                type="button"
                                                                onClick={() => toggleMatrixPermission(role, mod.key)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                                                            >
                                                                {hasAccess ? (
                                                                    <CheckSquare size={20} color="var(--primary)" />
                                                                ) : (
                                                                    <div style={{ width: '20px', height: '20px', border: '2px solid var(--border)', borderRadius: '4px' }} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Features Matrix Info */}
                    <div className="card" style={{ padding: '2rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: '260px' }}>
                            <h4 style={{ margin: '0 0 0.5rem 0' }}>🔐 Dynamic Permission Control</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', margin: 0 }}>
                                Custom checks are intercepted at the route layer. Setting changes made in this dashboard immediately block access to pages and hide their sidebar icons across the entire organization.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                title={editingStaff ? `✏️ Edit Staff: ${editingStaff.name}` : '👤 Create New Staff Member'}
            >
                <form onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
                    {error && (
                        <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem', fontWeight: '500' }}>
                            {error}
                        </div>
                    )}
                    
                    <div className="form-grid">
                        <div className="input-group">
                            <label>Full Name *</label>
                            <input 
                                className="input" 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({ ...formData, name: e.target.value })} 
                                required 
                                placeholder="John Doe"
                            />
                        </div>

                        <div className="input-group">
                            <label>Email Address *</label>
                            <input 
                                className="input" 
                                type="email" 
                                value={formData.email} 
                                onChange={e => setFormData({ ...formData, email: e.target.value })} 
                                required 
                                placeholder="john@example.com"
                            />
                        </div>

                        <div className="input-group">
                            <label>{editingStaff ? 'New Password' : 'Password *'}</label>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input 
                                    className="input" 
                                    type={showPassword ? 'text' : 'password'} 
                                    value={formData.password} 
                                    onChange={e => setFormData({ ...formData, password: e.target.value })} 
                                    required={!editingStaff} 
                                    placeholder={editingStaff ? 'Leave blank' : 'Enter password'}
                                    style={{ paddingRight: '2.5rem' }}
                                    // Make sure it doesn't wrap weirdly
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)' }}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="input-group">
                            <label>System Role *</label>
                            <select 
                                className="input" 
                                value={formData.role} 
                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                                required
                            >
                                <option value="trainer">Trainer / Instructor</option>
                                <option value="receptionist">Receptionist / Desk Staff</option>
                                <option value="admin">Administrator</option>
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                        {editingStaff ? 'Save Changes' : 'Create Account'}
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export default Staff;
