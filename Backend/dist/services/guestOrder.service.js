"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuestOrderService = void 0;
const client_1 = require("@prisma/client");
const client_2 = require("../prisma/client");
const apiError_1 = require("../utils/apiError");
const email_service_1 = require("../utils/email.service");
const alfalah_service_1 = require("./alfalah.service");
class GuestOrderService {
    formatGuestOrder(order) {
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
        };
    }
    resolveItemProductId(item) {
        const raw = (item.productId || item.id)?.trim();
        if (!raw)
            return undefined;
        const uuidMatch = raw.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
        return uuidMatch ? uuidMatch[1] : raw;
    }
    async applyStockUpdatesBestEffort(items, products) {
        const productIds = items
            .map((item) => this.resolveItemProductId(item))
            .filter((id) => Boolean(id));
        const stockRecords = await client_2.prisma.stock.findMany({
            where: { product_id: { in: productIds } },
        });
        for (const item of items) {
            const productId = this.resolveItemProductId(item);
            if (!productId)
                continue;
            const product = products.find((p) => p.id === productId);
            const stock = stockRecords.find((s) => s.product_id === productId);
            if (!stock || !product) {
                if (product) {
                    console.warn(`No stock record found for product ${product.name} (${product.id}). Order will proceed without stock update.`);
                }
                continue;
            }
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
    async createGuestOrder(data) {
        await alfalah_service_1.alfalahService.expireUnpaidCardOrders();
        const productIds = data.items
            .map((item) => this.resolveItemProductId(item))
            .filter((id) => Boolean(id));
        if (productIds.length !== data.items.length) {
            throw new apiError_1.AppError(400, 'Product ID is missing in one or more items');
        }
        const uniqueProductIds = [...new Set(productIds)];
        const products = await client_2.prisma.product.findMany({
            where: {
                id: { in: uniqueProductIds },
                is_active: true,
            },
        });
        if (products.length !== uniqueProductIds.length) {
            throw new apiError_1.AppError(400, 'One or more products not found or inactive');
        }
        const orderItems = [];
        for (const item of data.items) {
            const productId = this.resolveItemProductId(item);
            if (!productId) {
                throw new apiError_1.AppError(400, `Product ID is missing for item: ${item.name}`);
            }
            const product = products.find((p) => p.id === productId);
            if (!product) {
                throw new apiError_1.AppError(400, `Product not found for item: ${item.name}`);
            }
            const qty = new client_1.Prisma.Decimal(item.quantity);
            const unitPrice = new client_1.Prisma.Decimal(item.price);
            const lineTotal = unitPrice.times(qty);
            orderItems.push({
                product: { connect: { id: product.id } },
                display_name: item.name,
                grams_per_unit: item.gramsPerUnit != null && item.gramsPerUnit > 0
                    ? new client_1.Prisma.Decimal(item.gramsPerUnit)
                    : undefined,
                unit_name: item.unitName?.trim() || undefined,
                quantity: qty,
                price: unitPrice,
                total_price: lineTotal,
            });
        }
        if (orderItems.length === 0) {
            throw new apiError_1.AppError(400, 'No valid order items found');
        }
        const orderNumber = `MP${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
        const totalAmount = new client_1.Prisma.Decimal(data.total);
        const customer = await this.findOrCreateWebsiteCustomer(data);
        const order = await client_2.prisma.order.create({
            data: {
                order_number: orderNumber,
                customer: { connect: { id: customer.id } },
                customer_name: `${data.customer.firstName} ${data.customer.lastName}`.trim(),
                customer_email: data.customer.email,
                customer_phone: data.customer.phone,
                delivery_address: data.shipping.address,
                delivery_city: data.shipping.city,
                delivery_postal_code: data.shipping.postalCode ?? null,
                order_notes: data.orderNotes,
                total_amount: totalAmount,
                status: 'PENDING',
                payment_method: data.paymentMethod.toUpperCase(),
                payment_status: 'PENDING',
                items: { create: orderItems },
            },
            include: {
                items: { include: { product: { include: { unit: true } } } },
            },
        });
        if (!order.items?.length) {
            throw new apiError_1.AppError(500, 'Order created without item details');
        }
        const isCard = data.paymentMethod === 'card';
        // Card orders wait for Bank Alfalah before stock and confirmation email.
        if (!isCard) {
            void this.applyStockUpdatesBestEffort(data.items, products);
            const emailData = {
                orderNumber,
                customerName: `${data.customer.firstName} ${data.customer.lastName}`,
                customerEmail: data.customer.email,
                customerPhone: data.customer.phone,
                shippingAddress: data.shipping,
                items: data.items.map((item) => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    total: item.price * item.quantity,
                })),
                subtotal: data.subtotal,
                shipping: data.shippingCost,
                total: data.total,
                paymentMethod: data.paymentMethod,
                orderNotes: data.orderNotes,
            };
            email_service_1.EmailService.sendOrderConfirmationEmails(emailData).catch((err) => {
                console.error('Failed to send order confirmation emails:', err);
            });
        }
        return this.formatGuestOrder(order);
    }
    async findOrCreateWebsiteCustomer(data) {
        const name = `${data.customer.firstName} ${data.customer.lastName}`.trim() || 'Website customer';
        const phone = data.customer.phone.trim();
        const email = data.customer.email.trim();
        const address = [data.shipping.address, data.shipping.city, data.shipping.postalCode]
            .filter(Boolean)
            .join(', ');
        const digits = phone.replace(/\D/g, '');
        const phoneTail = digits.length >= 10 ? digits.slice(-10) : digits;
        const existing = await client_2.prisma.customer.findFirst({
            where: {
                OR: [
                    { email },
                    { phone_number: phone },
                    ...(phoneTail.length >= 7 ? [{ phone_number: { contains: phoneTail } }] : []),
                ],
            },
            orderBy: { created_at: 'desc' },
        });
        if (existing)
            return existing;
        return client_2.prisma.customer.create({
            data: {
                name,
                phone_number: phone,
                email,
                address,
                billing_address: address,
                is_active: true,
            },
        });
    }
    async getGuestOrders(status, page = 1, pageSize = 10) {
        await alfalah_service_1.alfalahService.expireUnpaidCardOrders();
        const where = {
            customer_name: { not: null },
        };
        if (status) {
            where.status = status;
        }
        const [orders, total] = await Promise.all([
            client_2.prisma.order.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: (page - 1) * pageSize,
                take: pageSize,
                include: {
                    items: {
                        include: {
                            product: { include: { unit: true } },
                        },
                    },
                },
            }),
            client_2.prisma.order.count({ where }),
        ]);
        return {
            data: orders.map((order) => this.formatGuestOrder(order)),
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async getGuestOrderById(orderId) {
        const order = await client_2.prisma.order.findFirst({
            where: {
                id: orderId,
                customer_name: { not: null },
            },
            include: {
                items: {
                    include: {
                        product: { include: { unit: true } },
                    },
                },
            },
        });
        if (!order) {
            throw new apiError_1.AppError(404, 'Guest order not found');
        }
        return this.formatGuestOrder(order);
    }
    normalizePhone(value) {
        return (value || '').replace(/\D/g, '');
    }
    phonesMatch(stored, incomingDigits) {
        if (!incomingDigits || incomingDigits.length < 7)
            return false;
        const saved = this.normalizePhone(stored);
        if (!saved)
            return false;
        if (saved === incomingDigits)
            return true;
        // Compare last 10 digits so +92 / 0 prefixes still match.
        const a = saved.slice(-10);
        const b = incomingDigits.slice(-10);
        return a.length >= 7 && a === b;
    }
    /** Public customer lookup by order number (email/phone optional). */
    async trackGuestOrder(data) {
        const orderNumber = data.orderNumber.trim();
        const email = data.email?.trim().toLowerCase() || '';
        const phoneDigits = this.normalizePhone(data.phone);
        const order = await client_2.prisma.order.findFirst({
            where: {
                order_number: { equals: orderNumber, mode: 'insensitive' },
            },
            include: {
                customer: true,
                items: {
                    include: {
                        product: { include: { unit: true } },
                    },
                },
            },
        });
        if (!order) {
            throw new apiError_1.AppError(404, 'No order found with that order number');
        }
        // If the customer also sent email/phone, verify it matches — otherwise
        // order number alone is enough.
        if (email || phoneDigits.length >= 7) {
            const emailMatch = Boolean(email) &&
                (order.customer_email?.toLowerCase() === email ||
                    order.customer?.email?.toLowerCase() === email);
            const phoneMatch = this.phonesMatch(order.customer_phone, phoneDigits) ||
                this.phonesMatch(order.customer?.phone_number, phoneDigits) ||
                this.phonesMatch(order.customer?.mobile_number, phoneDigits);
            if (!emailMatch && !phoneMatch) {
                throw new apiError_1.AppError(404, 'No order found with that order number');
            }
        }
        const formatted = this.formatGuestOrder(order);
        const items = (order.items || []).map((item) => ({
            id: item.id,
            name: item.display_name || item.product?.name || 'Item',
            quantity: Number(item.quantity),
            price: Number(item.price),
            total_price: Number(item.total_price),
            unit_name: item.unit_name || item.product?.unit?.name || null,
            grams_per_unit: item.grams_per_unit != null ? Number(item.grams_per_unit) : null,
        }));
        return {
            id: order.id,
            order_number: order.order_number,
            status: order.status,
            payment_method: order.payment_method,
            // Completed orders are paid (COD collected on delivery, etc.)
            payment_status: order.status === 'COMPLETED' && order.payment_status === 'PENDING'
                ? 'PAID'
                : order.payment_status,
            total_amount: Number(order.total_amount),
            created_at: order.created_at,
            updated_at: order.updated_at,
            customer: formatted.customer,
            shipping: formatted.shipping,
            items,
        };
    }
}
exports.GuestOrderService = GuestOrderService;
//# sourceMappingURL=guestOrder.service.js.map