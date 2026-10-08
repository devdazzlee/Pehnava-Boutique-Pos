"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPhoneNumber = exports.generateOTP = void 0;
exports.asNumber = asNumber;
exports.addDecimal = addDecimal;
exports.subDecimal = subDecimal;
const client_1 = require("@prisma/client");
const generateOTP = (length = 6) => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
};
exports.generateOTP = generateOTP;
const formatPhoneNumber = (phone) => {
    // Implement phone number formatting logic for your region
    return phone.replace(/\D/g, '');
};
exports.formatPhoneNumber = formatPhoneNumber;
function asNumber(x) {
    if (x === null || x === undefined)
        return 0;
    if (typeof x === 'number')
        return x;
    if (typeof x === 'object' && 'toNumber' in x)
        return x.toNumber();
    return 0;
}
function addDecimal(a, b) {
    if (typeof a === "number")
        a = new client_1.Prisma.Decimal(a);
    if (typeof b === "number")
        b = new client_1.Prisma.Decimal(b);
    return a.plus(b);
}
function subDecimal(a, b) {
    if (typeof a === "number")
        a = new client_1.Prisma.Decimal(a);
    if (typeof b === "number")
        b = new client_1.Prisma.Decimal(b);
    return a.minus(b);
}
//# sourceMappingURL=helpers.js.map