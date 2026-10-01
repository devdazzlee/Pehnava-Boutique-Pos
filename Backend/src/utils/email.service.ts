import nodemailer from 'nodemailer';
import { EMAIL_USER, EMAIL_PASS, EMAIL_HOST, EMAIL_PORT } from '../config/env';

const ADMIN_EMAIL = 'order@manpasandstore.com';

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: parseInt(EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: {
    address: string;
    city: string;
    postalCode?: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  shipping: number;
  total: number;
  paymentMethod: string;
  orderNotes?: string;
}

function formatGuestPaymentMethod(method: string): string {
  switch (method) {
    case 'card':
      return 'Credit / Debit Card';
    case 'bank_transfer':
      return 'Bank Transfer';
    default:
      return 'Cash on Delivery';
  }
}

export class EmailService {
  /**
   * Send order confirmation email to customer
   */
  static async sendOrderConfirmationToCustomer(orderData: OrderEmailData): Promise<void> {
    const mailOptions = {
      from: `"Pehnawa Boutique" <${EMAIL_USER}>`,
      to: orderData.customerEmail,
      subject: `Order Confirmation - ${orderData.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #0D2B3A 0%, #1A73A8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .order-item { padding: 10px; border-bottom: 1px solid #eee; }
            .order-item:last-child { border-bottom: none; }
            .total { font-size: 20px; font-weight: bold; color: #1A73A8; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Confirmed!</h1>
              <p>Thank you for your purchase, ${orderData.customerName}</p>
            </div>
            <div class="content">
              <div class="order-info">
                <h2>Order Details</h2>
                <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
                <p><strong>Order Date:</strong> ${new Date().toLocaleDateString()}</p>
                <p><strong>Payment Method:</strong> ${formatGuestPaymentMethod(orderData.paymentMethod)}</p>
              </div>

              <div class="order-info">
                <h2>Shipping Address</h2>
                <p>${orderData.shippingAddress.address}</p>
                <p>${orderData.shippingAddress.city}${orderData.shippingAddress.postalCode ? `, ${orderData.shippingAddress.postalCode}` : ''}</p>
                <p><strong>Phone:</strong> ${orderData.customerPhone}</p>
              </div>

              <div class="order-info">
                <h2>Order Items</h2>
                ${orderData.items.map(item => `
                  <div class="order-item">
                    <p><strong>${item.name}</strong> x ${item.quantity}</p>
                    <p>Rs. ${item.price.toLocaleString()} each = Rs. ${item.total.toLocaleString()}</p>
                  </div>
                `).join('')}
              </div>

              <div class="order-info">
                <p>Subtotal: Rs. ${orderData.subtotal.toLocaleString()}</p>
                <p>Shipping: ${orderData.shipping === 0 ? '<span style="color: green;">Free</span>' : `Rs. ${orderData.shipping.toLocaleString()}`}</p>
                <p class="total">Total: Rs. ${orderData.total.toLocaleString()}</p>
              </div>

              ${orderData.paymentMethod === 'cash' ? `
                <div class="order-info" style="background: #fff3cd; border-left: 4px solid #ffc107;">
                  <h3>Cash on Delivery</h3>
                  <p>Please have the exact amount (Rs. ${orderData.total.toLocaleString()}) ready for our delivery agent.</p>
                </div>
              ` : ''}

              ${orderData.paymentMethod === 'bank_transfer' ? `
                <div class="order-info" style="background: #e8f4fc; border-left: 4px solid #1A73A8;">
                  <h3>Bank Transfer</h3>
                  <p>Please message us on WhatsApp (+92-333-2757629) with order ${orderData.orderNumber} so we can share account details and verify your transfer.</p>
                </div>
              ` : ''}

              ${orderData.orderNotes ? `
                <div class="order-info">
                  <h3>Order Notes</h3>
                  <p>${orderData.orderNotes}</p>
                </div>
              ` : ''}

              <div class="footer">
                <p>We'll send you another email when your order ships.</p>
                <p>If you have any questions, please contact us at info@manpasand.com</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Order confirmation email sent to ${orderData.customerEmail}`);
    } catch (error) {
      console.error('Error sending order confirmation email to customer:', error);
      // Don't throw error - email failure shouldn't break order creation
    }
  }

  /**
   * Send order notification email to admin
   */
  static async sendOrderNotificationToAdmin(orderData: OrderEmailData): Promise<void> {
    const mailOptions = {
      from: `"Pehnawa Boutique" <${EMAIL_USER}>`,
      to: ADMIN_EMAIL,
      subject: `New Order Received - ${orderData.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #F97316 0%, #FF6B35 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .order-item { padding: 10px; border-bottom: 1px solid #eee; }
            .order-item:last-child { border-bottom: none; }
            .total { font-size: 20px; font-weight: bold; color: #F97316; margin-top: 20px; }
            .alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Order Received!</h1>
              <p>Order Number: ${orderData.orderNumber}</p>
            </div>
            <div class="content">
              <div class="alert">
                <strong>Action Required:</strong> Please process this order and prepare for delivery.
              </div>

              <div class="order-info">
                <h2>Customer Information</h2>
                <p><strong>Name:</strong> ${orderData.customerName}</p>
                <p><strong>Email:</strong> ${orderData.customerEmail}</p>
                <p><strong>Phone:</strong> ${orderData.customerPhone}</p>
              </div>

              <div class="order-info">
                <h2>Shipping Address</h2>
                <p>${orderData.shippingAddress.address}</p>
                <p>${orderData.shippingAddress.city}${orderData.shippingAddress.postalCode ? `, ${orderData.shippingAddress.postalCode}` : ''}</p>
              </div>

              <div class="order-info">
                <h2>Order Items</h2>
                ${orderData.items.map(item => `
                  <div class="order-item">
                    <p><strong>${item.name}</strong> x ${item.quantity}</p>
                    <p>Rs. ${item.price.toLocaleString()} each = Rs. ${item.total.toLocaleString()}</p>
                  </div>
                `).join('')}
              </div>

              <div class="order-info">
                <p>Subtotal: Rs. ${orderData.subtotal.toLocaleString()}</p>
                <p>Shipping: ${orderData.shipping === 0 ? 'Free' : `Rs. ${orderData.shipping.toLocaleString()}`}</p>
                <p class="total">Total: Rs. ${orderData.total.toLocaleString()}</p>
                <p><strong>Payment Method:</strong> ${formatGuestPaymentMethod(orderData.paymentMethod)}</p>
              </div>

              ${orderData.orderNotes ? `
                <div class="order-info">
                  <h3>Customer Notes</h3>
                  <p>${orderData.orderNotes}</p>
                </div>
              ` : ''}
            </div>
          </div>
        </body>
        </html>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Order notification email sent to admin: ${ADMIN_EMAIL}`);
    } catch (error) {
      console.error('Error sending order notification email to admin:', error);
      // Don't throw error - email failure shouldn't break order creation
    }
  }

  /**
   * Send order confirmation emails to both customer and admin
   */
  static async sendOrderConfirmationEmails(orderData: OrderEmailData): Promise<void> {
    // Send emails in parallel (don't wait for both to complete)
    Promise.all([
      this.sendOrderConfirmationToCustomer(orderData),
      this.sendOrderNotificationToAdmin(orderData),
    ]).catch(error => {
      console.error('Error sending order confirmation emails:', error);
    });
  }
}

