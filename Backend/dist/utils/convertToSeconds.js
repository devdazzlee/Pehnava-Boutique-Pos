"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToSeconds = convertToSeconds;
function convertToSeconds(timeString) {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1));
    switch (unit) {
        case 's':
            return value; // seconds
        case 'm':
            return value * 60; // minutes
        case 'h':
            return value * 60 * 60; // hours
        case 'd':
            return value * 24 * 60 * 60; // days
        default:
            return 24 * 60 * 60; // default 1 day
    }
}
//# sourceMappingURL=convertToSeconds.js.map