const express = require('express');
const router = express.Router();
const {
    createMember,
    getMembers,
    getMemberById,
    updateMember,
    deleteMember,
    getExpiringSoonMembers,
    exportMembersCSV,
    getMemberAuditTrail,
    renewMember,
    transferMember,
} = require('../controllers/memberController');
const { protect, authorize } = require('../middleware/authMiddleware');
const tenantFilter = require('../middleware/tenantFilter');
const validate = require('../middleware/validate');
const { z } = require('zod');

const createMemberSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    phone: z.string().min(10, 'Phone must be at least 10 digits'),
    email: z.string().email('Please enter a valid email address').optional().or(z.literal('')),
    planId: z.string().min(1, 'Plan ID is required'),
    joinDate: z.string().optional(),
    branchId: z.string().optional().nullable(),
    gymId: z.string().optional(),
    discount: z.union([z.number(), z.string()]).optional(),
    paidAmount: z.union([z.number(), z.string()]).optional(),
    finalPrice: z.union([z.number(), z.string()]).optional(),
    paymentMethod: z.string().optional(),
    password: z.string().optional()
}).passthrough();

const updateMemberSchema = createMemberSchema.partial().passthrough();

const renewMemberSchema = z.object({
    planId: z.string().min(1, 'Plan ID is required'),
    paymentMethod: z.string().optional(),
    amountPaid: z.union([z.number(), z.string()]).optional(),
    discount: z.union([z.number(), z.string()]).optional(),
    finalPrice: z.union([z.number(), z.string()]).optional()
}).passthrough();

const transferMemberSchema = z.object({
    targetBranchId: z.string().min(1, 'Target Branch ID is required')
});

router.route('/')
    .get(protect, authorize('admin', 'receptionist', 'superadmin', 'fitpass_admin', 'h4_admin'), tenantFilter, getMembers)
    .post(protect, authorize('admin', 'receptionist', 'superadmin', 'fitpass_admin', 'h4_admin'), validate({ body: createMemberSchema }), createMember);

router.get('/export/csv', protect, authorize('admin', 'superadmin', 'fitpass_admin', 'h4_admin'), tenantFilter, exportMembersCSV);
router.get('/expiring-soon', protect, authorize('admin', 'receptionist', 'superadmin', 'fitpass_admin', 'h4_admin'), tenantFilter, getExpiringSoonMembers);

router.get('/status', protect, tenantFilter, getMembers); // Optional: redundant with query params but good for clarity

router.get('/:id/audit', protect, authorize('superadmin'), getMemberAuditTrail);
router.post('/:id/renew', protect, authorize('admin', 'receptionist', 'superadmin', 'fitpass_admin', 'h4_admin'), validate({ body: renewMemberSchema }), renewMember);
router.put('/:id/transfer', protect, authorize('admin', 'superadmin', 'fitpass_admin', 'h4_admin'), validate({ body: transferMemberSchema }), transferMember);

router.route('/:id')
    .get(protect, authorize('admin', 'receptionist', 'superadmin', 'fitpass_admin', 'h4_admin'), getMemberById)
    .put(protect, authorize('admin', 'receptionist', 'superadmin', 'fitpass_admin', 'h4_admin'), validate({ body: updateMemberSchema }), updateMember)
    .delete(protect, authorize('admin', 'superadmin', 'fitpass_admin', 'h4_admin'), deleteMember);

module.exports = router;

