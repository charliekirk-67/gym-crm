const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const BodyAssessment = require('../models/BodyAssessment');
const Member = require('../models/Member');
const User = require('../models/User');

// @desc    Create/Record a new Body Assessment
// @route   POST /api/body-assessments
// @access  Private/Admin/Trainer
const createAssessment = catchAsync(async (req, res, next) => {
    try {
        const {
            memberId,
            weight,
            bmi,
            bodyFat,
            muscleMass,
            bmr,
            inBodyScore,
            assessmentDate
        } = req.body;

        if (!memberId || weight === undefined || bmi === undefined || bodyFat === undefined || muscleMass === undefined || bmr === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Member ID, Weight, BMI, Body Fat %, Muscle Mass, and BMR are required'
            });
        }

        // Validate member exists
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
            return res.status(404).json({ success: false, message: 'Member not found' });
        }

        const targetGymId = member.gymId || req.user.gymId;
        const targetBranchId = req.user.branchId || member.branchId || null;

        const assessment = await BodyAssessment.create({
            memberId,
            trainerId: req.user.id,
            weight: Number(weight),
            bmi: Number(bmi),
            bodyFat: Number(bodyFat),
            muscleMass: Number(muscleMass),
            bmr: Number(bmr),
            inBodyScore: inBodyScore !== undefined && inBodyScore !== '' && inBodyScore !== null ? Number(inBodyScore) : null,
            assessmentDate: assessmentDate ? new Date(assessmentDate) : new Date(),
            gymId: targetGymId,
            branchId: targetBranchId
        });

        res.status(201).json(assessment);
    } catch (error) { next(error); }
});

// @desc    Get body assessments history
// @route   GET /api/body-assessments
// @access  Private/Admin/Trainer/Member
const getAssessments = catchAsync(async (req, res, next) => {
    try {
        let query = { ...req.tenantFilter };

        // If member is calling, force show only their assessments
        if (req.user.role === 'member') {
            query.memberId = req.user.memberId;
        } else if (req.query.memberId) {
            query.memberId = req.query.memberId;
        }

        // Strict pagination parameters with hard cap at 100
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
        const skip = (page - 1) * limit;

        const total = await BodyAssessment.countDocuments(query);
        const assessments = await BodyAssessment.find(query)
            .sort({ assessmentDate: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Batched multi-entity lookup (Trainer + Member)
        const memberIds = [...new Set(assessments.map(a => a.memberId).filter(Boolean))];
        const trainerIds = [...new Set(assessments.map(a => a.trainerId).filter(Boolean))];

        const [members, trainers] = await Promise.all([
            memberIds.length > 0 ? Member.find({ _id: { $in: memberIds } }).select('id name phone email').lean() : [],
            trainerIds.length > 0 ? User.find({ _id: { $in: trainerIds } }).select('id name email role phone').lean() : []
        ]);

        const memberMap = new Map((members || []).map(m => [m._id ? m._id.toString() : m.id, m]));
        const trainerMap = new Map((trainers || []).map(t => [t._id ? t._id.toString() : t.id, t]));

        const formatted = assessments.map(a => {
            const m = a.memberId ? memberMap.get(a.memberId.toString()) : null;
            const t = a.trainerId ? trainerMap.get(a.trainerId.toString()) : null;
            return {
                ...a,
                member: m ? { id: m.id || m._id, name: m.name, phone: m.phone, email: m.email } : null,
                trainer: t ? { id: t.id || t._id, name: t.name, email: t.email } : null
            };
        });

        res.json({
            success: true,
            data: formatted,
            meta: { page, limit, total }
        });
    } catch (error) { next(error); }
});

// @desc    Get single body assessment
// @route   GET /api/body-assessments/:id
// @access  Private/Admin/Trainer/Member
const getAssessmentById = catchAsync(async (req, res, next) => {
    try {
        const query = { _id: req.params.id, gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }) };
        if (req.user.branchId) {
            query.branchId = req.user.branchId;
        }
        const assessment = await BodyAssessment.findOne(query);

        if (assessment) {
            if (req.user.role === 'member' && assessment.memberId !== req.user.memberId) {
                return res.status(403).json({ success: false, message: 'Not authorized to view this assessment' });
            }

            const memberQuery = { _id: assessment.memberId, gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }) };
            if (req.user.branchId) {
                memberQuery.branchId = req.user.branchId;
            }
            const memberObj = await Member.findOne(memberQuery);
            const trainerObj = assessment.trainerId ? await User.findOne({ _id: assessment.trainerId }).select('-password') : null;

            res.json({
                ...assessment,
                member: memberObj ? { id: memberObj.id, name: memberObj.name, phone: memberObj.phone } : null,
                trainer: trainerObj ? { id: trainerObj.id, name: trainerObj.name } : null
            });
        } else {
            res.status(404).json({ success: false, message: 'Assessment not found' });
        }
    } catch (error) { next(error); }
});

// @desc    Update a body assessment record
// @route   PUT /api/body-assessments/:id
// @access  Private/Admin/Trainer
const updateAssessment = catchAsync(async (req, res, next) => {
    try {
        const {
            weight,
            bmi,
            bodyFat,
            muscleMass,
            bmr,
            inBodyScore,
            assessmentDate
        } = req.body;

        const query = { _id: req.params.id, gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }) };
        if (req.user.branchId) {
            query.branchId = req.user.branchId;
        }
        const assessment = await BodyAssessment.findOne(query);

        if (assessment) {
            if (weight !== undefined) assessment.weight = Number(weight);
            if (bmi !== undefined) assessment.bmi = Number(bmi);
            if (bodyFat !== undefined) assessment.bodyFat = Number(bodyFat);
            if (muscleMass !== undefined) assessment.muscleMass = Number(muscleMass);
            if (bmr !== undefined) assessment.bmr = Number(bmr);
            if (inBodyScore !== undefined) assessment.inBodyScore = inBodyScore !== null ? Number(inBodyScore) : null;
            if (assessmentDate !== undefined) assessment.assessmentDate = assessmentDate ? new Date(assessmentDate) : assessment.assessmentDate;

            const updated = await assessment.save();
            res.json(updated);
        } else {
            res.status(404).json({ success: false, message: 'Assessment not found' });
        }
    } catch (error) { next(error); }
});

// @desc    Delete a body assessment record
// @route   DELETE /api/body-assessments/:id
// @access  Private/Admin/Trainer
const deleteAssessment = catchAsync(async (req, res, next) => {
    try {
        const query = { _id: req.params.id, gymId: req.user.gymId, ...(req.user.branchId && { branchId: req.user.branchId }) };
        if (req.user.branchId) {
            query.branchId = req.user.branchId;
        }
        const assessment = await BodyAssessment.findOne(query);

        if (assessment) {
            await assessment.deleteOne();
            res.json({ message: 'Body assessment removed' });
        } else {
            res.status(404).json({ success: false, message: 'Assessment not found' });
        }
    } catch (error) { next(error); }
});

module.exports = {
    createAssessment,
    getAssessments,
    getAssessmentById,
    updateAssessment,
    deleteAssessment
};
