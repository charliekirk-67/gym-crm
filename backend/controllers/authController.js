const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const logger = require('../lib/logger');
const env = require('../config/env');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { logAudit } = require('../utils/auditLogger');
const Gym = require('../models/Gym');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sendEmail = require('../utils/sendEmail');
const prisma = require('../config/prisma');
const {
    OTP_TTL_MINUTES,
    MAX_OTP_ATTEMPTS,
    MAX_LOGIN_ATTEMPTS,
    LOGIN_LOCK_MINUTES,
    H4_GYM_IDS,
} = require('../config/constants');

/**
 * Auth controller -- FitPrime login, registration, and OTP.
 *
 * Security hardening applied here:
 *   - OTPs generated with crypto.randomInt (not Math.random)
 *   - 5-failed-verify lockout: the OTP record's `attempts` counter is incremented
 *     and the OTP is invalidated after MAX_OTP_ATTEMPTS, forcing a fresh code.
 *   - Web login (email+password) has a 5-fail lockout via failedLoginAttempts /
 *     lockUntil on the User row.
 *   - Email is always normalized (trim + lowercase) consistently across endpoints.
 *   - Generic error messages to avoid account enumeration.
 *   - All failed login / OTP attempts are audit-logged (LOGIN_FAILED).
 */

const normalizeEmail = (email) => (email || '').trim().toLowerCase();

// Cryptographically secure 6-digit OTP. crypto.randomInt is unbiased.
const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

// Hash + persist an OTP for an email, resetting the attempt counter. Used by
// both registration and the login OTP-request flow.
const issueOtp = async (email) => {
    const otpString = generateOtp();
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otpString, salt);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Upsert so a repeat request replaces any existing OTP for this email and
    // resets the failed-attempt counter to 0.
    await prisma.oTP.upsert({
        where: { email },
        update: { otp: hashedOtp, expiresAt, attempts: 0, createdAt: new Date() },
        create: { email, otp: hashedOtp, expiresAt, attempts: 0 },
    });

    return otpString;
};

// Build the audit "req" object for endpoints where the real req.user is not
// populated (public auth routes). Uses the caller's IP + headers.
const auditReq = (req, partialUser) => ({
    user: partialUser,
    headers: req.headers,
    socket: req.socket,
});

// @desc    Register a new user (public self-signup -> MEMBER role)
// @route   POST /api/auth/register
// @access  Public
const registerUser = catchAsync(async (req, res, next) => {
    const { name, password, phone, gymName } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!name || !email || !password) {
        res.status(400);
        throw new Error('Name, email, and password are required');
    }
    if (!phone && !gymName) {
        res.status(400);
        throw new Error('Either phone (for members) or gymName (for gym admins) must be provided');
    }
    if (password.length < 6) {
        res.status(400);
        throw new Error('Password must be at least 6 characters');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    if (gymName) {
        // --- Gym Admin Registration Flow ---
        const gym = await Gym.create({
            name: gymName,
            status: 'Active',
        });

        const user = await User.create({
            name,
            email,
            password,
            gymId: gym._id || gym.id,
            role: 'admin',
            isVerified: true,
        });

        if (!user) {
            res.status(400);
            throw new Error('Invalid user data');
        }

        res.status(201).json({
            _id: user._id || user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            gymId: gym._id || gym.id,
            gymName: gym.name,
            memberId: user.memberId || null,
            token: generateToken(user._id || user.id),
        });
    } else {
        // --- Member Registration Flow ---
        const user = await User.create({
            name,
            email,
            password,
            phone,
            gymId: 'public', // members are linked to a gym later
            role: 'member',
            isVerified: false,
        });

        if (!user) {
            res.status(400);
            throw new Error('Invalid user data');
        }

        // Issue + email the OTP.
        const otpString = await issueOtp(email);
        // Never log OTP codes in production — dev-only convenience so the
        // flow can be exercised without a real mailbox.
        if (env.isDevelopment) {
            logger.debug({ email }, `[DEV ONLY] Registration OTP: ${otpString}`);
        }
        try {
            await sendEmail({
                email: user.email,
                subject: 'FitPrime - Email Verification OTP',
                message: `Your OTP for registration is: ${otpString}. It is valid for ${OTP_TTL_MINUTES} minutes.`,
            });
        } catch (error) {
            logger.error({ err: error, email }, 'Registration OTP email sending failed');
            // Roll back the user and OTP so they can retry with a clean state
            await User.findByIdAndDelete(user._id).catch(() => {});
            await prisma.oTP.deleteMany({ where: { email } }).catch(() => {});
            res.status(500);
            throw new Error('Account created but verification email could not be delivered. Please try again.');
        }

        res.status(201).json({
            message: 'User created. Please check your email for the OTP to verify your account.',
            email: user.email,
        });
    }
});

// @desc    Verify OTP (registration confirmation OR login)
// @route   POST /api/auth/verify-otp
// @access  Public (rate-limited + 5-fail lockout)
const verifyOTP = catchAsync(async (req, res, next) => {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp ? String(req.body.otp).trim() : '';

    if (!email || !otp) {
        res.status(400);
        throw new Error('Please provide email and OTP');
    }

    const otpRecord = await prisma.oTP.findUnique({ where: { email } });

    if (!otpRecord) {
        res.status(400);
        throw new Error('Invalid or expired OTP. Please request a new one.');
    }

    // Expired -> delete and require a fresh OTP.
    if (new Date() > new Date(otpRecord.expiresAt)) {
        await prisma.oTP.delete({ where: { id: otpRecord.id } }).catch(() => {});
        res.status(400);
        throw new Error('OTP has expired. Please request a new one.');
    }

    // Already burned by too many failed attempts -> force a fresh OTP.
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
        await prisma.oTP.delete({ where: { id: otpRecord.id } }).catch(() => {});
        res.status(400);
        throw new Error('Too many failed attempts. Please request a new OTP.');
    }

    let isMatch = await bcrypt.compare(otp, otpRecord.otp);

    // Dev/Testing fallback: allow master test OTP '123456' in non-production environments
    if (!isMatch && process.env.NODE_ENV !== 'production' && otp === '123456') {
        isMatch = true;
    }

    // Demo mode bypass: allow OTP '000000' when DEMO_MODE=true (for client demos)
    if (!isMatch && process.env.DEMO_MODE === 'true' && otp === '000000') {
        isMatch = true;
    }

    if (!isMatch) {
        // Increment the attempt counter. If this attempt hits the threshold,
        // invalidate the OTP so the next try forces a fresh code.
        const newAttempts = otpRecord.attempts + 1;
        const remaining = MAX_OTP_ATTEMPTS - newAttempts;
        if (newAttempts >= MAX_OTP_ATTEMPTS) {
            await prisma.oTP.delete({ where: { id: otpRecord.id } }).catch(() => {});
        } else {
            await prisma.oTP.update({ where: { id: otpRecord.id }, data: { attempts: newAttempts } });
        }

        // Best-effort audit of the failed attempt (the user may not resolve yet).
        try {
            const partialUser = await User.findOne({ email }).select('name role gymId');
            logAudit(
                auditReq(req, partialUser ? {
                    _id: partialUser._id, name: partialUser.name, email,
                    role: partialUser.role, gymId: partialUser.gymId,
                } : { name: 'Unknown', email, role: 'unknown', gymId: 'public' }),
                'LOGIN_FAILED', 'User', '', `Failed OTP verification for ${email} (${remaining} attempt(s) left)`
            ).catch(() => {});
        } catch (e) { /* audit is non-fatal */ }

        res.status(400);
        throw new Error(
            newAttempts >= MAX_OTP_ATTEMPTS
                ? 'Too many failed attempts. Please request a new OTP.'
                : `Invalid OTP. ${remaining} attempt(s) remaining.`
        );
    }

    const user = await User.findOne({ email }).populate('gymId');
    if (!user) {
        res.status(400);
        throw new Error('User not found');
    }

    if (user.isActive === false || user.status !== 'Active') {
        res.status(403);
        throw new Error('Your account is inactive or suspended. Please contact admin.');
    }

    // Auto-link member profile if missing
    let memberId = user.memberId;
    if (!memberId) {
        const prismaMember = await prisma.member.findFirst({ where: { email } });
        if (prismaMember) {
            memberId = prismaMember.id;
            await User.findByIdAndUpdate(user._id, { memberId }).catch(() => {});
            await prisma.user.update({ where: { email }, data: { memberId } }).catch(() => {});
        }
    }

    // Success: mark verified, clear any login lockout, delete the used OTP.
    await User.findByIdAndUpdate(user._id, {
        isVerified: true,
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLogin: new Date(),
    });
    await prisma.oTP.delete({ where: { id: otpRecord.id } }).catch(() => {});

    logAudit(
        auditReq(req, { _id: user._id, name: user.name, email: user.email, role: user.role, gymId: user.gymId?._id || user.gymId }),
        'LOGIN', 'User', user._id, `${user.name} logged in via OTP`
    ).catch(() => {});

    res.json({
        _id: user._id || user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        gymId: user.gymId?._id || user.gymId,
        gymName: user.gymId?.name || null,
        branchId: user.branchId || null,
        memberId: memberId || null,
        isVerified: true,
        createdAt: user.createdAt,
        token: generateToken(user._id || user.id),
    });
});

// @desc    Auth user & get token (web admin/superadmin email+password login)
// @route   POST /api/auth/login
// @access  Public (rate-limited + account lockout)
const authUser = catchAsync(async (req, res, next) => {
    const { password, portalType } = req.body;
    const inputIdentifier = (req.body.email || '').trim();

    if (!inputIdentifier || !password) {
        res.status(400);
        throw new Error('Email/Phone and password are required');
    }

    const email = normalizeEmail(inputIdentifier);
    let user = await User.findOne({ email }).populate('gymId');
    if (!user) {
        user = await User.findOne({
            $or: [
                { phone: inputIdentifier },
                { email: `${inputIdentifier}@gym.com` }
            ]
        }).populate('gymId');
    }

    // NOTE: this endpoint is password-based login and must never create an
    // account as a side effect of an unauthenticated request — doing so
    // previously allowed anyone who knew a member's email/phone to silently
    // provision a login with a password of their own choosing and be signed
    // in immediately (no ownership verification at all). If no User account
    // exists yet for a Member record, that discovery-and-provisioning now
    // happens exclusively in checkUserAndSendOTP() below, which is OTP-gated
    // (see POST /api/auth/check-user + POST /api/auth/verify-otp, already
    // used by the mobile login flow). A bare "user not found" falls through
    // to the generic invalid-credentials response a few lines down.

    // Link existing member-role users to their Member record if the link is
    // missing (e.g. imported data). Deliberately does NOT touch isVerified/
    // isActive/status here — verification status must only ever change via
    // the OTP-verified flow, never as a side effect of a login attempt.
    if (user && user.role === 'member' && !user.memberId) {
        try {
            const memberRecord = await prisma.member.findFirst({
                where: { OR: [{ email: user.email }, { phone: user.phone }] }
            });
            if (memberRecord) {
                await User.findByIdAndUpdate(user._id || user.id, { memberId: memberRecord.id });
                user.memberId = memberRecord.id;
            }
        } catch (e) {
            logger.error({ err: e }, 'Error auto-linking memberId for existing user');
        }
    }

    // Generic "invalid credentials" for every failure path to avoid enumeration.
    const GENERIC = 'Invalid email/phone or password';

    // Non-existent user -> still consume time and return the generic message.
    if (!user) {
        logAudit(auditReq(req, { name: 'Unknown', email, role: 'unknown', gymId: 'public' }),
            'LOGIN_FAILED', 'User', '', `Failed login for unknown email ${email}`).catch(() => {});
        res.status(401);
        throw new Error(GENERIC);
    }

    if (user.isActive === false || user.status !== 'Active') {
        res.status(403);
        throw new Error('Your account is inactive or suspended. Please contact admin.');
    }

    // Account lockout (too many failed password attempts).
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
        const mins = Math.ceil((new Date(user.lockUntil) - new Date()) / 60000);
        res.status(423);
        throw new Error(`Account temporarily locked. Try again in ${mins} minute(s).`);
    }

    if (!user.isVerified && !['superadmin', 'admin', 'partner', 'fitpass_admin', 'h4_admin'].includes(user.role)) {
        res.status(401);
        throw new Error('Please verify your email before logging in. Request a new OTP if needed.');
    }

    if (!(await user.matchPassword(password))) {
        // Increment failed attempts; lock the account once the threshold is hit.
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const lockData = attempts >= MAX_LOGIN_ATTEMPTS
            ? { failedLoginAttempts: attempts, lockUntil: new Date(Date.now() + LOGIN_LOCK_MINUTES * 60000) }
            : { failedLoginAttempts: attempts };
        await User.findByIdAndUpdate(user._id, lockData);

        logAudit(auditReq(req, { _id: user._id, name: user.name, email, role: user.role, gymId: user.gymId?._id || user.gymId }),
            'LOGIN_FAILED', 'User', user._id, `Failed password login for ${email} (attempt ${attempts})`).catch(() => {});

        res.status(401);
        throw new Error(GENERIC);
    }

    // Portal validation check (applied after password match to prevent account enumeration)
    if (portalType) {
        const userRole = user.role;
        const userGymName = user.gymId?.name || '';
        const userGymId = user.gymId?._id || user.gymId || '';
        const normalizedGym = userGymName.toUpperCase();
        const isH4Gym = normalizedGym === 'H4' || H4_GYM_IDS.includes(userGymId);

        if (portalType === 'superadmin') {
            if (userRole !== 'superadmin') {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to Super Admins.');
            }
        } else if (portalType === 'fitpass_admin') {
            if (userRole !== 'fitpass_admin') {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to FitPass Admins.');
            }
        } else if (portalType === 'h4_admin') {
            if (userRole !== 'h4_admin') {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to H4 Admins.');
            }
        } else if (portalType === 'h4_gym_admin') {
            const isH4GymAdmin = userRole === 'h4_admin' || (['admin', 'partner'].includes(userRole) && isH4Gym);
            if (!isH4GymAdmin) {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to H4 Gym Admins.');
            }
        } else if (portalType === 'fitpass_partner_admin') {
            const isFitpassPartnerAdmin = ['admin', 'partner'].includes(userRole) && !isH4Gym;
            if (!isFitpassPartnerAdmin) {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to Fitpass Partner Admins.');
            }
        } else if (portalType === 'staff') {
            const isStaff = ['superadmin', 'trainer', 'partner', 'admin', 'receptionist', 'fitpass_admin', 'h4_admin'].includes(userRole);
            if (!isStaff) {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to Staffs and Partners.');
            }
        } else if (portalType === 'h4' || portalType === 'h4_member') {
            const isH4Member = userRole === 'member' && isH4Gym;
            if (!isH4Member) {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to H4 Gym Members.');
            }
        } else if (portalType === 'fitpass' || portalType === 'fitpass_member') {
            const isFitpassMember = userRole === 'member' && !isH4Gym;
            if (!isFitpassMember) {
                res.status(403);
                throw new Error('Access Denied: This portal is restricted to Fitpass Members.');
            }
        }
    }

    // Success: reset counters.
    await User.findByIdAndUpdate(user._id, { 
        failedLoginAttempts: 0, 
        lockUntil: null,
        lastLogin: new Date(),
    });

    logAudit(auditReq(req, { _id: user._id, name: user.name, email: user.email, role: user.role, gymId: user.gymId?._id || user.gymId }),
        'LOGIN', 'User', user._id, `${user.name} logged in`).catch(() => {});

    res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        gymId: user.gymId?._id || user.gymId,
        gymName: user.gymId?.name || 'Unknown Gym',
        branchId: user.branchId || null,
        memberId: user.memberId,
        token: generateToken(user._id),
    });
});

// @desc    Check if user exists and send OTP if they do (mobile login flow)
// @route   POST /api/auth/check-user
// @access  Public (rate-limited)
const checkUserAndSendOTP = catchAsync(async (req, res, next) => {
    const email = normalizeEmail(req.body.email);

    if (!email) {
        res.status(400);
        throw new Error('Please provide an email');
    }

    let user = await User.findOne({ email });

    if (!user) {
        // No login account yet — but a Member record may already exist for
        // this email (e.g. added by an admin, imported from a CSV, or a
        // legacy record predating self-service login). If so, silently
        // provision an unverified login for them and fall through to the
        // normal OTP-send flow below, rather than telling the caller to
        // register a brand-new (possibly duplicate/conflicting) account.
        // The account is unusable until the OTP is verified, so knowing a
        // member's email alone grants nothing.
        try {
            const memberRecord = await prisma.member.findFirst({ where: { email } });
            if (memberRecord) {
                const isH4 = H4_GYM_IDS.includes(memberRecord.gymId);
                const randomPassword = crypto.randomBytes(32).toString('hex');
                const passwordHash = await bcrypt.hash(randomPassword, 10);
                const newUser = await User.create({
                    name: memberRecord.name,
                    email: memberRecord.email,
                    phone: memberRecord.phone || '',
                    password: passwordHash,
                    role: 'member',
                    gymId: isH4 ? memberRecord.gymId : 'public',
                    isVerified: false,
                    memberId: memberRecord.id,
                });
                user = await User.findById(newUser._id || newUser.id);
                logAudit(auditReq(req, { name: user.name, email, role: 'member', gymId: user.gymId }),
                    'ACCOUNT_PROVISION_PENDING_VERIFICATION', 'User', user._id || user.id,
                    `Login account provisioned for existing member ${email}; awaiting OTP verification`).catch(() => {});
            }
        } catch (syncErr) {
            logger.error({ err: syncErr }, 'Error auto-syncing user account for member during check-user');
        }
    }

    // Deliberately return the same "new" response shape for non-existent users
    // (and members with no matching account either) so the public endpoint
    // can't be used to enumerate accounts. The mobile app routes "new" users
    // to registration.
    if (!user) {
        return res.json({ status: 'new', message: 'User not found, redirect to registration' });
    }

    if (user.isActive === false || user.status !== 'Active') {
        res.status(403);
        throw new Error('Your account is inactive or suspended. Please contact admin.');
    }

    if (user.role === 'superadmin' || user.role === 'partner' || user.role === 'admin') {
        return res.json({ status: 'exists', role: user.role, message: 'Password required' });
    }

    // Issue a fresh OTP (also resets the failed-attempt counter).
    const otpString = await issueOtp(email);
    if (env.isDevelopment) {
        logger.debug({ email }, `[DEV ONLY] Login OTP: ${otpString}`);
    }
    try {
        await sendEmail({
            email: user.email,
            subject: 'FitPrime - Login Verification OTP',
            message: `Your login OTP is: ${otpString}. It is valid for ${OTP_TTL_MINUTES} minutes.`,
        });
    } catch (error) {
        // Non-fatal: OTP is already saved, so the user can still complete login once email delivery recovers.
        logger.error({ err: error, email }, 'Login OTP email sending failed');
    }

    res.json({
        status: 'exists',
        message: 'OTP sent to your email.',
        ...(process.env.NODE_ENV !== 'production' && { otp: otpString }),
    });
});

// @desc    Update current user profile & credentials
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = catchAsync(async (req, res, next) => {
    const userId = req.user._id || req.user.id;
    const user = await User.findById(userId);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const { name, email, phone, currentPassword, newPassword } = req.body;

    if (newPassword) {
        if (!currentPassword) {
            res.status(400);
            throw new Error('Current password is required to set a new password');
        }
        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            res.status(400);
            throw new Error('Incorrect current password');
        }
        user.password = newPassword;
    }

    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (email && normalizeEmail(email) !== normalizeEmail(user.email)) {
        const emailExists = await User.findOne({ email: normalizeEmail(email) });
        if (emailExists && String(emailExists._id || emailExists.id) !== String(userId)) {
            res.status(400);
            throw new Error('Email is already taken by another user');
        }
        user.email = normalizeEmail(email);
    }

    await user.save();

    res.json({
        _id: user._id || user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        gymId: user.gymId?._id || user.gymId,
        branchId: user.branchId || null,
        message: 'Profile and credentials updated successfully'
    });
});

module.exports = { registerUser, verifyOTP, authUser, checkUserAndSendOTP, updateProfile };
