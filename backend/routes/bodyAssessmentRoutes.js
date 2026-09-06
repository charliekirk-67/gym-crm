const express = require('express');
const router = express.Router();
const {
    createAssessment,
    getAssessments,
    getAssessmentById,
    updateAssessment,
    deleteAssessment
} = require('../controllers/bodyAssessmentController');
const { protect, authorize } = require('../middleware/authMiddleware');
const tenantFilter = require('../middleware/tenantFilter');

router.route('/')
    .get(protect, authorize('admin', 'receptionist', 'trainer', 'member', 'h4_admin', 'superadmin', 'fitpass_admin'), tenantFilter, getAssessments)
    .post(protect, authorize('admin', 'trainer', 'h4_admin', 'superadmin', 'fitpass_admin'), createAssessment);

router.route('/:id')
    .get(protect, authorize('admin', 'receptionist', 'trainer', 'member', 'h4_admin', 'superadmin', 'fitpass_admin'), getAssessmentById)
    .put(protect, authorize('admin', 'trainer', 'h4_admin', 'superadmin', 'fitpass_admin'), updateAssessment)
    .delete(protect, authorize('admin', 'trainer', 'h4_admin', 'superadmin', 'fitpass_admin'), deleteAssessment);

module.exports = router;
