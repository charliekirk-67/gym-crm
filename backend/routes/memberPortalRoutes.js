const express = require('express');
const router = express.Router();
const { getMyPlan, getMyAttendance, getMyPayments, createRazorpayOrder, verifyRazorpayPayment, getFitPrimePlans, purchasePlanOrder, purchasePlanVerify, cancelMyPlan, getPartnerGyms, getPartnerGymById, getDashboardData, updateMyProfile, getMyDigitalPass } = require('../controllers/memberPortalController');
const { addGymReview, getGymReviews } = require('../controllers/reviewController');
const { getMemberClasses, bookClass, cancelBooking } = require('../controllers/classController');
const { checkIn, getSessionStatus, getSessionHistory } = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { checkInSchema } = require('./sessionRoutes');

router.use(protect);

router.get('/dashboard', getDashboardData);
router.get('/digital-pass', getMyDigitalPass);
router.put('/profile', updateMyProfile);
router.get('/plan', getMyPlan);
router.get('/fitprime-plans', getFitPrimePlans);
router.get('/gyms', getPartnerGyms);
router.get('/gyms/:id', getPartnerGymById);
router.get('/gyms/:id/reviews', getGymReviews);
router.post('/gyms/:id/reviews', addGymReview);
router.get('/attendance', getMyAttendance);
router.get('/payments', getMyPayments);

// Razorpay Payment Routes (Dues)
router.post('/payment/create-order', createRazorpayOrder);
router.post('/payment/verify', verifyRazorpayPayment);

// Razorpay Payment Routes (Purchase New Plan)
router.post('/purchase-plan/create-order', purchasePlanOrder);
router.post('/purchase-plan/verify', purchasePlanVerify);

// Cancel Plan Route
router.post('/plan/cancel', cancelMyPlan);

// FitPrime Session Check-In Routes (Member scans gym QR)
router.get('/sessions/status', getSessionStatus);
router.get('/sessions/history', getSessionHistory);
router.post('/sessions/check-in', validate({ body: checkInSchema }), checkIn);

// Class Booking Routes (Member)
router.get('/classes', getMemberClasses);
router.post('/classes/:id/book', bookClass);
router.delete('/classes/:id/book', cancelBooking);

module.exports = router;
