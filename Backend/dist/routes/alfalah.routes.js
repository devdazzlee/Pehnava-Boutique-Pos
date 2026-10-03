"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const alfalah_controller_1 = require("../controllers/alfalah.controller");
const router = (0, express_1.Router)();
router.get('/config', alfalah_controller_1.getAlfalahConfig);
router.get('/sso', alfalah_controller_1.getAlfalahSsoForm);
router.post('/sso', alfalah_controller_1.getAlfalahSsoForm);
router.get('/verify', alfalah_controller_1.verifyAlfalahPayment);
router.post('/verify', alfalah_controller_1.verifyAlfalahPayment);
router.get('/ipn', alfalah_controller_1.handleAlfalahIpn);
router.post('/ipn', alfalah_controller_1.handleAlfalahIpn);
exports.default = router;
//# sourceMappingURL=alfalah.routes.js.map