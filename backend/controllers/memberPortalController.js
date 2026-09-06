const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../lib/logger');
const env = require('../config/env');
const prisma = require('../config/prisma');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { expireIfDue } = require('../utils/sessionHelpers');

// Helper: resolve member by memberId or email
const resolveMember = async (req) => {
  let member = null;
  if (req.user?.memberId) {
    member = await prisma.member.findUnique({ where: { id: req.user.memberId } });
  }
  if (!member && req.user?.email) {
    member = await prisma.member.findFirst({ where: { email: req.user.email } });
    if (member && req.user?._id) {
      await prisma.user.update({ where: { id: req.user._id }, data: { memberId: member.id, role: 'member' } }).catch(() => {});
    }
  }
  return member;
};

// @desc    Get logged in member profile/plan
// @route   GET /api/member-portal/plan
// @access  Private/Member
const getMyPlan = catchAsync(async (req, res, next) => {
  const member = await resolveMember(req);
  if (!member) {
    return res.status(404).json({ message: 'Member profile not found' });
  }

  await expireIfDue(member);

  let plan = null;
  if (member.planId) {
    plan = await prisma.plan.findUnique({ where: { id: member.planId } }).catch(() => null);
  }

  res.json({
    ...member,
    planId: plan || member.planId,
  });
});

// @desc    Get Fit-Prime (Global) Plans
// @route   GET /api/member-portal/fitprime-plans
// @access  Private/Member
const getFitPrimePlans = catchAsync(async (req, res, next) => {
  const plans = await prisma.plan.findMany({
    where: { gymId: 'SYSTEM' },
    orderBy: { price: 'asc' },
  });
  res.json(plans);
});

// @desc    Get all active partner gyms
// @route   GET /api/member-portal/gyms
// @access  Private/Member
const getPartnerGyms = catchAsync(async (req, res, next) => {
    const allGyms = await prisma.gym.findMany({
        where: {
            status: 'Active',
            NOT: { name: 'SYSTEM' }
        }
    });
    // Exclude H4 gyms from the direct partner gyms list
    const gyms = allGyms.filter(g => !g.name || !g.name.toLowerCase().includes('h4'));
    
    try {
        // Fetch active sessions count for gyms and branches
        const activeSessionsGroupBy = await prisma.sessionCheckIn.groupBy({
            by: ['gymId', 'branchId'],
            _count: { id: true },
            where: { status: 'active', expiresAt: { gt: new Date() } }
        });
        
        const occupancyMap = {};
        activeSessionsGroupBy.forEach(item => {
            const key = item.branchId || item.gymId;
            occupancyMap[key] = (occupancyMap[key] || 0) + item._count.id;
        });

        const gymsWithOccupancy = gyms.map(gym => ({
            ...gym,
            _id: gym.id,
            activeSessions: occupancyMap[gym.id] || 0
        }));

        // Fetch H4 branches that have fitPassEnabled: true
        const fitPassBranches = await prisma.branch.findMany({
            where: { fitPassEnabled: true }
        });

        const branchGyms = fitPassBranches.map(branch => {
            const parentGym = allGyms.find(g => g.id === branch.gymId);
            const parentName = parentGym ? parentGym.name : 'H4';
            return {
                _id: branch.id,
                id: branch.id,
                name: `${branch.name} (${parentName})`,
                isBranch: true,
                branchId: branch.id,
                gymId: branch.gymId,
                address: branch.address || '',
                phone: branch.phone || '',
                email: branch.email || '',
                status: branch.isActive ? 'Active' : 'Inactive',
                latitude: branch.latitude,
                longitude: branch.longitude,
                activeSessions: occupancyMap[branch.id] || 0
            };
        });

        res.json([...gymsWithOccupancy, ...branchGyms]);
    } catch (err) {
        logger.error({ err }, 'Error fetching partner gyms occupancy');
        res.json(gyms.map(g => ({ ...g, _id: g.id })));
    }
});

// @desc    Get single partner gym details by ID
// @route   GET /api/member-portal/gyms/:id
// @access  Private/Member
const getPartnerGymById = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const prisma = require('../config/prisma');

    let gym = await prisma.gym.findUnique({
        where: { id },
        include: { settings: true }
    });

    if (!gym) {
        // Check if branch
        const branch = await prisma.branch.findUnique({ where: { id } });
        if (branch) {
            const parentGym = await prisma.gym.findUnique({ where: { id: branch.gymId }, include: { settings: true } });
            gym = {
                id: branch.id,
                name: branch.name,
                address: branch.address || parentGym?.address || '',
                phone: branch.phone || parentGym?.phone || '',
                email: branch.email || parentGym?.email || '',
                status: branch.isActive ? 'Active' : 'Inactive',
                images: parentGym?.images || [],
                latitude: branch.latitude,
                longitude: branch.longitude,
                defaultSessionDurationMinutes: parentGym?.defaultSessionDurationMinutes || 120,
                settings: parentGym?.settings || null,
                isBranch: true,
                parentGymName: parentGym?.name || ''
            };
        }
    }

    if (!gym) {
        return res.status(404).json({ message: 'Partner gym not found' });
    }

    const activeSessionsCount = await prisma.sessionCheckIn.count({
        where: { gymId: id, status: 'active', expiresAt: { gt: new Date() } }
    });

    res.json({
        ...gym,
        activeSessions: activeSessionsCount
    });
});

// @desc    Get logged in member attendance
// @route   GET /api/member-portal/attendance
// @access  Private/Member
const getMyAttendance = catchAsync(async (req, res, next) => {
    const member = await resolveMember(req);
    if (!member) {
        return res.json([]);
    }

    const memberId = member.id;

    const [traditionalAttendance, sessions, auditLogs, gyms, branches] = await Promise.all([
        prisma.attendance.findMany({
            where: { memberId },
            orderBy: { date: 'desc' },
            take: 100,
        }).catch(() => []),
        prisma.sessionCheckIn.findMany({
            where: { memberId },
            orderBy: { startedAt: 'desc' },
            take: 50,
        }).catch(() => []),
        prisma.fitPassAuditLog.findMany({
            where: { memberId, accessStatus: 'Success' },
            orderBy: { checkInTimestamp: 'desc' },
            take: 50,
        }).catch(() => []),
        prisma.gym.findMany({}).catch(() => []),
        prisma.branch.findMany({}).catch(() => []),
    ]);

    const gymMap = new Map();
    gyms.forEach((g) => {
        gymMap.set(g.id, g.name);
    });

    const branchMap = new Map();
    branches.forEach((b) => {
        branchMap.set(b.id, b.name);
    });

    const memberGymName = (member.gymId && gymMap.get(member.gymId)) || 'H4 Fitness Gym';

    const items = [];
    const usedTimestamps = new Set();

    // 1. Process traditional CRM desk & mobile check-ins
    traditionalAttendance.forEach((att) => {
        const timeKey = att.date ? new Date(att.date).getTime() : 0;
        const windowKey = Math.floor(timeKey / 120000);
        let branchName = att.branchId ? branchMap.get(att.branchId) : null;
        let gymName = gymMap.get(att.gymId) || memberGymName;
        if (branchName) {
            gymName = `${gymName} - ${branchName}`;
        }

        items.push({
            _id: att.id,
            id: att.id,
            memberId: att.memberId,
            date: att.date ? att.date.toISOString() : new Date().toISOString(),
            checkInTime: att.checkInTime || '',
            gymId: att.gymId,
            branchId: att.branchId || null,
            gymName: gymName,
            isFitPrimeSession: false,
            status: 'Completed',
        });

        if (timeKey) usedTimestamps.add(windowKey);
    });

    // 2. Process session check-ins as source
    sessions.forEach((s) => {
        const timeKey = s.startedAt ? new Date(s.startedAt).getTime() : 0;
        const windowKey = Math.floor(timeKey / 120000);

        if (!usedTimestamps.has(windowKey)) {
            let gymName = s.gymName;
            if (!gymName || gymName === 'Partner Gym' || gymName.includes('Partner')) {
                gymName = gymMap.get(s.gymId) || memberGymName;
            }

            items.push({
                _id: s.id,
                id: s.id,
                memberId: s.memberId,
                date: s.startedAt ? s.startedAt.toISOString() : new Date().toISOString(),
                checkInTime: s.startedAt ? s.startedAt.toTimeString().split(' ')[0] : '',
                gymId: s.gymId,
                gymName: gymName,
                isFitPrimeSession: true,
                status: s.status || 'Completed',
            });

            if (timeKey) usedTimestamps.add(windowKey);
        }
    });

    // 3. Process audit logs for check-ins not captured in sessionCheckIn
    auditLogs.forEach((a) => {
        const timeKey = a.checkInTimestamp ? new Date(a.checkInTimestamp).getTime() : 0;
        const windowKey = Math.floor(timeKey / 120000);

        if (!usedTimestamps.has(windowKey)) {
            let gymName = a.gymNameVisited;
            if (!gymName || gymName === 'Partner Gym' || gymName.includes('Partner')) {
                gymName = gymMap.get(a.gymIdVisited) || memberGymName;
            }

            items.push({
                _id: a.id,
                id: a.id,
                memberId: a.memberId,
                date: a.checkInTimestamp ? a.checkInTimestamp.toISOString() : new Date().toISOString(),
                checkInTime: a.checkInTimestamp ? a.checkInTimestamp.toTimeString().split(' ')[0] : '',
                gymId: a.gymIdVisited || '',
                gymName: gymName,
                isFitPrimeSession: true,
                status: 'Completed',
            });
            usedTimestamps.add(windowKey);
        }
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(items);
});

// @desc    Get member's digital membership pass (permanent QR code + membership details)
// @route   GET /api/member-portal/digital-pass
// @access  Private/Member
const getMyDigitalPass = catchAsync(async (req, res, next) => {
    const member = await resolveMember(req);
    if (!member) {
        return res.status(404).json({ message: 'Member profile not found' });
    }

    let plan = null;
    if (member.planId) {
        plan = await prisma.plan.findUnique({ where: { id: member.planId } }).catch(() => null);
    }

    // Stable QR payload that works offline and is instantly scannable by reception/trainers
    const qrData = JSON.stringify({
        type: 'MEMBER_PASS',
        mid: member.id,
        phone: member.phone,
        gymId: member.gymId,
        branchId: member.branchId || null
    });

    res.json({
        success: true,
        member: {
            id: member.id,
            name: member.name,
            phone: member.phone,
            email: member.email,
            status: member.status,
            gymId: member.gymId,
            branchId: member.branchId || null,
            sessionsRemaining: member.sessionsRemaining ?? 0,
            sessionsTotal: member.sessionsTotal ?? 0,
            planName: plan?.name || 'Active Membership'
        },
        memberId: member.id,
        qrData,
        pin: member.phone ? member.phone.slice(-4) : '0000', // simple predictable phone PIN fallback
        expiresInSeconds: 0 // permanent pass, never forces false-positive expiration
    });
});

// @desc    Get logged in member payments
// @route   GET /api/member-portal/payments
// @access  Private/Member
const getMyPayments = catchAsync(async (req, res, next) => {
    const member = await resolveMember(req);
    if (!member) {
        return res.json([]);
    }

    const payments = await prisma.payment.findMany({
        where: { memberId: member.id },
        orderBy: { date: 'desc' },
    }).catch(() => []);

    res.json(payments);
});

// @desc    Create Razorpay Order
// @route   POST /api/member-portal/payment/create-order
// @access  Private/Member
const createRazorpayOrder = catchAsync(async (req, res, next) => {
    try {
        if (!req.user?.memberId) {
            return res.status(403).json({ message: 'Not authorized as a member (no memberId in token)' });
        }

        const member = await prisma.member.findUnique({ where: { id: req.user.memberId } });
        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const amountDue = (member.planPrice || 0) - (member.paidAmount || 0);

        if (amountDue <= 0) {
            return res.status(400).json({ message: 'No dues pending for this member' });
        }

        // --- PARTIAL PAYMENT: use custom amount from request body ---
        let paymentAmount = req.body ? Number(req.body.amount) : NaN;
        if (!paymentAmount || isNaN(paymentAmount) || paymentAmount <= 0) {
            // fallback to full due amount if not provided
            paymentAmount = amountDue;
        }
        if (paymentAmount > amountDue) {
            return res.status(400).json({ message: `Amount ₹${paymentAmount} exceeds total due ₹${amountDue}` });
        }

        const amountInPaise = Math.round(paymentAmount * 100);
        if (amountInPaise < 100) {
            return res.status(400).json({ message: `Amount too small: ₹${paymentAmount}. Minimum is ₹1.` });
        }

        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const hasRazorpayKeys = keyId && keySecret && 
                                keyId !== 'your_razorpay_key_id' &&
                                keyId !== 'null' && keyId !== 'undefined' && keyId.trim() !== '';

        if (!hasRazorpayKeys) {
            logger.warn('Razorpay keys missing or invalid in .env. Returning a mock order for testing.');
            const mockOrder = {
                id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
                amount: amountInPaise,
                currency: "INR",
                receipt: `rcpt_${member.id.slice(-6)}_${Date.now()}`,
                status: "created",
                is_mock: true
            };
            return res.status(201).json(mockOrder);
        }

        const instance = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${member.id.slice(-6)}_${Date.now()}`,
            notes: { paymentAmount: paymentAmount, memberId: member.id },
        };

        const order = await instance.orders.create(options);
        res.status(201).json(order);
    } catch (error) {
        logger.error({ err: error }, 'Razorpay create-order failed');
        res.status(500).json({
            message: 'Razorpay order creation failed',
            error: error.message || String(error),
            details: error.error?.description || error.description || 'Check server logs for details'
        });
    }
});

// @desc    Verify Razorpay Payment
// @route   POST /api/member-portal/payment/verify
// @access  Private/Member
const verifyRazorpayPayment = catchAsync(async (req, res, next) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount_paid } = req.body || {};

        if (!req.user?.memberId) {
            return res.status(403).json({ message: 'Not authorized as a member' });
        }

        const member = await prisma.member.findUnique({ where: { id: req.user.memberId } });
        if (!member) {
            return res.status(404).json({ message: 'Member profile not found' });
        }

        const isMock = razorpay_order_id && razorpay_order_id.startsWith('order_mock_');
        let isAuthentic = false;

        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const hasKeySecret = keySecret && keySecret !== 'null' && keySecret !== 'undefined' && keySecret.trim() !== '';

        if (isMock || !hasKeySecret) {
            isAuthentic = true;
        } else {
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac('sha256', keySecret)
                .update(body.toString())
                .digest('hex');
            isAuthentic = expectedSignature === razorpay_signature;
        }

        if (isAuthentic) {
            // Use the actual amount paid (partial or full)
            const amountPaid = Number(amount_paid) || ((member.planPrice || 0) - (member.paidAmount || 0));

            // Create Payment record
            await prisma.payment.create({
                data: {
                    memberId: member.id,
                    gymId: member.gymId,
                    amount: amountPaid,
                    method: 'Online (Razorpay)',
                    date: new Date(),
                    transactionId: razorpay_payment_id || `txn_${crypto.randomBytes(8).toString('hex')}`
                }
            });

            // Increment paidAmount by the partial amount paid
            const newPaidAmount = Math.min((member.paidAmount || 0) + amountPaid, member.planPrice || 0);
            const newStatus = newPaidAmount >= (member.planPrice || 0) ? 'Active' : member.status;
            
            await prisma.member.update({
                where: { id: member.id },
                data: {
                    paidAmount: newPaidAmount,
                    status: newStatus
                }
            });

            res.status(200).json({
                success: true,
                message: 'Payment verified and recorded successfully',
                amountPaid,
                remainingDue: (member.planPrice || 0) - newPaidAmount
            });
        } else {
            res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }
    } catch (error) { next(error); }
});

// @desc    Create Razorpay Order for Plan Purchase
// @route   POST /api/member-portal/purchase-plan/create-order
// @access  Private/Member
const purchasePlanOrder = catchAsync(async (req, res, next) => {
    const { planId } = req.body;

    let plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
        plan = await prisma.plan.findFirst({ where: { id: planId } });
    }

    if (!plan) {
        return res.status(404).json({ message: 'Plan not found' });
    }

    const amountInPaise = Math.round(plan.price * 100);
    const userIdString = req.user && (req.user._id || req.user.id) ? (req.user._id || req.user.id).toString() : 'mockuser';
    const receiptId = `rcpt_plan_${userIdString.slice(-6)}_${Date.now()}`;

    const isMockEnv = !process.env.RAZORPAY_KEY_ID ||
                      !process.env.RAZORPAY_KEY_SECRET ||
                      process.env.RAZORPAY_KEY_ID === 'your_razorpay_key_id';
    if (isMockEnv && env.isProduction) {
        logger.error('Razorpay keys missing in production; refusing to create a mock order.');
        return res.status(503).json({ message: 'Payments are not configured.' });
    }

    if (isMockEnv) {
        const mockOrder = {
            id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
            amount: amountInPaise,
            currency: "INR",
            receipt: receiptId,
            status: "created",
            is_mock: true,
            notes: { newPlanId: plan.id }
        };
        return res.status(201).json(mockOrder);
    }

    const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
        amount: amountInPaise,
        currency: "INR",
        receipt: receiptId,
        notes: { newPlanId: plan.id },
    };

    const order = await instance.orders.create(options);
    return res.status(201).json(order);
});

// @desc    Verify Plan Purchase
// @route   POST /api/member-portal/purchase-plan/verify
// @access  Private/Member
const purchasePlanVerify = catchAsync(async (req, res, next) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId } = req.body;

    let plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) {
        plan = await prisma.plan.findFirst({ where: { name: { contains: 'FitPass', mode: 'insensitive' } } });
    }

    if (!plan) {
        return res.status(404).json({ success: false, message: 'Plan not found' });
    }

    const sessionsToCredit = plan.sessions || 10;

    let member = await resolveMember(req);

    if (!member) {
        member = await prisma.member.create({
            data: {
                name: req.user.name || 'FitPass Member',
                phone: req.user.phone || 'N/A',
                email: req.user.email,
                planId: plan.id,
                joinDate: new Date(),
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                status: 'Active',
                planPrice: plan.price,
                paidAmount: plan.price,
                gymId: req.user.gymId || 'SYSTEM',
                branchId: req.user.branchId || null,
                sessionsTotal: sessionsToCredit,
                sessionsRemaining: sessionsToCredit,
            },
        });
    } else {
        const updatedTotal = (member.sessionsTotal || 0) + sessionsToCredit;
        const updatedRemaining = (member.sessionsRemaining || 0) + sessionsToCredit;

        member = await prisma.member.update({
            where: { id: member.id },
            data: {
                planId: plan.id,
                planPrice: plan.price,
                paidAmount: plan.price,
                status: 'Active',
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                sessionsTotal: updatedTotal,
                sessionsRemaining: updatedRemaining,
            },
        });
    }

    // Always ensure user account is linked to memberId & role is member
    if (req.user?._id || req.user?.id) {
        await prisma.user.update({
            where: { id: req.user._id || req.user.id },
            data: { memberId: member.id, role: 'member' },
        }).catch(() => {});
    }

    res.status(200).json({
        success: true,
        message: 'Plan purchased successfully',
        plan,
        sessionsRemaining: member.sessionsRemaining || 0,
        sessionsTotal: member.sessionsTotal || 0,
    });
});

// @desc    Cancel Active Plan
// @route   POST /api/member-portal/plan/cancel
// @access  Private/Member
const cancelMyPlan = catchAsync(async (req, res, next) => {
    const member = await resolveMember(req);
    if (!member) {
        return res.status(404).json({ message: 'Member profile not found' });
    }

    await prisma.member.update({
        where: { id: member.id },
        data: {
            planId: null,
            planPrice: 0,
            paidAmount: 0,
            status: 'Inactive',
            sessionsRemaining: 0,
            sessionsTotal: 0,
            currentSessionEndsAt: null,
            currentSessionGymId: null,
            cooldownEndsAt: null,
        },
    });

    res.status(200).json({ success: true, message: 'Plan cancelled successfully' });
});

// @desc    Get consolidated dashboard data for member (plan, attendance, gyms, session status)
// @route   GET /api/member-portal/dashboard
// @access  Private/Member
const getDashboardData = catchAsync(async (req, res, next) => {
    const member = await resolveMember(req);
    if (!member) {
        return res.status(404).json({ message: 'Member profile not found' });
    }

    await expireIfDue(member);

    const memberId = member.id;

    const [gyms, sessions, attendances, auditLogs, payments, plan] = await Promise.all([
        prisma.gym.findMany({ where: { status: 'Active', id: { not: 'SYSTEM' } } }).catch(() => []),
        prisma.sessionCheckIn.findMany({
            where: { memberId },
            orderBy: { startedAt: 'desc' },
            take: 20,
        }).catch(() => []),
        prisma.attendance.findMany({
            where: { memberId },
            orderBy: { date: 'desc' },
            take: 20,
        }).catch(() => []),
        prisma.fitPassAuditLog.findMany({
            where: { memberId, accessStatus: 'Success' },
            orderBy: { checkInTimestamp: 'desc' },
            take: 20,
        }).catch(() => []),
        prisma.payment.findMany({
            where: { memberId },
            orderBy: { date: 'desc' },
            take: 10,
        }).catch(() => []),
        member.planId ? prisma.plan.findUnique({ where: { id: member.planId } }).catch(() => null) : null,
    ]);

    const gymMap = new Map();
    gyms.forEach((g) => gymMap.set(g.id, g.name));
    const memberGymName = (member.gymId && gymMap.get(member.gymId)) || 'H4 Fitness Gym';

    const items = [];
    const usedTimeKeys = new Set();

    // 1. Session check-ins
    sessions.forEach((s) => {
        const timeKey = s.startedAt ? Math.floor(new Date(s.startedAt).getTime() / 120000) : 0;
        let gymName = s.gymName;
        if (!gymName || gymName === 'Partner Gym' || gymName.includes('Partner')) {
            gymName = gymMap.get(s.gymId) || memberGymName;
        }

        const dateObj = s.startedAt ? new Date(s.startedAt) : new Date();
        items.push({
            _id: s.id,
            id: s.id,
            memberId: s.memberId,
            date: dateObj.toISOString(),
            checkInTime: s.startedAt ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '10:00 AM',
            gymId: s.gymId,
            gymName: gymName,
            isFitPrimeSession: true,
            status: s.status || 'Completed',
        });

        if (timeKey) usedTimeKeys.add(timeKey);
    });

    // 2. Audit logs check-ins
    auditLogs.forEach((a) => {
        const timeKey = a.checkInTimestamp ? Math.floor(new Date(a.checkInTimestamp).getTime() / 120000) : 0;
        if (!usedTimeKeys.has(timeKey)) {
            let gymName = a.gymNameVisited;
            if (!gymName || gymName === 'Partner Gym' || gymName.includes('Partner')) {
                gymName = gymMap.get(a.gymIdVisited) || memberGymName;
            }

            const dateObj = a.checkInTimestamp ? new Date(a.checkInTimestamp) : new Date();
            items.push({
                _id: a.id,
                id: a.id,
                memberId: a.memberId,
                date: dateObj.toISOString(),
                checkInTime: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                gymId: a.gymIdVisited || '',
                gymName: gymName,
                isFitPrimeSession: true,
                status: 'Completed',
            });
            usedTimeKeys.add(timeKey);
        }
    });

    // 3. Home branch attendances
    attendances.forEach((att) => {
        const timeKey = att.date ? Math.floor(new Date(att.date).getTime() / 120000) : 0;
        if (!usedTimeKeys.has(timeKey)) {
            const gymName = gymMap.get(att.gymId) || memberGymName;
            const dateObj = att.date ? new Date(att.date) : new Date();
            items.push({
                _id: att.id,
                id: att.id,
                memberId: att.memberId,
                date: dateObj.toISOString(),
                checkInTime: att.checkInTime || dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                gymId: att.gymId,
                gymName: gymName,
                isFitPrimeSession: false,
                status: 'Completed',
            });
            usedTimeKeys.add(timeKey);
        }
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const recentPayments = payments.map((p) => ({
        id: p.id,
        _id: p.id,
        date: p.date ? new Date(p.date).toISOString() : new Date().toISOString(),
        amount: p.amount ?? 0,
        method: p.method || 'Cash',
        planName: p.planName || (plan ? plan.name : 'Gym Plan'),
        status: p.status || 'Paid',
    }));

    res.json({
        success: true,
        member: {
            id: member.id,
            name: member.name,
            email: member.email,
            phone: member.phone,
            status: member.status,
            paidAmount: member.paidAmount || (plan ? plan.price : 0),
            planPrice: member.planPrice || (plan ? plan.price : 0),
        },
        attendanceCount: items.length,
        attendance: items.slice(0, 10),
        recentHistory: items.slice(0, 10),
        recentPayments: recentPayments,
        sessionStatus: {
            sessionsRemaining: member.sessionsRemaining || 0,
            sessionsTotal: member.sessionsTotal || 0,
            currentSessionEndsAt: member.currentSessionEndsAt ? member.currentSessionEndsAt.toISOString() : null,
            currentSessionGymId: member.currentSessionGymId,
            cooldownEndsAt: member.cooldownEndsAt ? member.cooldownEndsAt.toISOString() : null,
            planName: plan ? plan.name : (member.planId ? 'FitPass Plan' : null),
            expiryDate: member.expiryDate ? member.expiryDate.toISOString() : null,
            planStatus: member.status || 'Inactive',
        },
        partnerGymsCount: gyms.length,
    });
});

// @desc    Update logged in member's own credentials (password only).
//          Identity fields (name, email, phone) are locked for self-service —
//          only SuperAdmin can change them via the admin Members screen.
// @route   PUT /api/member-portal/profile
// @access  Private/Member
const updateMyProfile = catchAsync(async (req, res, next) => {
    try {
        const { name, email, phone, password } = req.body;

        if ((name && name.trim()) || (email && email.trim()) || (phone && phone.trim())) {
            res.status(403);
            throw new Error('Name, email, and mobile number can only be updated by a SuperAdmin. Please contact your gym admin.');
        }

        const userId = req.user._id || req.user.id;
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            res.status(404);
            throw new Error('User account not found');
        }

        // Resolve member profile (kept for response payload only; no longer mutated here)
        let member = await resolveMember(req);

        // Prepare user updates — password only
        const userUpdateData = {};

        if (password && password.trim()) {
            if (password.trim().length < 6) {
                res.status(400);
                throw new Error('New password must be at least 6 characters');
            }
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            userUpdateData.password = await bcrypt.hash(password.trim(), salt);
        }

        // Update User record in database
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: userUpdateData
        });

        res.status(200).json({
            success: true,
            message: 'Password updated successfully!',
            member: member ? {
                name: member.name,
                email: member.email,
                phone: member.phone
            } : null,
            user: {
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone
            }
        });
    } catch (error) { next(error); }
});

module.exports = {
    getMyPlan,
    getMyAttendance,
    getMyPayments,
    createRazorpayOrder,
    verifyRazorpayPayment,
    getFitPrimePlans,
    purchasePlanOrder,
    purchasePlanVerify,
    cancelMyPlan,
    getPartnerGyms,
    getPartnerGymById,
    getDashboardData,
    updateMyProfile,
    getMyDigitalPass
};
