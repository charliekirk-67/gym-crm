import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import {
    getBodyAssessments,
    createBodyAssessment,
    updateBodyAssessment,
    deleteBodyAssessment,
    getMembers
} from '../services/apiService';
import Modal from '../components/Modal';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend
} from 'recharts';
import { Pencil, Trash2, TrendingUp, ShieldAlert, Award, Activity, Scale, Percent } from 'lucide-react';

const BodyAssessments = () => {
    const { user } = useContext(AuthContext);
    const isStaff = ['admin', 'trainer', 'superadmin', 'h4_admin', 'fitpass_admin'].includes(user?.role);

    const [members, setMembers] = useState([]);
    const [selectedMemberId, setSelectedMemberId] = useState('');
    const [assessments, setAssessments] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAssessment, setEditingAssessment] = useState(null);
    const [formData, setFormData] = useState({
        weight: '',
        bmi: '',
        bodyFat: '',
        muscleMass: '',
        bmr: '',
        inBodyScore: '',
        assessmentDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (isStaff) {
            fetchMembers();
        } else if (user?.memberId) {
            setSelectedMemberId(user.memberId);
        }
    }, [user, isStaff]);

    useEffect(() => {
        if (selectedMemberId) {
            fetchAssessments(selectedMemberId);
        } else {
            setAssessments([]);
            setLoading(false);
        }
    }, [selectedMemberId]);

    const fetchMembers = async () => {
        try {
            // Fetch first page/all members
            const res = await getMembers('', 1, '');
            const memberList = Array.isArray(res) ? res : (res?.members || res?.data || []);
            setMembers(memberList);
        } catch (error) {
            console.error('Error fetching members:', error);
            setMembers([]);
        }
    };

    const fetchAssessments = async (memberId) => {
        setLoading(true);
        try {
            const data = await getBodyAssessments(memberId);
            const list = Array.isArray(data) ? data : (data?.data || []);
            // Sort assessments chronologically for charts (date ascending)
            const sorted = [...list].sort((a, b) => new Date(a.assessmentDate) - new Date(b.assessmentDate));
            setAssessments(sorted);
        } catch (error) {
            console.error('Error fetching assessments:', error);
            setAssessments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (assessment = null) => {
        if (assessment) {
            setEditingAssessment(assessment);
            setFormData({
                weight: assessment.weight,
                bmi: assessment.bmi,
                bodyFat: assessment.bodyFat,
                muscleMass: assessment.muscleMass,
                bmr: assessment.bmr,
                inBodyScore: assessment.inBodyScore || '',
                assessmentDate: assessment.assessmentDate.split('T')[0]
            });
        } else {
            setEditingAssessment(null);
            setFormData({
                weight: '',
                bmi: '',
                bodyFat: '',
                muscleMass: '',
                bmr: '',
                inBodyScore: '',
                assessmentDate: new Date().toISOString().split('T')[0]
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedMemberId) {
            alert('Please select a member first');
            return;
        }

        try {
            const submissionData = {
                memberId: selectedMemberId,
                ...formData,
                inBodyScore: formData.inBodyScore ? Number(formData.inBodyScore) : null
            };

            if (editingAssessment) {
                await updateBodyAssessment(editingAssessment._id, submissionData);
            } else {
                await createBodyAssessment(submissionData);
            }
            fetchAssessments(selectedMemberId);
            setIsModalOpen(false);
        } catch (error) {
            alert(error.response?.data?.message || 'Error saving assessment');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this assessment record?')) {
            try {
                await deleteBodyAssessment(id);
                fetchAssessments(selectedMemberId);
            } catch {
                alert('Error deleting assessment');
            }
        }
    };

    const safeAssessments = Array.isArray(assessments) ? assessments : [];
    const safeMembers = Array.isArray(members) ? members : [];

    // Calculate charts data
    const chartData = safeAssessments.map(a => ({
        date: new Date(a.assessmentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        Weight: a.weight,
        BMI: a.bmi,
        'Body Fat %': a.bodyFat,
        'Muscle Mass': a.muscleMass,
        BMR: a.bmr,
        Score: a.inBodyScore || 0
    }));

    // Get latest assessment for quick metrics
    const latest = safeAssessments[safeAssessments.length - 1];

    // Helper to evaluate BMI status
    const getBmiStatus = (bmi) => {
        if (bmi < 18.5) return { label: 'Underweight', color: '#38bdf8' };
        if (bmi < 25) return { label: 'Normal', color: '#10b981' };
        if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
        return { label: 'Obese', color: '#ef4444' };
    };

    // Helper to evaluate Body Fat status
    const getFatStatus = (fat) => {
        if (fat < 10) return { label: 'Low', color: '#38bdf8' };
        if (fat < 20) return { label: 'Optimal', color: '#10b981' };
        if (fat < 25) return { label: 'Slightly Over', color: '#f59e0b' };
        return { label: 'High', color: '#ef4444' };
    };

    return (
        <div className="fade-in">
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontWeight: '800', marginBottom: '0.25rem' }}>🏋️‍♂️ Fitness & InBody Assessment</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Track body composition history and fitness trends</p>
                </div>
                {isStaff && selectedMemberId && (
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                        + Record Assessment
                    </button>
                )}
            </div>

            {/* Member Selection for Staff */}
            {isStaff && (
                <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                    <label style={{ display: 'block', fontWeight: '700', marginBottom: '0.5rem', fontSize: '0.9rem' }}>Select Member to View/Record InBody History:</label>
                    <select
                        className="input"
                        value={selectedMemberId}
                        onChange={(e) => setSelectedMemberId(e.target.value)}
                        style={{ maxWidth: '400px' }}
                    >
                        <option value="">-- Choose a Member --</option>
                        {safeMembers.map(m => (
                            <option key={m._id} value={m._id}>
                                {m.name} ({m.phone})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {!selectedMemberId ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                    <ShieldAlert size={48} style={{ margin: '0 auto 1rem', color: 'var(--primary-color)' }} />
                    <h3>No Member Selected</h3>
                    <p>Please select a gym member from the dropdown above to view their fitness logs.</p>
                </div>
            ) : loading ? (
                <div className="spinner"></div>
            ) : (
                <div>
                    {/* Latest InBody Overview Card */}
                    {latest ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                            <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '0.75rem', borderRadius: '12px' }}>
                                    <Scale size={24} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>WEIGHT</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{latest.weight} kg</div>
                                </div>
                            </div>
                            
                            <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', padding: '0.75rem', borderRadius: '12px' }}>
                                    <Activity size={24} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>BMI</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{latest.bmi}</div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: getBmiStatus(latest.bmi).color }}>
                                        {getBmiStatus(latest.bmi).label}
                                    </span>
                                </div>
                            </div>

                            <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '0.75rem', borderRadius: '12px' }}>
                                    <Percent size={24} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>BODY FAT %</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{latest.bodyFat}%</div>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: getFatStatus(latest.bodyFat).color }}>
                                        {getFatStatus(latest.bodyFat).label}
                                    </span>
                                </div>
                            </div>

                            <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', padding: '0.75rem', borderRadius: '12px' }}>
                                    <TrendingUp size={24} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>MUSCLE MASS (SMM)</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{latest.muscleMass} kg</div>
                                </div>
                            </div>

                            <div className="card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '0.75rem', borderRadius: '12px' }}>
                                    <Award size={24} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: '600' }}>INBODY SCORE</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{latest.inBodyScore || 'N/A'} / 100</div>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {safeAssessments.length === 0 ? (
                        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                            <Activity size={48} style={{ margin: '0 auto 1rem', color: 'var(--primary-color)', opacity: 0.5 }} />
                            <h3>No assessments logged yet</h3>
                            <p>There are no historical InBody assessments recorded for this member.</p>
                        </div>
                    ) : (
                        <div>
                            {/* Charts Visualization Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                {/* Weight & Muscle Mass Trend */}
                                <div className="card">
                                    <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '700' }}>📈 Weight & Muscle Mass Trend (kg)</h3>
                                    <div style={{ width: '100%', height: 260 }}>
                                        <ResponsiveContainer width="100%" height={260}>
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.07)" />
                                                <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                                                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} domain={['dataMin - 5', 'dataMax + 5']} />
                                                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }} />
                                                <Legend />
                                                <Line type="monotone" dataKey="Weight" stroke="var(--primary-color)" strokeWidth={3} activeDot={{ r: 8 }} />
                                                <Line type="monotone" dataKey="Muscle Mass" stroke="#8b5cf6" strokeWidth={3} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Body Fat & BMI Trend */}
                                <div className="card">
                                    <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: '700' }}>🔥 Body Fat % & BMI Trend</h3>
                                    <div style={{ width: '100%', height: 260 }}>
                                        <ResponsiveContainer width="100%" height={260}>
                                            <LineChart data={chartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.07)" />
                                                <XAxis dataKey="date" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                                                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} domain={['dataMin - 2', 'dataMax + 2']} />
                                                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px' }} />
                                                <Legend />
                                                <Line type="monotone" dataKey="Body Fat %" stroke="#f59e0b" strokeWidth={3} />
                                                <Line type="monotone" dataKey="BMI" stroke="#0ea5e9" strokeWidth={3} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* History Table */}
                            <div className="card">
                                <h3 style={{ marginBottom: '1.25rem', fontSize: '1rem', fontWeight: '700' }}>📜 Historical Assessment Records</h3>
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Weight (kg)</th>
                                                <th>BMI</th>
                                                <th>Body Fat %</th>
                                                <th>Muscle Mass (kg)</th>
                                                <th>BMR (kcal)</th>
                                                <th>InBody Score</th>
                                                {isStaff && <th>Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...safeAssessments].reverse().map(item => (
                                                <tr key={item._id}>
                                                    <td style={{ fontWeight: '600' }}>
                                                        {new Date(item.assessmentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                    </td>
                                                    <td>{item.weight} kg</td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                            {item.bmi}
                                                            <span style={{
                                                                width: '8px', height: '8px', borderRadius: '50%',
                                                                background: getBmiStatus(item.bmi).color
                                                            }} title={getBmiStatus(item.bmi).label} />
                                                        </div>
                                                    </td>
                                                    <td>{item.bodyFat}%</td>
                                                    <td>{item.muscleMass} kg</td>
                                                    <td>{item.bmr} kcal</td>
                                                    <td>{item.inBodyScore || '—'}</td>
                                                    {isStaff && (
                                                        <td>
                                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                                <button
                                                                    className="btn"
                                                                    style={{ padding: '0.4rem', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                                                                    onClick={() => handleOpenModal(item)}
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                                <button
                                                                    className="btn btn-danger"
                                                                    style={{ padding: '0.4rem' }}
                                                                    onClick={() => handleDelete(item._id)}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Assessment Input Modal */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingAssessment ? 'Edit Body Assessment Record' : 'Record InBody Assessment'}>
                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label>Weight (kg) *</label>
                            <input
                                className="input"
                                type="number"
                                step="0.1"
                                value={formData.weight}
                                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>BMI *</label>
                            <input
                                className="input"
                                type="number"
                                step="0.1"
                                value={formData.bmi}
                                onChange={(e) => setFormData({ ...formData, bmi: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label>Percent Body Fat (PBF %) *</label>
                            <input
                                className="input"
                                type="number"
                                step="0.1"
                                value={formData.bodyFat}
                                onChange={(e) => setFormData({ ...formData, bodyFat: e.target.value })}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>Muscle Mass (SMM kg) *</label>
                            <input
                                className="input"
                                type="number"
                                step="0.1"
                                value={formData.muscleMass}
                                onChange={(e) => setFormData({ ...formData, muscleMass: e.target.value })}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="input-group">
                            <label>BMR (kcal) *</label>
                            <input
                                className="input"
                                type="number"
                                value={formData.bmr}
                                onChange={(e) => setFormData({ ...formData, bmr: e.target.value })}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label>InBody Score (out of 100)</label>
                            <input
                                className="input"
                                type="number"
                                value={formData.inBodyScore}
                                onChange={(e) => setFormData({ ...formData, inBodyScore: e.target.value })}
                                placeholder="e.g. 75"
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>Assessment Date *</label>
                        <input
                            className="input"
                            type="date"
                            value={formData.assessmentDate}
                            onChange={(e) => setFormData({ ...formData, assessmentDate: e.target.value })}
                            required
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }}>
                        {editingAssessment ? 'Update Record' : 'Record Assessment'}
                    </button>
                </form>
            </Modal>
        </div>
    );
};

export default BodyAssessments;
