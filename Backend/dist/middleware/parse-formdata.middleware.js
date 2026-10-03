"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFormData = void 0;
const parseFormData = (req, res, next) => {
    if (!req.is('multipart/form-data'))
        return next();
    const parsedBody = {};
    // Convert string values to proper types
    for (const [key, value] of Object.entries(req.body)) {
        if (value === 'true')
            parsedBody[key] = true;
        else if (value === 'false')
            parsedBody[key] = false;
        else if (!isNaN(Number(value)) && value !== '')
            parsedBody[key] = Number(value);
        else
            parsedBody[key] = value === '' ? null : value;
    }
    req.body = parsedBody;
    next();
};
exports.parseFormData = parseFormData;
//# sourceMappingURL=parse-formdata.middleware.js.map