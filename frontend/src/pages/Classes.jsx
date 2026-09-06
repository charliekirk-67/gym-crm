import { useState, useEffect, useContext } from 'react';
import API from '../services/api';
import Modal from '../components/Modal';
import QRScanner from '../components/QRScanner';
import { AuthContext } from '../context/AuthContext';
import { Trash2, MapPin, Users, CheckCircle2, Clock, Calendar, Check, X } from 'lucide-react';

const CLASS_TYPES = ['Yoga', 'Zumba', 'Strength', 'Cardio', 'HIIT', 'Pilates', 'CrossFit', 'Boxing', 'Dance', 'Stretching'];

const Classes = () => {
    const { user } = useContext(AuthContext);
    const [classes, setClasses] = useState([]);
    const [branches, setBranches] = useState([]);
    const [members, setMembers] = useState([]);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [bookingsModal, setBookingsModal] = useState(null);
    const [isClassScannerOpen, setIsClassScannerOpen] = useState(false);
    const [scannerMessage, setScannerMessage] = useState({ text: '', type: '' });

    const [formData, setFormData] = useState({
        name: '', 
        type: 'Yoga', 
        description: '', 
        trainerName: '',
        scheduleDate: '', 
        startTime: '', 
        endTime: '', 
        maxSeats: 10, 
        bookingDeadline: '',
        branchIds: []
    });

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const fetchClasses = async () => {
        try {
            const { data } = await API.get('/classes');
            setClasses(data);
        } catch (err) {
            console.error('Error fetching classes:', err);
        } finally { setLoading(false); }
    };

    const fetchBranches = async () => {
        try {
            const { data } = await API.get('/branches');
            const branchList = Array.isArray(data) ? data : data.branches || [];
            setBranches(branchList);
        } catch (err) {
            console.warn('Could not fetch branches directly:', err);
        }
    };

    const fetchMembers = async () => {
        try {
            const { data } = await API.get('/members?limit=1000&status=Active');
            setMembers(data.members || []);
        } catch (err) {
            console.error('Error fetching members:', err);
        }
    };

    useEffect(() => {
        fetchClasses();
        fetchBranches();
    }, []);

    const handleBranchToggle = (branchId) => {
        setFormData(prev => {
            const exists = prev.branchIds.includes(branchId);
            const updated = exists 
                ? prev.branchIds.filter(id => id !== branchId)
                : [...prev.branchIds, branchId];
            return { ...prev, branchIds: updated };
        });
    };

    const handleSelectAllBranches = () => {
        if (formData.branchIds.length === branches.length) {
            setFormData(prev => ({ ...prev, branchIds: [] }));
        } else {
            setFormData(prev => ({ ...prev, branchIds: branches.map(b => b.id || b._id) }));
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        try {
            const payload = {
                ...formData,
                branchIds: formData.branchIds.length > 0 ? formData.branchIds : (user?.branchId ? [user.branchId] : [])
            };
            await API.post('/classes', payload);
            setIsModalOpen(false);
            setFormData({ 
                name: '', type: 'Yoga', description: '', trainerName: '', 
                scheduleDate: '', startTime: '', endTime: '', maxSeats: 10, 
                bookingDeadline: '', branchIds: [] 
            });
            fetchClasses();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to create class');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this class?')) return;
        try {
            await API.delete(`/classes/${id}`);
            fetchClasses();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete');
        }
    };

    const viewBookings = async (gymClass) => {
        try {
            const { data } = await API.get(`/classes/${gymClass._id}/bookings`);
            setBookingsModal(data);
            fetchMembers();
        } catch {
            alert('Failed to fetch bookings');
        }
    };

    const handleAdminBook = async (e) => {
        e.preventDefault();
        if (!selectedMemberId) return;
        try {
            await API.post(`/classes/${bookingsModal._id}/book`, { memberId: selectedMemberId });
            const { data } = await API.get(`/classes/${bookingsModal._id}/bookings`);
            setBookingsModal(data);
            setSelectedMemberId('');
            fetchClasses();
            alert('Member booked successfully!');
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to book member');
        }
    };

    const handleAdminCancel = async (memberId) => {
        if (!window.confirm('Remove this member from the class?')) return;
        try {
            await API.delete(`/classes/${bookingsModal._id}/bookings/${memberId}`);
            const { data } = await API.get(`/classes/${bookingsModal._id}/bookings`);
            setBookingsModal(data);
            fetchClasses();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to cancel booking');
        }
    };

    const handleToggleAttendance = async (memberId, currentStatus) => {
        const nextStatus = currentStatus === 'Attended' ? 'Reserved' : 'Attended';
        try {
            await API.put(`/classes/${bookingsModal._id}/attendees/${memberId}`, { status: nextStatus });
            const { data } = await API.get(`/classes/${bookingsModal._id}/bookings`);
            setBookingsModal(data);
            fetchClasses();
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to update attendance');
        }
    };

    // Camera Scan Verification for Class Attendees
    const handleClassScanSuccess = async (decodedText) => {
        try {
            const { data } = await API.post(`/classes/${bookingsModal._id}/verify-attendee`, {
                tokenOrPass: decodedText,
                memberId: decodedText
            });
            setScannerMessage({ text: `✅ Verified: ${data.member?.name || 'Member'} marked Attended!`, type: 'success' });
            const updated = await API.get(`/classes/${bookingsModal._id}/bookings`);
            setBookingsModal(updated.data);
            fetchClasses();
        } catch (err) {
            setScannerMessage({ text: err.response?.data?.message || 'Failed to verify member pass', type: 'error' });
        }
        setTimeout(() => setScannerMessage({ text: '', type: '' }), 4000);
    };

    const typeColors = {
        Yoga: '#10b981', Zumba: '#f59e0b', Strength: '#6366f1', Cardio: '#ef4444',
        HIIT: '#f43f5e', Pilates: '#8b5cf6', CrossFit: '#0ea5e9', Boxing: '#d946ef',
        Dance: '#ec4899', Stretching: '#14b8a6'
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>📅 Studio Class Scheduling</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{classes.length} class session(s) scheduled across branches</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setIsModalOpen(true); setError(''); }}>
                    + Schedule New Class
                </button>
            </div>

            {/* Classes Grid */}
            {classes.length === 0 ? (
                <div className="card empty-state" style={{ textAlign: 'center', padding: '4rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📅</div>
                    <h3>No Classes Scheduled</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Click "+ Schedule New Class" to create branch-specific workouts.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {classes.map(gymClass => {
                        const color = typeColors[gymClass.type] || '#6366f1';
                        const bookedCount = gymClass.maxSeats - gymClass.seatsAvailable;
                        const isFull = gymClass.seatsAvailable <= 0;

                        return (
                            <div key={gymClass._id} className="card glass" style={{
                                position: 'relative',
                                borderLeft: `6px solid ${color}`,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '1rem'
                            }}>
                                <div>
                                    {/* Header Row: Type + Branch Tag */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                        <span style={{
                                            background: `${color}22`,
                                            color,
                                            padding: '0.2rem 0.65rem',
                                            borderRadius: '999px',
                                            fontSize: '0.75rem',
                                            fontWeight: '800',
                                            textTransform: 'uppercase'
                                        }}>
                                            {gymClass.type}
                                        </span>

                                        <span style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: '700',
                                            background: 'rgba(240, 160, 32, 0.12)',
                                            color: '#F0A020',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(240, 160, 32, 0.25)'
                                        }}>
                                            <MapPin size={12} />
                                            {gymClass.branchName || 'Main Studio'}
                                        </span>
                                    </div>

                                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: '800' }}>{gymClass.name}</h3>
                                    
                                    {gymClass.description && (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', fontStyle: 'italic' }}>
                                            {gymClass.description}
                                        </p>
                                    )}

                                    {/* Meta Items */}
                                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Calendar size={13} color="var(--primary-color)" />
                                            <span>{new Date(gymClass.scheduleDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Clock size={13} color="var(--primary-color)" />
                                            <span>{gymClass.startTime} – {gymClass.endTime}</span>
                                        </div>
                                        {gymClass.trainerName && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Users size={13} color="var(--primary-color)" />
                                                <span>Coach: {gymClass.trainerName}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Seats & Attendance Progress */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>Capacity & Attendance</span>
                                        <span style={{ fontWeight: '700', color: isFull ? 'var(--danger-color)' : 'var(--text-primary)' }}>
                                            {bookedCount}/{gymClass.maxSeats} Booked ({gymClass.attendedCount || 0} Attended)
                                        </span>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${(bookedCount / gymClass.maxSeats) * 100}%`,
                                            height: '100%',
                                            background: isFull ? 'var(--danger-color)' : color,
                                            borderRadius: '999px',
                                            transition: 'width 0.3s'
                                        }} />
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                        <button 
                                            className="btn btn-secondary" 
                                            style={{ flex: 1, fontSize: '0.8rem', padding: '0.45rem' }}
                                            onClick={() => viewBookings(gymClass)}
                                        >
                                            👥 View Roster ({bookedCount})
                                        </button>
                                        <button 
                                            className="btn" 
                                            style={{ padding: '0.45rem 0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                            onClick={() => handleDelete(gymClass._id)}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create Class Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="📅 Schedule Studio Class">
                <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {error && <div className="alert alert-danger">{error}</div>}

                    <div className="form-grid">
                        <div className="input-group">
                            <label>Class Name *</label>
                            <input className="input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Morning Power Yoga" required />
                        </div>
                        <div className="input-group">
                            <label>Category *</label>
                            <select className="input" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                {CLASS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Branch Assignment Section (Multi-Branch Checkboxes) */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
                                📍 Assign to Branches (Multi-Select)
                            </label>
                            {branches.length > 1 && (
                                <button 
                                    type="button" 
                                    onClick={handleSelectAllBranches} 
                                    style={{ background: 'none', border: 'none', color: '#F0A020', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                                >
                                    {formData.branchIds.length === branches.length ? 'Clear All' : 'Select All'}
                                </button>
                            )}
                        </div>

                        {branches.length === 0 ? (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>All Branches / General Studio</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                                {branches.map(b => {
                                    const bId = b.id || b._id;
                                    const isChecked = formData.branchIds.includes(bId);
                                    return (
                                        <label 
                                            key={bId}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                fontSize: '0.8rem',
                                                padding: '0.4rem 0.6rem',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                background: isChecked ? 'rgba(240, 160, 32, 0.15)' : 'rgba(255,255,255,0.02)',
                                                border: isChecked ? '1px solid #F0A020' : '1px solid var(--border-color)',
                                                color: isChecked ? '#FFFFFF' : 'var(--text-secondary)'
                                            }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={isChecked} 
                                                onChange={() => handleBranchToggle(bId)}
                                                style={{ accentColor: '#F0A020' }}
                                            />
                                            <span style={{ fontWeight: isChecked ? 700 : 500 }}>{b.name}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                            Selecting multiple branches creates a dedicated studio session for each branch studio.
                        </small>
                    </div>

                    <div className="form-grid">
                        <div className="input-group">
                            <label>Trainer / Coach Name</label>
                            <input className="input" value={formData.trainerName} onChange={e => setFormData({ ...formData, trainerName: e.target.value })} placeholder="e.g. Arjun Sharma" />
                        </div>
                        <div className="input-group">
                            <label>Studio Seat Capacity *</label>
                            <input className="input" type="number" min="1" value={formData.maxSeats} onChange={e => setFormData({ ...formData, maxSeats: e.target.value })} required />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Date *</label>
                        <input className="input" type="date" value={formData.scheduleDate} onChange={e => setFormData({ ...formData, scheduleDate: e.target.value })} required />
                    </div>

                    <div className="form-grid">
                        <div className="input-group">
                            <label>Start Time *</label>
                            <input className="input" type="time" value={formData.startTime} onChange={e => setFormData({ ...formData, startTime: e.target.value })} required />
                        </div>
                        <div className="input-group">
                            <label>End Time *</label>
                            <input className="input" type="time" value={formData.endTime} onChange={e => setFormData({ ...formData, endTime: e.target.value })} required />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Booking Deadline</label>
                        <input className="input" type="datetime-local" value={formData.bookingDeadline} onChange={e => setFormData({ ...formData, bookingDeadline: e.target.value })} />
                        <small style={{ color: 'var(--text-secondary)' }}>Optional. Online booking closes after this time.</small>
                    </div>

                    <div className="input-group">
                        <label>Description</label>
                        <textarea className="input" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} placeholder="Optional workout details..." />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={submitting}>
                        {submitting ? 'Scheduling...' : '📅 Schedule Studio Class'}
                    </button>
                </form>
            </Modal>

            {/* Bookings & Attendee Roster Modal */}
            <Modal 
                isOpen={!!bookingsModal} 
                onClose={() => { setBookingsModal(null); setSelectedMemberId(''); setIsClassScannerOpen(false); }} 
                title={`👥 Class Roster & Attendance — ${bookingsModal?.name}`}
            >
                {/* Scanner & Manual Action Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                            {bookingsModal?.bookings?.filter(b => b.status === 'Attended').length || 0} Attended / {bookingsModal?.bookings?.length || 0} Reserved
                        </span>
                    </div>

                    <button 
                        className={`btn ${isClassScannerOpen ? 'btn-danger' : 'btn-primary'}`}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                        onClick={() => setIsClassScannerOpen(!isClassScannerOpen)}
                    >
                        {isClassScannerOpen ? 'Stop Camera' : '📱 Scan Member Pass QR'}
                    </button>
                </div>

                {scannerMessage.text && (
                    <div className={`alert alert-${scannerMessage.type}`} style={{ marginBottom: '1rem', textAlign: 'center' }}>
                        {scannerMessage.text}
                    </div>
                )}

                {/* Class QR Scanner Box */}
                {isClassScannerOpen && (
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                            Point camera at member's live dynamic pass QR code.
                        </p>
                        <QRScanner onScanSuccess={handleClassScanSuccess} onScanError={() => {}} />
                    </div>
                )}

                {/* Add Member Form */}
                <form onSubmit={handleAdminBook} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
                    <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: '700' }}>Add Member to Roster</label>
                        <select 
                            className="input" 
                            value={selectedMemberId} 
                            onChange={e => setSelectedMemberId(e.target.value)}
                            required
                        >
                            <option value="">-- Select Member --</option>
                            {members
                                .filter(m => !bookingsModal?.bookings?.some(b => (b.memberId?._id || b.memberId)?.toString() === m._id?.toString()))
                                .map(m => (
                                    <option key={m._id} value={m._id}>{m.name} ({m.phone})</option>
                                ))
                            }
                        </select>
                    </div>
                    <button type="submit" className="btn btn-secondary" style={{ height: '42px', padding: '0 1.25rem' }}>
                        Add Member
                    </button>
                </form>

                {/* Bookings List Table with Attended Toggle */}
                {bookingsModal?.bookings?.length > 0 ? (
                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Member</th>
                                <th>Contact</th>
                                <th>Attendance Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookingsModal.bookings.map((b) => {
                                const mId = b.memberId?._id || b.memberId;
                                const isAttended = b.status === 'Attended' || b.attended === true;

                                return (
                                    <tr key={mId}>
                                        <td style={{ fontWeight: '700' }}>{b.name || b.memberName || 'Member'}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{b.phone || b.email || '—'}</td>
                                        <td>
                                            <button
                                                onClick={() => handleToggleAttendance(mId, b.status)}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '0.25rem 0.65rem',
                                                    borderRadius: '8px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    border: isAttended ? '1px solid #10B981' : '1px solid rgba(255,255,255,0.15)',
                                                    background: isAttended ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
                                                    color: isAttended ? '#10B981' : 'var(--text-secondary)'
                                                }}
                                            >
                                                {isAttended ? <><Check size={12} /> Attended</> : 'Mark Present'}
                                            </button>
                                        </td>
                                        <td>
                                            <button
                                                onClick={() => handleAdminCancel(mId)}
                                                style={{ 
                                                    padding: '0.25rem 0.5rem', 
                                                    background: 'rgba(239,68,68,0.1)', 
                                                    color: '#ef4444', 
                                                    border: '1px solid rgba(239,68,68,0.2)', 
                                                    borderRadius: '6px',
                                                    fontSize: '0.75rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">👥</div>
                        <h3>No Bookings Yet</h3>
                        <p>Members who book online or are added by staff will appear here.</p>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Classes;
