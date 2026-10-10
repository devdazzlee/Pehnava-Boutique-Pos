"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.alfalahService = void 0;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const email_service_1 = require("../utils/email.service");
const alfalah_1 = require("../config/alfalah");
const alfalahHash_1 = require("../utils/alfalahHash");
function orderPaymentUpdate(data) {
    return data;
}
function formatGuestOrder(order) {
    const fullName = order.customer_name || '';
    const [firstName, ...lastNameParts] = fullName.trim().split(' ').filter(Boolean);
    return {
        ...order,
        customer: {
            firstName: firstName || '',
            lastName: lastNameParts.join(' ') || '',
            email: order.customer_email || '',
            phone: order.customer_phone || '',
        },
        shipping: {
            address: order.delivery_address || '',
            city: order.delivery_city || '',
            postalCode: order.delivery_postal_code || '',
        },
        orderNotes: order.order_notes || '',
        payment_status: order.payment_status,
    };
}
function formatAmount(amount) {
    return Number(amount).toFixed(2);
}
function parseOrderRefFromApgReturn(input) {
    const queryKeys = ['O', 'o', 'order', 'orderId', 'ref', 'TransactionReferenceNumber'];
    for (const key of queryKeys) {
        const value = input.query[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    const rawPath = input.path || '';
    const fromPath = rawPath.match(/(?:^|[/?])O=([^/?&]+)/i);
    if (fromPath?.[1])
        return decodeURIComponent(fromPath[1]);
    return '';
}
function parseGatewayPayload(data) {
    let payload = data;
    if (typeof payload === 'string') {
        try {
            payload = JSON.parse(payload);
        }
        catch {
            return {};
        }
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload;
    }
    return {};
}
function isPaidStatus(status) {
    return String(status || '').trim().toLowerCase() === 'paid';
}
function isFailedStatus(status) {
    return ['failed', 'unpaid', 'declined', 'cancelled', 'canceled', 'expired'].includes(String(status || '').trim().toLowerCase());
}
class AlfalahService {
    isEnabled() {
        return (0, alfalah_1.getAlfalahConfig)().enabled;
    }
    getPublicConfig() {
        const config = (0, alfalah_1.getAlfalahConfig)();
        return {
            enabled: config.enabled,
            env: config.env,
            provider: 'alfalah',
        };
    }
    buildHandshakeForm(orderNumber) {
        const config = this.requireConfig();
        const fieldsWithoutHash = {
            HS_ChannelId: config.channelId,
            HS_MerchantId: config.merchantId,
            HS_StoreId: config.storeId,
            HS_ReturnURL: `${config.websiteUrl}/checkout/alfalah/complete`,
            HS_MerchantHash: config.merchantHash,
            HS_MerchantUsername: config.merchantUsername,
            HS_MerchantPassword: config.merchantPassword,
            HS_TransactionReferenceNumber: orderNumber,
            HS_IsRedirectionRequest: '0',
        };
        return {
            provider: 'alfalah',
            actionUrl: config.handshakeUrl,
            method: 'POST',
            fields: {
                ...fieldsWithoutHash,
                HS_RequestHash: this.hashFields(fieldsWithoutHash, config.key1, config.key2),
            },
        };
    }
    buildSsoForm(orderNumber, authToken, amount) {
        const config = this.requireConfig();
        const token = authToken.trim();
        if (!token)
            throw new apiError_1.AppError(400, 'Missing Bank Alfalah auth token');
        const fieldsWithoutHash = {
            AuthToken: token,
            ChannelId: config.channelId,
            Currency: config.currency,
            ReturnURL: `${config.websiteUrl}/checkout/alfalah/complete`,
            MerchantId: config.merchantId,
            StoreId: config.storeId,
            MerchantHash: config.merchantHash,
            MerchantUsername: config.merchantUsername,
            MerchantPassword: config.merchantPassword,
            IsBIN: config.isBin,
            TransactionTypeId: config.cardTransactionTypeId,
            TransactionReferenceNumber: orderNumber,
            TransactionAmount: formatAmount(amount),
        };
        return {
            provider: 'alfalah',
            actionUrl: config.ssoUrl,
            method: 'POST',
            fields: {
                ...fieldsWithoutHash,
                RequestHash: this.hashFields(fieldsWithoutHash, config.key1, config.key2),
            },
        };
    }
    async getSsoFormForOrder(orderNumber, authToken) {
        const order = await this.findOrderByNumber(orderNumber);
        if (order.payment_method !== 'CARD') {
            throw new apiError_1.AppError(400, 'This order is not a card payment');
        }
        if (order.payment_status === 'PAID') {
            throw new apiError_1.AppError(409, 'This order is already paid');
        }
        return this.buildSsoForm(order.order_number, authToken, Number(order.total_amount));
    }
    async startCardCheckout(orderNumber) {
        const order = await this.findOrderByNumber(orderNumber);
        if (order.payment_method !== 'CARD') {
            throw new apiError_1.AppError(400, 'This order is not a card payment');
        }
        if (order.payment_status === 'PAID') {
            throw new apiError_1.AppError(409, 'This order is already paid');
        }
        const handshake = this.buildHandshakeForm(order.order_number);
        const { data } = await axios_1.default.post(handshake.actionUrl, new URLSearchParams(handshake.fields).toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 20000,
            validateStatus: () => true,
        });
        let payload = data;
        if (typeof data === 'string') {
            try {
                payload = JSON.parse(data);
            }
            catch {
                payload = {};
            }
        }
        const success = String(payload?.success).toLowerCase() === 'true';
        const authToken = String(payload?.AuthToken || payload?.authToken || '').trim();
        if (!success || !authToken) {
            throw new apiError_1.AppError(502, 'Bank Alfalah handshake failed. Please try card payment again.');
        }
        return this.buildSsoForm(order.order_number, authToken, Number(order.total_amount));
    }
    async inquireAndSettle(orderNumber) {
        await this.expireUnpaidCardOrders();
        const config = this.requireConfig();
        const order = await this.findOrderByNumber(orderNumber);
        const { data } = await axios_1.default.get(config.ipnOrderStatusUrl(order.order_number), {
            timeout: 20000,
            validateStatus: () => true,
        });
        const gateway = parseGatewayPayload(data);
        const status = gateway.TransactionStatus || gateway.transaction_status || gateway.transactionStatus;
        const transactionId = gateway.TransactionId || gateway.unique_tran_id || gateway.transaction_id || null;
        const paid = isPaidStatus(status);
        const failed = isFailedStatus(status);
        if (paid) {
            await this.markPaid(order.id, String(transactionId || ''));
        }
        else if (failed && order.payment_status !== 'PAID') {
            await client_2.prisma.order.update({
                where: { id: order.id },
                data: orderPaymentUpdate({ payment_status: 'FAILED' }),
            });
        }
        const fresh = await this.findOrderByNumber(order.order_number);
        return {
            order: formatGuestOrder(fresh),
            transactionStatus: status || (paid ? 'Paid' : 'Failed'),
            paid,
        };
    }
    async handleIpn(statusUrl) {
        if (!statusUrl?.trim()) {
            throw new apiError_1.AppError(400, 'Missing IPN status URL');
        }
        let parsed;
        try {
            parsed = new URL(statusUrl);
        }
        catch {
            throw new apiError_1.AppError(400, 'Invalid IPN status URL');
        }
        const allowedHosts = new Set(['sandbox.bankalfalah.com', 'payments.bankalfalah.com']);
        if (!allowedHosts.has(parsed.hostname)) {
            throw new apiError_1.AppError(400, 'IPN URL host is not Bank Alfalah');
        }
        const { data } = await axios_1.default.get(statusUrl, { timeout: 20000, validateStatus: () => true });
        const gateway = parseGatewayPayload(data);
        const orderNumber = gateway.TransactionReferenceNumber ||
            gateway.transaction_reference_number ||
            gateway.order_id;
        if (!orderNumber) {
            throw new apiError_1.AppError(400, 'IPN response did not include an order reference');
        }
        return this.inquireAndSettle(String(orderNumber));
    }
    extractOrderNumber(input) {
        const ref = parseOrderRefFromApgReturn(input);
        if (!ref)
            throw new apiError_1.AppError(400, 'Could not find order reference from Bank Alfalah return');
        return ref;
    }
    async expireUnpaidCardOrders() {
        const minutes = (0, alfalah_1.getAlfalahConfig)().unpaidCardExpiryMinutes;
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);
        await client_2.prisma.order.updateMany({
            where: {
                customer_id: null,
                payment_method: 'CARD',
                payment_status: 'PENDING',
                status: 'PENDING',
                created_at: { lt: cutoff },
            },
            data: {
                status: 'CANCELLED',
                payment_status: 'FAILED',
            },
        });
    }
    async findOrderByNumber(orderNumber) {
        const order = await client_2.prisma.order.findFirst({
            where: { order_number: orderNumber, customer_id: null },
            include: {
                items: { include: { product: { include: { unit: true } } } },
            },
        });
        if (!order)
            throw new apiError_1.AppError(404, 'Order not found');
        return order;
    }
    async markPaid(orderId, transactionId) {
        const existing = (await client_2.prisma.order.findUnique({
            where: { id: orderId },
            include: { items: { include: { product: true } } },
        }));
        if (!existing)
            throw new apiError_1.AppError(404, 'Order not found');
        if (existing.payment_status === 'PAID')
            return existing;
        const updated = await client_2.prisma.order.update({
            where: { id: orderId },
            data: orderPaymentUpdate({
                payment_status: 'PAID',
                apg_transaction_id: transactionId || existing.apg_transaction_id,
                status: existing.status === 'CANCELLED' ? existing.status : 'PROCESSING',
            }),
            include: { items: { include: { product: { include: { unit: true } } } } },
        });
        const items = existing.items.map((item) => ({
            id: item.product_id,
            productId: item.product_id,
            name: item.display_name || item.product?.name || 'Item',
            price: Number(item.price),
            quantity: Number(item.quantity),
            gramsPerUnit: item.grams_per_unit != null ? Number(item.grams_per_unit) : undefined,
            unitName: item.unit_name || undefined,
        }));
        await this.applyStockUpdatesBestEffort(items, existing.items.map((i) => i.product));
        email_service_1.EmailService.sendOrderConfirmationEmails({
            orderNumber: existing.order_number,
            customerName: existing.customer_name || 'Customer',
            customerEmail: existing.customer_email || '',
            customerPhone: existing.customer_phone || '',
            shippingAddress: {
                address: existing.delivery_address || '',
                city: existing.delivery_city || '',
                postalCode: existing.delivery_postal_code || undefined,
            },
            items: items.map((item) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
            })),
            subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
            shipping: Math.max(0, Number(existing.total_amount) - items.reduce((sum, item) => sum + item.price * item.quantity, 0)),
            total: Number(existing.total_amount),
            paymentMethod: 'card',
            orderNotes: existing.order_notes || undefined,
        }).catch((err) => {
            console.error('Failed to send paid-order confirmation emails:', err);
        });
        return updated;
    }
    requireConfig() {
        const config = (0, alfalah_1.getAlfalahConfig)();
        if (!config.enabled) {
            throw new apiError_1.AppError(503, 'Bank Alfalah is not configured. Add merchant credentials and encryption keys to the backend environment.');
        }
        return config;
    }
    hashFields(fields, key1, key2) {
        try {
            return (0, alfalahHash_1.hashAlfalahFields)(fields, key1, key2);
        }
        catch (err) {
            throw new apiError_1.AppError(500, err instanceof Error ? err.message : 'Failed to sign Alfalah request');
        }
    }
    async applyStockUpdatesBestEffort(items, products) {
        const productIds = items
            .map((item) => item.productId || item.id)
            .filter((id) => Boolean(id));
        if (productIds.length === 0)
            return;
        const stockRecords = await client_2.prisma.stock.findMany({
            where: { product_id: { in: productIds } },
        });
        for (const item of items) {
            const productId = item.productId || item.id;
            if (!productId)
                continue;
            const product = products.find((p) => p.id === productId);
            const stock = stockRecords.find((s) => s.product_id === productId);
            if (!stock || !product)
                continue;
            const qty = new client_1.Prisma.Decimal(item.quantity);
            try {
                await client_2.prisma.$transaction([
                    client_2.prisma.stock.update({
                        where: {
                            product_id_branch_id: {
                                product_id: product.id,
                                branch_id: stock.branch_id,
                            },
                        },
                        data: { current_quantity: { decrement: qty } },
                    }),
                    client_2.prisma.stockMovement.create({
                        data: {
                            product: { connect: { id: product.id } },
                            branch: { connect: { id: stock.branch_id } },
                            movement_type: 'SALE',
                            quantity_change: qty.negated(),
                            previous_qty: stock.current_quantity,
                            new_qty: stock.current_quantity.minus(qty),
                        },
                    }),
                ]);
            }
            catch (err) {
                console.warn(`Stock update skipped for ${product.name} (${product.id}):`, err instanceof Error ? err.message : err);
            }
        }
    }
}
exports.alfalahService = new AlfalahService();
//# sourceMappingURL=alfalah.service.js.map