import { useState, useEffect, useCallback } from 'react';
import { getMembers, getTodayAttendance, getMemberAttendance } from '../services/apiService';
import API from '../services/api';
import Modal from '../components/Modal';
import QRScanner from '../components/QRScanner';
import { QRCodeCanvas } from 'qrcode.react';
import { ShieldCheck, UserCheck, QrCode, Clock, Calendar, Check, AlertCircle } from 'lucide-react';

const Attendance = () => {
    const [activeTab, setActiveTab] = useState('member_attendance'); // 'member_attendance' | 'staff_duty'
    const [members, setMembers] = useState([]);
    const [todayList, setTodayList] = useState([]);
    const [staffTodayList, setStaffTodayList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMember, setSelectedMember] = useState('');
    const [manualPin, setManualPin] = useState('');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [selectedMemberHistory, setSelectedMemberHistory] = useState(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [dutyQRModal, setDutyQRModal] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [membersData, attendanceData, staffData] = await Promise.all([
                getMembers('Active'),
                getTodayAttendance(),
                API.get('/attendance/staff-today').then(r => r.data).catch(() => [])
            ]);
            setMembers(membersData.members || []);
            setTodayList(attendanceData);
            setStaffTodayList(staffData);
        } catch (error) {
            console.error('Error fetching attendance data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAttendance = async (payload = {}) => {
        const idToMark = payload.memberId || selectedMember;
        if (!idToMark && !payload.tokenOrPass) return;

        try {
            const res = await API.post('/attendance', {
                memberId: idToMark,
                tokenOrPass: payload.tokenOrPass,
                pin: payload.pin || manualPin
            });
            setMessage({ text: res.data?.message || 'Attendance marked successfully!', type: 'success' });
            setSelectedMember('');
            setManualPin('');
            if (isScannerOpen) setIsScannerOpen(false);
            fetchData();
        } catch (error) {
            setMessage({ text: error.response?.data?.message || 'Error marking attendance', type: 'error' });
        }
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    const handleScanSuccess = useCallback((decodedText) => {
        console.log(`Scan successful: ${decodedText}`);
        handleMarkAttendance({ tokenOrPass: decodedText });
    }, []);

    const handleScanError = () => {};

    const viewHistory = async (memberId) => {
        try {
            const history = await getMemberAttendance(memberId);
            const member = members.find(m => (m._id || m.id) === memberId) || todayList.find(a => (a.memberId?._id || a.memberId) === memberId)?.memberId;
            setSelectedMemberHistory({ memberName: member?.name, history });
        } catch {
            alert('Error fetching attendance history');
        }
    };

    const handleShowBranchDutyQR = async () => {
        try {
            const { data } = await API.get('/attendance/branch-duty-qr');
            setDutyQRModal(data);
        } catch (err) {
            alert('Could not fetch duty QR: ' + (err.response?.data?.message || err.message));
        }
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ marginBottom: '0.25rem' }}>📋 Attendance Control Hub</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Manage daily physical member check-ins and staff presence
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                        className="btn btn-secondary" 
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={handleShowBranchDutyQR}
                    >
                        <QrCode size={16} /> Print Branch Duty QR
                    </button>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                <button
                    onClick={() => setActiveTab('member_attendance')}
                    style={{
                        background: activeTab === 'member_attendance' ? 'rgba(240, 160, 32, 0.15)' : 'none',
                        border: 'none',
                        borderBottom: activeTab === 'member_attendance' ? '2px solid #F0A020' : '2px solid transparent',
                        color: activeTab === 'member_attendance' ? '#F0A020' : 'var(--text-secondary)',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <UserCheck size={16} /> Member Check-In ({todayList.length})
                </button>
                <button
                    onClick={() => setActiveTab('staff_duty')}
                    style={{
                        background: activeTab === 'staff_duty' ? 'rgba(240, 160, 32, 0.15)' : 'none',
                        border: 'none',
                        borderBottom: activeTab === 'staff_duty' ? '2px solid #F0A020' : '2px solid transparent',
                        color: activeTab === 'staff_duty' ? '#F0A020' : 'var(--text-secondary)',
                        fontWeight: '700',
                        fontSize: '0.9rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <ShieldCheck size={16} /> Staff Duty Presence ({staffTodayList.length})
                </button>
            </div>

            {message.text && (
                <div style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: message.type === 'success' ? '#10B981' : '#EF4444',
                    border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    fontWeight: '700',
                    textAlign: 'center'
                }}>
                    {message.text}
                </div>
            )}

            {activeTab === 'member_attendance' ? (
                <>
                    {/* Check-In Controls */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        {/* Manual Check-in Card */}
                        <div className="card">
                            <h3 style={{ marginBottom: '0.5rem' }}>Reception Session Check-In</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                Search member by name or mobile number to record a session visit.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <select
                                    className="input"
                                    value={selectedMember}
                                    onChange={(e) => setSelectedMember(e.target.value)}
                                >
                                    <option value="">-- Select Member / Search by Phone --</option>
                                    {members.map(m => (
                                        <option key={m._id || m.id} value={m._id || m.id}>
                                            {m.name} ({m.phone}) {m.sessionsRemaining != null ? `• ${m.sessionsRemaining} sessions left` : ''}
                                        </option>
                                    ))}
                                </select>

                                <button 
                                    className="btn btn-primary" 
                                    onClick={() => handleMarkAttendance()} 
                                    disabled={!selectedMember}
                                    style={{ width: '100%', padding: '0.75rem' }}
                                >
                                    ✓ Confirm Session Check-In
                                </button>
                            </div>
                        </div>

                        {/* QR Scanner Card */}
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <h3 style={{ marginBottom: '0.5rem' }}>Member QR Scanner</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem' }}>
                                Scan member's permanent digital pass or barcode from their mobile app.
                            </p>
                            <button
                                className={`btn ${isScannerOpen ? 'btn-danger' : 'btn-primary'}`}
                                style={{ width: '100%', maxWidth: '240px' }}
                                onClick={() => setIsScannerOpen(!isScannerOpen)}
                            >
                                {isScannerOpen ? 'Stop Scanner' : '📱 Scan Member Pass'}
                            </button>
                        </div>
                    </div>

                    {isScannerOpen && (
                        <div className="card" style={{ marginBottom: '2rem', textAlign: 'center' }}>
                            <h3 style={{ marginBottom: '0.5rem' }}>Scanning Member Pass...</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                Hold member's digital card or QR code in front of the camera to check them in.
                            </p>
                            <QRScanner onScanSuccess={handleScanSuccess} onScanError={handleScanError} />
                        </div>
                    )}

                    {/* Today's Member Attendance Table */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3 style={{ margin: 0 }}>Today's Member Check-Ins</h3>
                        </div>
                        <table className="table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Phone</th>
                                    <th>Check-In Time</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {todayList.length > 0 ? todayList.map(a => (
                                    <tr key={a._id || a.id}>
                                        <td style={{ fontWeight: '700' }}>{a.memberId?.name || a.memberName || 'Member'}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{a.memberId?.phone || '—'}</td>
                                        <td style={{ fontWeight: '800', color: '#10B981' }}>{a.checkInTime}</td>
                                        <td>
                                            <button 
                                                className="btn btn-secondary" 
                                                style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }} 
                                                onClick={() => viewHistory(a.memberId?._id || a.memberId)}
                                            >
                                                History
                                            </button>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan="4">
                                            <div className="empty-state">
                                                <div className="empty-state-icon">📋</div>
                                                <h3>No Member Visits Logged Today</h3>
                                                <p>Scan arriving members or check them in manually.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                /* Staff Duty Tab */
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0 }}>Today's Staff Clock-Ins ({staffTodayList.length})</h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Staff clock in by scanning the branch's daily duty QR code
                        </span>
                    </div>

                    <table className="table" style={{ width: '100%' }}>
                        <thead>
                            <tr>
                                <th>Staff Member</th>
                                <th>Role</th>
                                <th>Contact</th>
                                <th>Clock-In Time</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staffTodayList.length > 0 ? staffTodayList.map(s => (
                                <tr key={s.id || s._id}>
                                    <td style={{ fontWeight: '700' }}>{s.staffName}</td>
                                    <td>
                                        <span style={{ textTransform: 'capitalize', fontSize: '0.8rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                            {s.staffRole}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)' }}>{s.staffEmail || s.phone || '—'}</td>
                                    <td style={{ fontWeight: '800', color: '#10B981' }}>{s.formattedTime || 'Today'}</td>
                                    <td>
                                        <span style={{ color: '#10B981', fontWeight: '700', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Check size={14} /> On Duty
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5">
                                        <div className="empty-state">
                                            <div className="empty-state-icon">🛡️</div>
                                            <h3>No Staff Clocked In Yet Today</h3>
                                            <p>Trainers and staff must scan the Branch Duty QR upon arrival.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Member Attendance History Modal */}
            <Modal isOpen={!!selectedMemberHistory} onClose={() => setSelectedMemberHistory(null)} title={`Attendance History — ${selectedMemberHistory?.memberName}`}>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {selectedMemberHistory?.history.length > 0 ? (
                        <table className="table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Check-In Time</th>
                                    <th>Branch / Gym</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedMemberHistory.history.map((h, i) => (
                                    <tr key={h._id || h.id || i}>
                                        <td>{new Date(h.date).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                        <td style={{ fontWeight: '700', color: '#10B981' }}>{h.checkInTime}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{h.gymName || 'Home Branch'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="empty-state">
                            <p>No past attendance records found for this member.</p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Branch Daily Duty QR Modal */}
            <Modal isOpen={!!dutyQRModal} onClose={() => setDutyQRModal(null)} title="🏢 Daily Branch Duty Standee QR">
                {dutyQRModal && (
                    <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                            Display this dynamic QR on the front desk tablet or print it for daily duty clock-in. Valid for {dutyQRModal.date}.
                        </p>
                        <div style={{ background: '#FFFFFF', padding: '1.5rem', borderRadius: '16px', display: 'inline-block' }}>
                            <QRCodeCanvas value={dutyQRModal.qrData} size={220} level="H" />
                        </div>
                        <div style={{ marginTop: '1.5rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', background: 'rgba(240, 160, 32, 0.15)', color: '#F0A020', padding: '0.3rem 0.8rem', borderRadius: '8px' }}>
                                Date: {dutyQRModal.date}
                            </span>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Attendance;
