const express = require('express');
const router = express.Router();
const {
    markAttendance,
    getMemberAttendance,
    getTodayAttendance,
    getBranchDutyQR,
    staffClockIn,
    getStaffTodayAttendance
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/authMiddleware');
const tenantFilter = require('../middleware/tenantFilter');

// Member check-in (by staff/admin)
router.route('/')
    .post(protect, authorize('superadmin', 'admin', 'trainer', 'receptionist', 'h4_admin'), markAttendance);

// Today's member attendance log
router.get('/today', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist', 'h4_admin'), tenantFilter, getTodayAttendance);

// Member attendance history
router.get('/member/:memberId', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist', 'h4_admin'), getMemberAttendance);

// Branch duty QR for reception desk display
router.get('/branch-duty-qr', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist', 'h4_admin'), getBranchDutyQR);

// Staff daily duty clock-in
router.post('/staff-clock-in', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist', 'h4_admin'), staffClockIn);

// Today's staff duty attendance log
router.get('/staff-today', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist', 'h4_admin'), getStaffTodayAttendance);

module.exports = router;
