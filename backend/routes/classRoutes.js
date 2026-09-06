const express = require('express');
const router = express.Router();
const { 
    getClasses, 
    createClass, 
    deleteClass, 
    getClassBookings, 
    adminBookClass, 
    adminCancelBooking,
    verifyClassAttendee,
    toggleAttendeeStatus
} = require('../controllers/classController');
const { protect, authorize } = require('../middleware/authMiddleware');
const tenantFilter = require('../middleware/tenantFilter');
const validate = require('../middleware/validate');
const { z } = require('zod');

const createClassSchema = z.object({
    name: z.string().min(1, 'Class name is required').max(100),
    type: z.string().min(1, 'Class type is required'),
    description: z.string().optional(),
    trainerName: z.string().optional(),
    scheduleDate: z.string().min(1, 'Schedule date is required'),
    startTime: z.string().min(1, 'Start time is required'),
    endTime: z.string().min(1, 'End time is required'),
    maxSeats: z.coerce.number().min(1, 'Capacity must be at least 1'),
    bookingDeadline: z.string().optional(),
    branchId: z.string().optional().nullable(),
    branchIds: z.array(z.string()).optional(),
    gymId: z.string().optional()
});

const bookClassSchema = z.object({
    memberId: z.string().min(1, 'Member ID is required')
});

router.route('/')
    .get(protect, authorize('superadmin', 'admin', 'trainer', 'receptionist'), tenantFilter, getClasses)
    .post(protect, authorize('superadmin', 'admin', 'trainer'), validate({ body: createClassSchema }), createClass);

router.delete('/:id', protect, authorize('superadmin', 'admin'), deleteClass);
router.get('/:id/bookings', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist'), getClassBookings);
router.post('/:id/book', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist'), validate({ body: bookClassSchema }), adminBookClass);
router.delete('/:id/bookings/:memberId', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist'), adminCancelBooking);

// Attendee verification via QR scan or manual roster toggle
router.post('/:id/verify-attendee', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist'), verifyClassAttendee);
router.put('/:id/attendees/:memberId', protect, authorize('superadmin', 'admin', 'trainer', 'receptionist'), toggleAttendeeStatus);

module.exports = router;
