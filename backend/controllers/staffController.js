const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const User = require('../models/User');

// @desc    Get all staff members
// @route   GET /api/staff
// @access  Private/Admin
const getStaff = catchAsync(async (req, res, next) => {
    try {
        const query = {
            role: { $in: ['admin', 'trainer', 'receptionist'] },
            ...req.tenantFilter
        };

        const staff = await User.find(query).select('-password').lean();
        const { getStaffCode } = require('../utils/idGenerator');
        const formattedStaff = staff.map((s, idx) => ({
            ...s,
            empid: getStaffCode(s, idx),
            displayId: getStaffCode(s, idx)
        }));
        res.json(formattedStaff);
    } catch (error) { next(error); }
});

// @desc    Create a new staff member
// @route   POST /api/staff
// @access  Private/Admin
const createStaff = catchAsync(async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (!['admin', 'trainer', 'receptionist'].includes(role)) {
            return res.status(400).json({ message: 'Invalid role' });
        }

        const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ message: 'User with this email already exists' });
        }

        const staff = await User.create({
            name,
            email: email.trim().toLowerCase(),
            password,
            role,
            gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }),
            branchId: req.user.branchId || null
        });

        const result = { ...staff };
        delete result.password;

        res.status(201).json(result);
    } catch (error) { next(error); }
});

// @desc    Update a staff member
// @route   PUT /api/staff/:id
// @access  Private/Admin
const updateStaff = catchAsync(async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        const query = { _id: req.params.id, gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }) };
        if (req.user.branchId) {
            query.branchId = req.user.branchId;
        }
        const staff = await User.findOne(query);

        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        if (email && email.trim().toLowerCase() !== staff.email) {
            const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
            if (existingUser) {
                return res.status(400).json({ message: 'User with this email already exists' });
            }
            staff.email = email.trim().toLowerCase();
        }

        staff.name = name || staff.name;
        if (role) {
            if (!['admin', 'trainer', 'receptionist'].includes(role)) {
                return res.status(400).json({ message: 'Invalid role' });
            }
            staff.role = role;
        }

        if (password) {
            staff.password = password;
        }

        const updatedStaff = await staff.save();
        const result = { ...updatedStaff };
        delete result.password;

        res.json(result);
    } catch (error) { next(error); }
});

// @desc    Delete a staff member
// @route   DELETE /api/staff/:id
// @access  Private/Admin
const deleteStaff = catchAsync(async (req, res, next) => {
    try {
        const query = { _id: req.params.id, gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }) };
        if (req.user.branchId) {
            query.branchId = req.user.branchId;
        }
        const staff = await User.findOne(query);
        if (!staff) {
            return res.status(404).json({ message: 'Staff member not found' });
        }

        if (staff.id === req.user.id) {
            return res.status(400).json({ message: 'You cannot delete your own account' });
        }

        await staff.deleteOne();
        res.json({ message: 'Staff member removed' });
    } catch (error) { next(error); }
});

module.exports = {
    getStaff,
    createStaff,
    updateStaff,
    deleteStaff
};
