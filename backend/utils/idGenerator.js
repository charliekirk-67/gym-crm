/**
 * Universal Sequential EMPID & Member ID Generator / Formatter
 * 
 * Rules:
 * - All Staff (All Branches & Roles): EMP1001, EMP1002, EMP1003...
 * - All Members (Branch & FitPass):   MEM1001, MEM1002, MEM1003...
 * - Sequential global numbering starting at 1001.
 */

function getMemberCode(member, index = 0) {
    const baseNumber = 1001 + (Number(index) || 0);
    return `MEM${baseNumber}`;
}

function getStaffCode(staffUser, index = 0) {
    const baseNumber = 1001 + (Number(index) || 0);
    return `EMP${baseNumber}`;
}

module.exports = {
    getMemberCode,
    getStaffCode
};
