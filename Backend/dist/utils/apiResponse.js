"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponse = void 0;
class ApiResponse {
    data;
    message;
    statusCode;
    success;
    meta;
    constructor(data, message, statusCode = 200, success = true, meta) {
        this.data = data;
        this.message = message;
        this.statusCode = statusCode;
        this.success = success;
        this.meta = meta;
    }
    send(res) {
        const response = {
            success: this.success,
            message: this.message,
            data: this.data,
        };
        if (this.meta) {
            response.meta = this.meta;
        }
        return res.status(this.statusCode).json(response);
    }
}
exports.ApiResponse = ApiResponse;
//# sourceMappingURL=apiResponse.js.map