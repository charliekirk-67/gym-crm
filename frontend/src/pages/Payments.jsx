import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMembers, getPayments, createPayment, getMemberPayments } from '../services/apiService';
import Modal from '../components/Modal';

const Payments = () => {
    const navigate = useNavigate();
    const [payments, setPayments] = useState([]);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedMemberPayments, setSelectedMemberPayments] = useState(null);
    const [formData, setFormData] = useState({ memberId: '', amount: '', method: 'Cash' });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [paymentsData, membersData] = await Promise.all([
                getPayments(),
                getMembers()
            ]);
            setPayments(paymentsData);
            setMembers(membersData.members || []);
        } catch (error) {
            console.error('Error fetching payments:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddPayment = async (e) => {
        e.preventDefault();
        try {
            await createPayment({
                memberId: formData.memberId,
                amount: Number(formData.amount),
                method: formData.method,
                paymentMethod: formData.method
            });
            fetchData();
            setIsModalOpen(false);
            setFormData({ memberId: '', amount: '', method: 'Cash' });
        } catch (error) {
            alert(error.response?.data?.message || 'Error recording payment');
        }
    };

    const viewHistory = async (memberId) => {
        try {
            const history = await getMemberPayments(memberId);
            const member = members.find(m => m._id === memberId);
            setSelectedMemberPayments({ memberName: member.name, history });
        } catch {
            alert('Error fetching payment history');
        }
    };

    if (loading) return <div className="spinner"></div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2>Payments Management</h2>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button onClick={() => navigate('/reports')} className="btn btn-secondary" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary-color)' }}>
                        📊 Export
                    </button>
                    <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>+ Record Payment</button>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <table>
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Amount (₹)</th>
                            <th>Method</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...payments].reverse().map(payment => (
                            <tr key={payment._id}>
                                <td>{payment.memberId?.name || 'Deleted Member'}</td>
                                <td style={{ fontWeight: '700' }}>{payment.amount}</td>
                                <td>{payment.method}</td>
                                <td>{new Date(payment.date).toLocaleDateString()}</td>
                                <td>
                                    <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', border: '1px solid var(--border-color)' }} onClick={() => viewHistory(payment.memberId?._id)}>History</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record New Payment">
                <form onSubmit={handleAddPayment}>
                    <div className="input-group">
                        <label>Select Member</label>
                        <select
                            className="input"
                            value={formData.memberId}
                            onChange={(e) => {
                                const sel = members.find(m => m._id === e.target.value);
                                const planPrice = Number(sel?.planPrice || sel?.planId?.price || 0);
                                const paid = Number(sel?.paidAmount || 0);
                                const due = Math.max(0, planPrice - paid);
                                setFormData({
                                    ...formData,
                                    memberId: e.target.value,
                                    amount: due > 0 ? due : ''
                                });
                            }}
                            required
                        >
                            <option value="">Select a member</option>
                            {members.map(m => {
                                const price = Number(m.planPrice || m.planId?.price || 0);
                                const paid = Number(m.paidAmount || 0);
                                const due = Math.max(0, price - paid);
                                return (
                                    <option key={m._id} value={m._id}>
                                        {m.name} ({m.phone}) {due > 0 ? `— ₹${due} Due` : '— Settled'}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {formData.memberId && (() => {
                        const sel = members.find(m => m._id === formData.memberId);
                        if (!sel) return null;
                        const planPrice = Number(sel.planPrice || sel.planId?.price || 0);
                        const paid = Number(sel.paidAmount || 0);
                        const due = Math.max(0, planPrice - paid);
                        return (
                            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '0.85rem', marginBottom: '1rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', fontSize: '0.82rem' }}>
                                    <div>
                                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Active Plan</span>
                                        <strong style={{ color: '#fff' }}>{sel.planId?.name || 'Custom'}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Agreed Fee</span>
                                        <strong style={{ color: 'var(--primary, #f59e0b)' }}>₹{planPrice}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Paid So Far</span>
                                        <strong style={{ color: '#10b981' }}>₹{paid}</strong>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>Outstanding Due</span>
                                        <strong style={{ color: due > 0 ? '#ef4444' : '#10b981' }}>{due > 0 ? `₹${due} Due` : '₹0 Settled'}</strong>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="input-group">
                        <label>Amount to Collect (₹)</label>
                        <input className="input" type="number" min="1" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} required />
                    </div>
                    <div className="input-group">
                        <label>Payment Method</label>
                        <select className="input" value={formData.method} onChange={(e) => setFormData({ ...formData, method: e.target.value })} required>
                            <option value="Cash">Cash</option>
                            <option value="UPI">UPI</option>
                            <option value="Card">Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>Submit Payment</button>
                </form>
            </Modal>

            <Modal isOpen={!!selectedMemberPayments} onClose={() => setSelectedMemberPayments(null)} title={`Payment History - ${selectedMemberPayments?.memberName}`}>
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {selectedMemberPayments?.history.length > 0 ? (
                        <table style={{ boxShadow: 'none' }}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Amount</th>
                                    <th>Method</th>
                                </tr>
                            </thead>
                            <tbody>
                                {selectedMemberPayments.history.map(p => (
                                    <tr key={p._id}>
                                        <td>{new Date(p.date).toLocaleDateString()}</td>
                                        <td>₹{p.amount}</td>
                                        <td>{p.method}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p>No payments records found.</p>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default Payments;
