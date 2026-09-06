const crypto = require('crypto');

/**
 * TOTP & Security Helper for Dynamic QR Passes & Anti-Fraud Check-in
 */

const WINDOW_SECONDS = 60; // 60-second rolling window
const SECRET_SALT = process.env.JWT_SECRET || 'gym-crm-totp-secure-salt-2026';

/**
 * Generate a 60-second time-sliced hash for a member pass
 * @param {string} memberId 
 * @param {number} [offsetWindows=0] - 0 for current, -1 for previous window
 */
function getWindowToken(memberId, offsetWindows = 0) {
  const currentEpoch = Math.floor(Date.now() / 1000);
  const timeSlice = Math.floor(currentEpoch / WINDOW_SECONDS) + offsetWindows;
  return crypto
    .createHmac('sha256', SECRET_SALT)
    .update(`${memberId}:${timeSlice}`)
    .digest('hex')
    .substring(0, 16); // 16-char compact hex token
}

/**
 * Generate a deterministic 4-digit backup PIN for a member
 * @param {string} memberId 
 */
function getBackupPIN(memberId) {
  const currentEpoch = Math.floor(Date.now() / 1000);
  const timeSlice = Math.floor(currentEpoch / (WINDOW_SECONDS * 5)); // Valid for 5-minute window
  const hash = crypto
    .createHmac('sha256', SECRET_SALT)
    .update(`pin:${memberId}:${timeSlice}`)
    .digest('hex');
  const num = parseInt(hash.substring(0, 6), 16) % 10000;
  return String(num).padStart(4, '0');
}

/**
 * Generate the full dynamic QR payload for a member's live screen
 * @param {string} memberId 
 */
function generateMemberPassPayload(memberId) {
  const token = getWindowToken(memberId, 0);
  const pin = getBackupPIN(memberId);
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = WINDOW_SECONDS - (now % WINDOW_SECONDS);

  return {
    memberId,
    token,
    pin,
    expiresInSeconds: secondsRemaining,
    qrData: JSON.stringify({
      type: 'MEMBER_PASS',
      mid: memberId,
      tk: token,
      ts: now
    })
  };
}

/**
 * Verify a scanned QR payload or direct token against memberId
 * Accepts current window and previous window (grace period for scans on the boundary)
 * @param {string} memberId 
 * @param {string} tokenOrPayload 
 */
function verifyMemberPass(memberId, tokenOrPayload) {
  if (!memberId || !tokenOrPayload) return false;

  let tokenToVerify = tokenOrPayload;
  let mid = memberId;

  // If passed as full JSON QR string
  if (typeof tokenOrPayload === 'string' && tokenOrPayload.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(tokenOrPayload);
      if (parsed.mid) mid = parsed.mid;
      if (parsed.tk) tokenToVerify = parsed.tk;
      if (parsed.pin) {
        // Also verify PIN if provided
        return verifyBackupPIN(mid, parsed.pin);
      }
    } catch {
      // fallback to raw string comparison
    }
  }

  // Check current window (offset 0)
  const currentExpected = getWindowToken(mid, 0);
  if (tokenToVerify === currentExpected) {
    return { valid: true, memberId: mid };
  }

  // Check previous window (offset -1) to prevent false rejections at boundary
  const prevExpected = getWindowToken(mid, -1);
  if (tokenToVerify === prevExpected) {
    return { valid: true, memberId: mid };
  }

  // In development / testing mode, allow raw memberId bypass if not dynamic
  if (process.env.NODE_ENV !== 'production' && (tokenOrPayload === mid || tokenToVerify === mid)) {
    return { valid: true, memberId: mid, isDevBypass: true };
  }

  return { valid: false, memberId: mid, reason: 'EXPIRED_OR_INVALID_QR' };
}

/**
 * Verify manual 4-digit backup PIN
 * @param {string} memberId 
 * @param {string} pin 
 */
function verifyBackupPIN(memberId, pin) {
  if (!memberId || !pin) return false;
  const expectedPIN = getBackupPIN(memberId);
  if (String(pin).trim() === expectedPIN) {
    return { valid: true, memberId };
  }
  if (process.env.NODE_ENV !== 'production' && String(pin).trim() === '1234') {
    return { valid: true, memberId, isDevBypass: true };
  }
  return { valid: false, memberId, reason: 'INVALID_PIN' };
}

/**
 * Generate daily rotating branch QR payload for staff duty clock-in
 * @param {string} branchId 
 * @param {string} gymId 
 */
function generateDailyBranchDutyQR(branchId, gymId) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const hash = crypto
    .createHmac('sha256', SECRET_SALT)
    .update(`branch-duty:${gymId}:${branchId}:${today}`)
    .digest('hex')
    .substring(0, 16);

  return {
    gymId,
    branchId,
    date: today,
    dutyToken: hash,
    qrData: JSON.stringify({
      type: 'BRANCH_DUTY_QR',
      gymId,
      branchId,
      dutyToken: hash,
      date: today
    })
  };
}

/**
 * Verify daily branch QR scanned by staff for clock-in
 * @param {string} gymId 
 * @param {string} branchId 
 * @param {string} dutyToken 
 */
function verifyDailyBranchDutyQR(gymId, branchId, dutyToken) {
  const expected = generateDailyBranchDutyQR(branchId, gymId);
  if (dutyToken === expected.dutyToken) {
    return true;
  }
  if (process.env.NODE_ENV !== 'production') {
    return true; // allow dev testing
  }
  return false;
}

module.exports = {
  WINDOW_SECONDS,
  generateMemberPassPayload,
  verifyMemberPass,
  getBackupPIN,
  verifyBackupPIN,
  generateDailyBranchDutyQR,
  verifyDailyBranchDutyQR
};
