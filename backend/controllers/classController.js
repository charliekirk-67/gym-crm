const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const GymClass = require('../models/GymClass');
const Member = require('../models/Member');
const prisma = require('../config/prisma');
const { verifyMemberPass, verifyBackupPIN } = require('../utils/totpHelper');
const { H4_GYM_IDS } = require('../config/constants');

// Helper: load branch details map
const getBranchesMap = async () => {
    try {
        const branches = await prisma.branch.findMany({ select: { id: true, name: true, address: true, gymId: true } });
        return new Map(branches.map(b => [b.id, b]));
    } catch {
        return new Map();
    }
};

// @desc    Get all classes for a gym / branch
// @route   GET /api/classes
// @access  Private/Admin/Trainer
const getClasses = catchAsync(async (req, res, next) => {
    try {
        const query = { ...req.tenantFilter };
        const [classes, branchMap] = await Promise.all([
            GymClass.find(query).sort({ scheduleDate: 1 }).lean(),
            getBranchesMap()
        ]);

        const result = classes.map(c => {
            const branch = c.branchId ? branchMap.get(c.branchId) : null;
            const bookingsList = Array.isArray(c.bookings) ? c.bookings : [];
            const attendedCount = bookingsList.filter(b => b && (b.status === 'Attended' || b.attended === true)).length;

            return {
                ...c,
                branchName: branch ? branch.name : 'All Studios / Main',
                branchAddress: branch ? branch.address : '',
                seatsAvailable: Math.max(0, c.maxSeats - bookingsList.length),
                attendedCount,
                isBookingClosed: !!(c.bookingDeadline && new Date() > new Date(c.bookingDeadline))
            };
        });

        res.json(result);
    } catch (error) { next(error); }
});

// @desc    Create a class (supports single or multi-branch assignment)
// @route   POST /api/classes
// @access  Private/Admin/Trainer
const createClass = catchAsync(async (req, res, next) => {
    try {
        const { 
            name, 
            type, 
            description, 
            trainerName, 
            scheduleDate, 
            startTime, 
            endTime, 
            maxSeats, 
            bookingDeadline, 
            branchId, 
            branchIds,
            gymId: reqGymId 
        } = req.body;

        if (!name || !type || !scheduleDate || !startTime || !endTime || !maxSeats) {
            return res.status(400).json({ message: 'name, type, scheduleDate, startTime, endTime, maxSeats are required' });
        }

        const userRole = req.user.role;
        const callerGymId = req.user.gymId;

        // Resolve branch targets
        let targetBranchIds = [];
        if (Array.isArray(branchIds) && branchIds.length > 0) {
            targetBranchIds = branchIds;
        } else if (branchId) {
            targetBranchIds = [branchId];
        } else if (req.user.branchId) {
            targetBranchIds = [req.user.branchId];
        } else {
            targetBranchIds = [null]; // All branches / generic
        }

        // Branch and Gym validation according to hierarchy
        const branchRecords = await prisma.branch.findMany({
            where: { id: { in: targetBranchIds.filter(Boolean) } },
            select: { id: true, name: true, gymId: true }
        });
        const branchMap = new Map(branchRecords.map(b => [b.id, b]));

        const createdClasses = [];

        for (const bId of targetBranchIds) {
            let effectiveGymId = callerGymId;
            let effectiveBranchId = bId || null;

            if (bId && branchMap.has(bId)) {
                const bInfo = branchMap.get(bId);
                // Permission checks
                if (userRole === 'h4_admin' || (userRole === 'admin' && H4_GYM_IDS.includes(callerGymId))) {
                    effectiveGymId = bInfo.gymId || callerGymId;
                } else if (userRole === 'superadmin') {
                    effectiveGymId = bInfo.gymId || reqGymId || callerGymId;
                } else {
                    effectiveGymId = callerGymId;
                }
            } else if (reqGymId && userRole === 'superadmin') {
                effectiveGymId = reqGymId;
            }

            const gymClass = await GymClass.create({
                name,
                type,
                description: description || '',
                trainerName: trainerName || '',
                scheduleDate: new Date(scheduleDate),
                startTime,
                endTime,
                maxSeats: Number(maxSeats),
                bookingDeadline: bookingDeadline ? new Date(bookingDeadline) : null,
                gymId: effectiveGymId,
                branchId: effectiveBranchId,
                bookings: []
            });

            createdClasses.push(gymClass);
        }

        res.status(201).json(createdClasses.length === 1 ? createdClasses[0] : createdClasses);
    } catch (error) { next(error); }
});

// @desc    Delete a class
// @route   DELETE /api/classes/:id
// @access  Private/Admin
const deleteClass = catchAsync(async (req, res, next) => {
    try {
        const query = { _id: req.params.id };
        if (req.user.role !== 'superadmin') {
            query.gymId = req.user.gymId;
            if (req.user.branchId) query.branchId = req.user.branchId;
        }

        const gymClass = await GymClass.findOneAndDelete(query);
        if (!gymClass) return res.status(404).json({ message: 'Class not found or unauthorized' });
        res.json({ message: 'Class deleted successfully' });
    } catch (error) { next(error); }
});

// @desc    Get bookings for a class (with attendee status)
// @route   GET /api/classes/:id/bookings
// @access  Private/Admin/Trainer
const getClassBookings = catchAsync(async (req, res, next) => {
    try {
        const query = { _id: req.params.id };
        if (req.user.role !== 'superadmin' && req.user.role !== 'h4_admin') {
            query.gymId = req.user.gymId;
            if (req.user.branchId) query.branchId = req.user.branchId;
        }

        const gymClass = await GymClass.findOne(query)
            .populate('bookings.memberId', 'name phone email');
        if (!gymClass) return res.status(404).json({ message: 'Class not found' });

        // Normalise bookings with status
        const bookings = (gymClass.bookings || []).map(b => {
            const memberObj = typeof b.memberId === 'object' && b.memberId !== null ? b.memberId : null;
            return {
                memberId: memberObj ? (memberObj._id || memberObj.id) : (b.memberId || ''),
                name: b.memberName || memberObj?.name || 'Member',
                phone: memberObj?.phone || '',
                email: memberObj?.email || '',
                bookedAt: b.bookedAt || new Date(),
                status: b.status || (b.attended ? 'Attended' : 'Reserved'),
                attendedAt: b.attendedAt || null,
                verifiedByStaffId: b.verifiedByStaffId || null
            };
        });

        res.json({
            ...gymClass.toObject ? gymClass.toObject() : gymClass,
            bookings,
            attendedCount: bookings.filter(b => b.status === 'Attended').length
        });
    } catch (error) { next(error); }
});

const resolveMemberId = async (req) => {
    let memberId = req.user?.memberId;
    let gymId = req.user?.gymId;
    let branchId = req.user?.branchId || null;
    let memberName = req.user?.name || '';

    try {
        if (memberId) {
            const m = await Member.findById(memberId).select('gymId branchId name');
            if (m) {
                if (m.gymId) gymId = m.gymId;
                if (m.branchId) branchId = m.branchId;
                if (m.name) memberName = m.name;
            }
        }
        if (!memberId && req.user?.email) {
            const m = await Member.findOne({ email: req.user.email }).select('id gymId branchId name');
            if (m) {
                memberId = m._id || m.id;
                if (m.gymId) gymId = m.gymId;
                if (m.branchId) branchId = m.branchId;
                if (m.name) memberName = m.name;
            }
        }
    } catch (err) {
        // Fallback
    }
    return { memberId, gymId, branchId, memberName };
};

// @desc    Member views available classes (branch-scoped)
// @route   GET /api/member-portal/classes
// @access  Private/Member
const getMemberClasses = catchAsync(async (req, res, next) => {
    try {
        const { memberId, gymId, branchId } = await resolveMemberId(req);
        const { allBranches } = req.query;

        // Build scoped query
        const query = {};
        if (gymId) {
            query.gymId = gymId;
        }

        // If member has a branch and not explicitly viewing all branches,
        // filter classes for their branch or generic branch classes
        if (branchId && allBranches !== 'true') {
            query.$or = [
                { branchId: branchId },
                { branchId: null },
                { branchId: '' }
            ];
        }

        const [classes, branchMap] = await Promise.all([
            GymClass.find(query).sort({ scheduleDate: 1, startTime: 1 }).lean(),
            getBranchesMap()
        ]);

        const result = classes.map(c => {
            const branch = c.branchId ? branchMap.get(c.branchId) : null;
            const bookingsList = Array.isArray(c.bookings) ? c.bookings : [];
            const isBooked = memberId ? bookingsList.some(b => b && (b.memberId || b).toString() === memberId.toString()) : false;
            const userBooking = memberId ? bookingsList.find(b => b && (b.memberId || b).toString() === memberId.toString()) : null;

            return {
                ...c,
                id: c._id ? c._id.toString() : c.id,
                branchName: branch ? branch.name : 'Main Studio',
                branchAddress: branch ? branch.address : '',
                imageUrl: c.imageUrl || getImageUrl(c.type, c.name),
                seatsAvailable: Math.max(0, (c.maxSeats || 10) - bookingsList.length),
                isBooked,
                bookingStatus: userBooking ? (userBooking.status || (userBooking.attended ? 'Attended' : 'Reserved')) : null,
                isBookingClosed: !!(c.bookingDeadline && new Date() > new Date(c.bookingDeadline))
            };
        });

        res.json(result);
    } catch (error) { next(error); }
});

// @desc    Member books a class slot
// @route   POST /api/member-portal/classes/:id/book
// @access  Private/Member
const bookClass = catchAsync(async (req, res, next) => {
    try {
        const { memberId, memberName } = await resolveMemberId(req);
        if (!memberId) return res.status(404).json({ message: 'Member profile not found' });

        const gymClass = await GymClass.findById(req.params.id);
        if (!gymClass) return res.status(404).json({ message: 'Class not found' });

        const alreadyBooked = gymClass.bookings.some(
            b => b && (b.memberId || b).toString() === memberId.toString()
        );
        if (alreadyBooked) return res.status(400).json({ message: 'Already booked this class' });

        if (gymClass.bookingDeadline && new Date() > new Date(gymClass.bookingDeadline)) {
            return res.status(400).json({ message: 'Booking for this class has closed' });
        }

        if (gymClass.bookings.length >= gymClass.maxSeats) {
            return res.status(400).json({ message: 'Class is full' });
        }

        gymClass.bookings.push({ 
            memberId: memberId, 
            memberName: memberName || 'Member',
            bookedAt: new Date(),
            status: 'Reserved'
        });
        await gymClass.save();

        // Dispatch In-App Notification to gym / branch manager
        try {
            await prisma.notification.create({
                data: {
                    recipientId: gymClass.gymId,
                    gymId: gymClass.gymId,
                    type: 'CLASS_BOOKING',
                    message: `${memberName || 'A member'} reserved a seat for ${gymClass.name} on ${new Date(gymClass.scheduleDate).toLocaleDateString()}`
                }
            });
        } catch {
            // Notification error should not fail booking
        }

        res.json({
            message: 'Class booked successfully',
            seatsAvailable: gymClass.maxSeats - gymClass.bookings.length,
            status: 'Reserved'
        });
    } catch (error) { next(error); }
});

// @desc    Member cancels a class booking
// @route   DELETE /api/member-portal/classes/:id/book
// @access  Private/Member
const cancelBooking = catchAsync(async (req, res, next) => {
    try {
        const { memberId } = await resolveMemberId(req);
        if (!memberId) return res.status(404).json({ message: 'Member profile not found' });

        const gymClass = await GymClass.findById(req.params.id);
        if (!gymClass) return res.status(404).json({ message: 'Class not found' });

        const bookingIndex = gymClass.bookings.findIndex(
            b => b && (b.memberId || b).toString() === memberId.toString()
        );
        if (bookingIndex === -1) return res.status(400).json({ message: 'No booking found for this class' });

        gymClass.bookings.splice(bookingIndex, 1);
        await gymClass.save();

        res.json({
            message: 'Booking cancelled',
            seatsAvailable: gymClass.maxSeats - gymClass.bookings.length
        });
    } catch (error) { next(error); }
});

// @desc    Trainer / Staff scans member QR to mark class attendance
// @route   POST /api/classes/:id/verify-attendee
// @access  Private/Admin/Trainer
const verifyClassAttendee = catchAsync(async (req, res, next) => {
    const { tokenOrPass, memberId: manualMemberId } = req.body;
    const gymClass = await GymClass.findById(req.params.id);
    if (!gymClass) return res.status(404).json({ message: 'Class session not found' });

    let identifier = manualMemberId;

    if (tokenOrPass) {
        try {
            const parsed = JSON.parse(tokenOrPass);
            identifier = parsed.mid || parsed.memberId || parsed.id || tokenOrPass;
        } catch {
            identifier = tokenOrPass;
        }
    }

    if (!identifier) {
        return res.status(400).json({ message: 'Member ID or pass required' });
    }

    // Resolve member details
    const member = await prisma.member.findFirst({
        where: {
            OR: [
                { id: identifier },
                { phone: identifier }
            ]
        }
    });
    if (!member) return res.status(404).json({ message: 'Member record not found' });
    const verifiedMemberId = member.id;

    let bookings = gymClass.bookings || [];
    let bookingIndex = bookings.findIndex(
        b => b && (b.memberId || b).toString() === verifiedMemberId.toString()
    );

    const now = new Date();

    if (bookingIndex !== -1) {
        // Update existing booking status to Attended
        bookings[bookingIndex] = {
            ...bookings[bookingIndex],
            status: 'Attended',
            attended: true,
            attendedAt: now,
            verifiedByStaffId: req.user.id
        };
    } else {
        // Walk-in attendee: check seat capacity
        if (bookings.length >= gymClass.maxSeats) {
            return res.status(400).json({ message: 'Class is at maximum capacity' });
        }
        bookings.push({
            memberId: verifiedMemberId,
            memberName: member.name,
            bookedAt: now,
            status: 'Attended',
            attended: true,
            attendedAt: now,
            verifiedByStaffId: req.user.id
        });
    }

    gymClass.bookings = bookings;
    await gymClass.save();

    res.json({
        success: true,
        message: `Attendance marked for ${member.name}`,
        member: { id: member.id, name: member.name },
        status: 'Attended',
        attendedAt: now
    });
});

// @desc    Admin manually toggles attendee status in roster
// @route   PUT /api/classes/:id/attendees/:memberId
// @access  Private/Admin/Trainer
const toggleAttendeeStatus = catchAsync(async (req, res, next) => {
    const { id, memberId } = req.params;
    const { status } = req.body; // 'Attended' or 'Reserved'

    const gymClass = await GymClass.findById(id);
    if (!gymClass) return res.status(404).json({ message: 'Class not found' });

    const bookings = gymClass.bookings || [];
    const index = bookings.findIndex(b => b && (b.memberId || b).toString() === memberId.toString());
    if (index === -1) return res.status(404).json({ message: 'Member booking not found' });

    const newStatus = status === 'Attended' ? 'Attended' : 'Reserved';
    bookings[index] = {
        ...bookings[index],
        status: newStatus,
        attended: newStatus === 'Attended',
        attendedAt: newStatus === 'Attended' ? new Date() : null,
        verifiedByStaffId: newStatus === 'Attended' ? req.user.id : null
    };

    gymClass.bookings = bookings;
    await gymClass.save();

    res.json({
        success: true,
        message: `Attendee status updated to ${newStatus}`,
        bookings
    });
});

// @desc    Admin books a class for a member
// @route   POST /api/classes/:id/book
// @access  Private/Admin or Trainer
const adminBookClass = catchAsync(async (req, res, next) => {
    try {
        const { memberId } = req.body;
        if (!memberId) return res.status(400).json({ message: 'Member ID is required' });

        const gymClass = await GymClass.findById(req.params.id);
        if (!gymClass) return res.status(404).json({ message: 'Class not found' });

        const alreadyBooked = gymClass.bookings.some(
            b => b && (b.memberId || b).toString() === memberId.toString()
        );
        if (alreadyBooked) return res.status(400).json({ message: 'Member already booked for this class' });

        if (gymClass.bookings.length >= gymClass.maxSeats) {
            return res.status(400).json({ message: 'Class is full' });
        }

        const member = await Member.findById(memberId).select('name');
        if (!member) return res.status(404).json({ message: 'Member not found' });

        gymClass.bookings.push({ 
            memberId: memberId, 
            memberName: member.name,
            bookedAt: new Date(),
            status: 'Reserved'
        });
        await gymClass.save();

        res.json({
            message: 'Class booked successfully by admin',
            bookings: gymClass.bookings
        });
    } catch (error) { next(error); }
});

// @desc    Admin cancels a member booking
// @route   DELETE /api/classes/:id/bookings/:memberId
// @access  Private/Admin or Trainer
const adminCancelBooking = catchAsync(async (req, res, next) => {
    try {
        const { memberId } = req.params;
        const gymClass = await GymClass.findById(req.params.id);
        if (!gymClass) return res.status(404).json({ message: 'Class not found' });

        const bookingIndex = gymClass.bookings.findIndex(
            b => b && (b.memberId || b).toString() === memberId.toString()
        );
        if (bookingIndex === -1) return res.status(400).json({ message: 'No booking found for this member' });

        gymClass.bookings.splice(bookingIndex, 1);
        await gymClass.save();

        res.json({
            message: 'Booking cancelled by admin',
            bookings: gymClass.bookings
        });
    } catch (error) { next(error); }
});

const CLASS_IMAGES = {
    hiit: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
    yoga: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=600&auto=format&fit=crop&q=80',
    strength: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80',
    cardio: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&auto=format&fit=crop&q=80',
    combat: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&auto=format&fit=crop&q=80',
    pilates: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&auto=format&fit=crop&q=80',
    default: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=600&auto=format&fit=crop&q=80'
};

const getImageUrl = (type, name) => {
    const key = (type || name || '').toLowerCase();
    if (key.includes('hiit')) return CLASS_IMAGES.hiit;
    if (key.includes('yoga')) return CLASS_IMAGES.yoga;
    if (key.includes('strength') || key.includes('barbell')) return CLASS_IMAGES.strength;
    if (key.includes('cardio') || key.includes('zumba')) return CLASS_IMAGES.cardio;
    if (key.includes('combat') || key.includes('boxing')) return CLASS_IMAGES.combat;
    if (key.includes('pilates')) return CLASS_IMAGES.pilates;
    return CLASS_IMAGES.default;
};

module.exports = { 
    getClasses, 
    createClass, 
    deleteClass, 
    getClassBookings, 
    bookClass, 
    cancelBooking, 
    getMemberClasses,
    adminBookClass,
    adminCancelBooking,
    verifyClassAttendee,
    toggleAttendeeStatus
};
