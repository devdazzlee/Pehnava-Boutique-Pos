"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteOrder = exports.reopenOrder = exports.cancelOrderByCustomer = exports.cancelOrderByAdmin = exports.updateOrderStatus = exports.getMyOrderById = exports.getMyOrders = exports.getOrder = exports.getOrders = exports.createOrder = void 0;
const order_service_1 = require("../services/order.service");
const apiResponse_1 = require("../utils/apiResponse");
const asyncHandler_1 = __importDefault(require("../middleware/asyncHandler"));
const orderService = new order_service_1.OrderService();
const createOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const order = await orderService.createOrder({ ...req.body, customerId: req.customer?.id });
    new apiResponse_1.ApiResponse(order, 'Order created successfully', 201).send(res);
});
exports.createOrder = createOrder;
const getOrders = (0, asyncHandler_1.default)(async (req, res) => {
    const { status, page = '1', pageSize = '10' } = req.query;
    const orders = await orderService.getOrders(status ? status : undefined, parseInt(page, 10), parseInt(pageSize, 10));
    new apiResponse_1.ApiResponse(orders, 'Orders retrieved successfully').send(res);
});
exports.getOrders = getOrders;
const getOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const orderId = req.params.id;
    const order = await orderService.getSpecificOrder(orderId);
    new apiResponse_1.ApiResponse(order, 'Order retrieved successfully').send(res);
});
exports.getOrder = getOrder;
const getMyOrders = (0, asyncHandler_1.default)(async (req, res) => {
    const customerId = req.customer?.id;
    const orders = await orderService.getCustomerOrders(customerId);
    new apiResponse_1.ApiResponse(orders, 'Your orders retrieved successfully').send(res);
});
exports.getMyOrders = getMyOrders;
const getMyOrderById = (0, asyncHandler_1.default)(async (req, res) => {
    const customerId = req.customer?.id;
    const orderId = req.params.id;
    const order = await orderService.getCustomerOrderById(customerId, orderId);
    new apiResponse_1.ApiResponse(order, 'Your order retrieved successfully').send(res);
});
exports.getMyOrderById = getMyOrderById;
const updateOrderStatus = (0, asyncHandler_1.default)(async (req, res) => {
    const order = await orderService.updateOrderStatus(req.params.orderId, req.body.status);
    new apiResponse_1.ApiResponse(order, 'Order status updated successfully').send(res);
});
exports.updateOrderStatus = updateOrderStatus;
const cancelOrderByAdmin = (0, asyncHandler_1.default)(async (req, res) => {
    const orderId = req.params.orderId;
    const result = await orderService.cancelOrderByAdmin(orderId);
    new apiResponse_1.ApiResponse(result, 'Order cancelled by admin').send(res);
});
exports.cancelOrderByAdmin = cancelOrderByAdmin;
const cancelOrderByCustomer = (0, asyncHandler_1.default)(async (req, res) => {
    const orderId = req.params.orderId;
    const customerId = req.customer?.id;
    const result = await orderService.cancelOrderByCustomer(customerId, orderId);
    new apiResponse_1.ApiResponse(result, 'Your order has been cancelled').send(res);
});
exports.cancelOrderByCustomer = cancelOrderByCustomer;
const reopenOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const { orderId } = req.params;
    const order = await orderService.reopenOrder(orderId);
    new apiResponse_1.ApiResponse(order, 'Order re-opened successfully and stock re-allocated').send(res);
});
exports.reopenOrder = reopenOrder;
const deleteOrder = (0, asyncHandler_1.default)(async (req, res) => {
    const { orderId } = req.params;
    await orderService.deleteOrder(orderId);
    new apiResponse_1.ApiResponse(null, 'Order permanently deleted').send(res);
});
exports.deleteOrder = deleteOrder;
//# sourceMappingURL=order.controller.js.map