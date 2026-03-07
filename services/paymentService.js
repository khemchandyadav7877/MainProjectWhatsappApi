class PaymentService {
    constructor() {
        this.apiKey = process.env.STRIPE_API_KEY || 'sk_test_your_key';
        this.baseUrl = 'https://api.stripe.com/v1';
    }

    // Create payment intent
    async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
        try {
            const url = `${this.baseUrl}/payment_intents`;
            
            const params = new URLSearchParams();
            params.append('amount', Math.round(amount * 100)); // Convert to cents
            params.append('currency', currency);
            params.append('metadata[campaignId]', metadata.campaignId || '');
            params.append('metadata[userId]', metadata.userId || '');

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to create payment');
            }

            return {
                success: true,
                clientSecret: data.client_secret,
                paymentIntentId: data.id,
                data: data
            };
        } catch (error) {
            console.error('Payment Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Confirm payment
    async confirmPayment(paymentIntentId, paymentMethodId) {
        try {
            const url = `${this.baseUrl}/payment_intents/${paymentIntentId}/confirm`;
            
            const params = new URLSearchParams();
            params.append('payment_method', paymentMethodId);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to confirm payment');
            }

            return {
                success: true,
                status: data.status,
                data: data
            };
        } catch (error) {
            console.error('Payment Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get payment status
    async getPaymentStatus(paymentIntentId) {
        try {
            const url = `${this.baseUrl}/payment_intents/${paymentIntentId}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to get payment status');
            }

            return {
                success: true,
                status: data.status,
                data: data
            };
        } catch (error) {
            console.error('Payment Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Refund payment
    async refundPayment(paymentIntentId, amount = null) {
        try {
            const url = `${this.baseUrl}/refunds`;
            
            const params = new URLSearchParams();
            params.append('payment_intent', paymentIntentId);
            if (amount) {
                params.append('amount', Math.round(amount * 100));
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: params
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to refund');
            }

            return {
                success: true,
                refundId: data.id,
                data: data
            };
        } catch (error) {
            console.error('Refund Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = PaymentService;