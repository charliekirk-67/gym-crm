const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Attendance = require('../models/Attendance');
const Member = require('../models/Member');
const prisma = require('../config/prisma');
const { logAudit } = require('../utils/auditLogger');
const { 
    verifyMemberPass, 
    verifyBackupPIN, 
    generateDailyBranchDutyQR, 
    verifyDailyBranchDutyQR 
} = require('../utils/totpHelper');

// @desc    Mark attendance for a member (by staff scanning member QR or PIN entry)
// @route   POST /api/attendance
// @access  Private/Admin/Trainer/Receptionist
const markAttendance = catchAsync(async (req, res, next) => {
    const { memberId: rawMemberId, tokenOrPass, pin, phone } = req.body;

    let targetIdentifier = rawMemberId;

    // Support payload from QR scanner (which can be JSON {"mid":"...", ...}, raw member ID, phone, or token)
    if (tokenOrPass) {
        try {
            const parsed = JSON.parse(tokenOrPass);
            targetIdentifier = parsed.mid || parsed.memberId || parsed.id || tokenOrPass;
        } catch {
            targetIdentifier = tokenOrPass;
        }
    } else if (!targetIdentifier && phone) {
        targetIdentifier = phone;
    }

    if (!targetIdentifier) {
        res.status(400);
        throw new Error('Member ID, QR code, or phone number is required');
    }

    // 1. Resolve Member
    let member = await prisma.member.findFirst({
        where: {
            OR: [
                { id: targetIdentifier },
                { phone: targetIdentifier },
                { email: targetIdentifier }
            ]
        }
    });

    if (!member) {
        // Fallback search via Mongoose model if needed
        member = await Member.findById(targetIdentifier).catch(() => null);
    }

    if (!member) {
        res.status(404);
        throw new Error('Member profile not found. Please verify member ID or phone.');
    }

    // 2. Resolve Plan to check if session-based or unlimited
    let plan = null;
    if (member.planId) {
        plan = await prisma.plan.findUnique({ where: { id: member.planId } }).catch(() => null);
    }

    // 3. Session credits handling
    let sessionDeductionMessage = '';
    const isSessionPlan = (plan && plan.sessions && plan.sessions > 0) || (member.sessionsTotal && member.sessionsTotal > 0);

    if (isSessionPlan) {
        const remaining = member.sessionsRemaining ?? 0;
        if (remaining <= 0) {
            res.status(400);
            throw new Error(`Member has 0 sessions remaining out of ${member.sessionsTotal || plan.sessions || 0}. Please renew or top up plan.`);
        }

        // Deduct 1 session credit
        const newRemaining = remaining - 1;
        member = await prisma.member.update({
            where: { id: member.id },
            data: {
                sessionsRemaining: newRemaining,
                lastCheckInAt: new Date()
            }
        });

        sessionDeductionMessage = ` (Session credit used: 1. ${newRemaining} of ${member.sessionsTotal || plan.sessions} remaining)`;
    }

    // 4. Record Attendance for this session (flexible timings, no 1-per-day restriction)
    const now = new Date();
    const checkInTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const effectiveGymId = req.user.gymId || member.gymId;
    const effectiveBranchId = req.user.branchId || member.branchId || null;

    const attendance = await prisma.attendance.create({
        data: {
            memberId: member.id,
            date: now,
            checkInTime,
            gymId: effectiveGymId,
            branchId: effectiveBranchId,
        }
    });

    // 5. Permanent audit log of staff check-in
    await logAudit(
        req,
        'ATTENDANCE_SESSION_RECORDED',
        'Attendance',
        attendance.id,
        `Session check-in recorded for ${member.name}${sessionDeductionMessage} (Staff: ${req.user.name || req.user.id})`,
        member.name
    );

    // 6. Instant Notification to Member on every session check-in
    try {
        await prisma.notification.create({
            data: {
                recipientId: member.id,
                gymId: effectiveGymId,
                type: 'CHECK_IN_ALERT',
                message: `Session check-in confirmed at ${checkInTime}.${sessionDeductionMessage} Verified by staff: ${req.user.name || 'Reception Desk'}.`
            }
        });
    } catch {
        // Notification failure will not block attendance
    }

    res.status(201).json({
        ...attendance,
        memberName: member.name,
        sessionsRemaining: member.sessionsRemaining,
        sessionsTotal: member.sessionsTotal,
        message: `Check-in recorded for ${member.name}!${sessionDeductionMessage}`
    });
});

// @desc    Get today's member attendance for this gym / branch
// @route   GET /api/attendance/today
// @access  Private/Admin/Trainer/Receptionist
const getTodayAttendance = catchAsync(async (req, res, next) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = {
        ...req.tenantFilter,
        date: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
    };

    const attendanceList = await Attendance.find(query).populate('memberId', 'name phone email').lean();

    res.json(attendanceList);
});

// @desc    Get attendance history for a member
// @route   GET /api/attendance/member/:memberId
// @access  Private/Admin
const getMemberAttendance = catchAsync(async (req, res, next) => {
    const query = {
        memberId: req.params.memberId,
        gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId })
    };
    if (req.user.branchId) {
        query.branchId = req.user.branchId;
    }

    const attendance = await Attendance.find(query)
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
    res.json(attendance);
});

// @desc    Get today's dynamic duty QR for front desk display
// @route   GET /api/attendance/branch-duty-qr
// @access  Private/Admin/Staff
const getBranchDutyQR = catchAsync(async (req, res, next) => {
    const gymId = req.user.gymId;
    const branchId = req.user.branchId || 'main';

    const dutyQR = generateDailyBranchDutyQR(branchId, gymId);
    res.json({
        success: true,
        ...dutyQR
    });
});

// @desc    Staff clocks in their daily duty by scanning today's branch QR
// @route   POST /api/attendance/staff-clock-in
// @access  Private/Staff/Trainer/Receptionist
const staffClockIn = catchAsync(async (req, res, next) => {
    const { dutyToken, branchId: scannedBranchId, gymId: scannedGymId } = req.body;
    const staffId = req.user._id || req.user.id;
    const staffName = req.user.name || 'Staff Member';

    const targetGymId = scannedGymId || req.user.gymId;
    const targetBranchId = scannedBranchId || req.user.branchId || 'main';

    // Verify token
    if (dutyToken) {
        const isValid = verifyDailyBranchDutyQR(targetGymId, targetBranchId, dutyToken);
        if (!isValid) {
            res.status(400);
            throw new Error('Daily branch QR code is invalid or has expired. Please scan the live desk QR.');
        }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if staff already clocked in today
    const existing = await prisma.trainerAttendance.findFirst({
        where: {
            trainerId: staffId,
            date: {
                gte: today,
                lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        }
    });

    if (existing) {
        return res.status(200).json({
            success: true,
            message: `Already clocked in for duty today at ${existing.checkInTime ? new Date(existing.checkInTime).toLocaleTimeString() : 'earlier'}.`,
            record: existing
        });
    }

    const now = new Date();
    const dutyRecord = await prisma.trainerAttendance.create({
        data: {
            trainerId: staffId,
            date: now,
            checkInTime: now,
            gymId: targetGymId,
            branchId: targetBranchId !== 'main' ? targetBranchId : null
        }
    });

    await logAudit(req, 'STAFF_DUTY_CLOCK_IN', 'TrainerAttendance', dutyRecord.id,
        `Staff ${staffName} clocked in for daily duty.`, staffName);

    res.status(201).json({
        success: true,
        message: `Duty clock-in successful! Welcome, ${staffName}.`,
        record: dutyRecord
    });
});

// @desc    Get today's staff duty clock-ins for this branch
// @route   GET /api/attendance/staff-today
// @access  Private/Admin/Staff
const getStaffTodayAttendance = catchAsync(async (req, res, next) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = {
        date: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
        }
    };
    if (req.user.gymId && req.user.role !== 'superadmin') {
        query.gymId = req.user.gymId;
    }
    if (req.user.branchId) {
        query.branchId = req.user.branchId;
    }

    const records = await prisma.trainerAttendance.findMany({
        where: query,
        orderBy: { checkInTime: 'desc' }
    });

    // Populate trainer names
    const trainerIds = records.map(r => r.trainerId);
    const users = await prisma.user.findMany({
        where: { id: { in: trainerIds } },
        select: { id: true, name: true, role: true, email: true, phone: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const result = records.map(r => {
        const u = userMap.get(r.trainerId);
        return {
            ...r,
            staffName: u ? u.name : 'Staff',
            staffRole: u ? u.role : 'Trainer',
            staffEmail: u ? u.email : '',
            formattedTime: r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
        };
    });

    res.json(result);
});

module.exports = {
    markAttendance,
    getMemberAttendance,
    getTodayAttendance,
    getBranchDutyQR,
    staffClockIn,
    getStaffTodayAttendance
};
