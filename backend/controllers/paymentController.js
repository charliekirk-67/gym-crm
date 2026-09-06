const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Payment = require('../models/Payment');
const Member = require('../models/Member');
const { logAudit } = require('../utils/auditLogger');

// @desc    Add a new payment
// @route   POST /api/payments
// @access  Private/Admin
const addPayment = catchAsync(async (req, res, next) => {
    const { memberId, amount, method, paymentMethod, date } = req.body;
    const actualMethod = method || paymentMethod || 'Cash';

    // Tenant isolation: allow superadmin/fitpass_admin to access all gyms; enforce gymId for branch admins
    const isSuper = req.user.role === 'superadmin' || req.user.role === 'fitpass_admin';
    const memberQuery = { _id: memberId };
    if (!isSuper) {
        memberQuery.gymId = req.user.gymId;
        if (req.user.branchId) {
            memberQuery.branchId = req.user.branchId;
        }
    }
    const member = await Member.findOne(memberQuery);
    if (!member) {
        res.status(404);
        throw new Error('Member not found');
    }

    const targetGymId = member.gymId || req.user.gymId;
    const targetBranchId = req.user.branchId || member.branchId || null;

    const payment = await Payment.create({
        memberId,
        amount: Number(amount),
        method: actualMethod,
        date: date ? new Date(date) : new Date(),
        gymId: targetGymId,
        branchId: targetBranchId
    });

    if (payment) {
        // Update member's paidAmount
        member.paidAmount = (member.paidAmount || 0) + Number(amount);
        await member.save();
        await logAudit(req, 'PAYMENT_ADDED', 'Payment', payment._id,
            `Recorded ${actualMethod} payment of ${amount} from ${member.name}`, member.name);
        res.status(201).json(payment);
    } else {
        res.status(400);
        throw new Error('Invalid payment data');
    }
});

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private/Admin
const getPayments = catchAsync(async (req, res, next) => {
    try {
        const query = { ...req.tenantFilter };
        // This table only grows over a gym's lifetime and has no date filter
        // on this route — cap it as a safety net against an unbounded scan/
        // response once a gym has years of payment history.
        const payments = await Payment.find(query)
            .populate('memberId', 'name phone')
            .sort({ createdAt: -1 })
            .limit(2000)
            .lean();
        res.json(payments);
    } catch (error) { next(error); }
});

// @desc    Get payment history for a specific member
// @route   GET /api/payments/member/:memberId
// @access  Private/Admin
const getMemberPayments = catchAsync(async (req, res, next) => {
    const query = {
        memberId: req.params.memberId,
        gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId })
    };
    if (req.user.branchId) {
        query.branchId = req.user.branchId;
    }
    const payments = await Payment.find(query)
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    res.json(payments);
});

// @desc    Create Razorpay Order
// @route   POST /api/payments/razorpay/order
// @access  Private
const createRazorpayOrder = catchAsync(async (req, res, next) => {
    try {
        const { amount, currency = 'INR', memberId } = req.body;
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;

        const isRealKey = keyId && keySecret && !keyId.includes('your_') && !keySecret.includes('your_');

        if (isRealKey) {
            const Razorpay = require('razorpay');
            const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
            const order = await instance.orders.create({
                amount: Math.round(Number(amount) * 100),
                currency,
                receipt: `rcpt_${Date.now()}`
            });
            return res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency, keyId });
        }

        // Mock mode when credentials are placeholders
        const crypto = require('crypto');
        const mockOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
        res.json({
            success: true,
            orderId: mockOrderId,
            amount: Math.round(Number(amount) * 100),
            currency,
            keyId: keyId || 'rzp_test_placeholder',
            isMock: true
        });
    } catch (err) { next(err); }
});

// @desc    Verify Razorpay Payment Signature and Record Payment
// @route   POST /api/payments/razorpay/verify
// @access  Private
const verifyRazorpayPayment = catchAsync(async (req, res, next) => {
    try {
        const { memberId, amount, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        const member = await Member.findById(memberId);
        if (!member) {
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const payment = await Payment.create({
            memberId: member._id,
            amount: Number(amount),
            method: 'Razorpay / Online',
            date: new Date(),
            transactionId: razorpayPaymentId || `pay_${Date.now()}`,
            gymId: member.gymId,
            branchId: member.branchId || null
        });

        member.paidAmount = (member.paidAmount || 0) + Number(amount);
        await member.save();

        await logAudit(req, 'PAYMENT_ADDED', 'Payment', payment._id, `Recorded online Razorpay payment of ₹${amount} for ${member.name}`, member.name);

        res.json({ success: true, payment });
    } catch (err) { next(err); }
});

module.exports = {
    addPayment,
    getPayments,
    getMemberPayments,
    createRazorpayOrder,
    verifyRazorpayPayment
};

