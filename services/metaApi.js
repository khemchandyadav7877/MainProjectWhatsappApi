class MetaWhatsAppAPI {
    constructor(accessToken, phoneNumberId, businessAccountId) {
        this.accessToken = accessToken;
        this.phoneNumberId = phoneNumberId;
        this.businessAccountId = businessAccountId;
        this.baseUrl = 'https://graph.facebook.com/v18.0';
    }

    // Send template message using fetch
    async sendTemplateMessage(to, templateName, language = 'en', components = []) {
        try {
            const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
            
            const messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: language
                    },
                    components: components
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to send message');
            }

            return {
                success: true,
                messageId: data.messages?.[0]?.id,
                data: data
            };
        } catch (error) {
            console.error('Meta API Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Send text message
    async sendTextMessage(to, text) {
        try {
            const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
            
            const messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: 'text',
                text: {
                    preview_url: false,
                    body: text
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to send message');
            }

            return {
                success: true,
                messageId: data.messages?.[0]?.id,
                data: data
            };
        } catch (error) {
            console.error('Meta API Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Send media message
    async sendMediaMessage(to, mediaType, mediaUrl, caption = '') {
        try {
            const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;
            
            const messageData = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: to,
                type: mediaType,
                [mediaType]: {
                    link: mediaUrl
                }
            };

            if (caption && (mediaType === 'image' || mediaType === 'video')) {
                messageData[mediaType].caption = caption;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messageData)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to send media');
            }

            return {
                success: true,
                messageId: data.messages?.[0]?.id,
                data: data
            };
        } catch (error) {
            console.error('Meta API Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get message status
    async getMessageStatus(messageId) {
        try {
            const url = `${this.baseUrl}/${messageId}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to get status');
            }

            return {
                success: true,
                status: data.status,
                data: data
            };
        } catch (error) {
            console.error('Meta API Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Upload media to Meta
    async uploadMedia(fileBuffer, fileName, fileType) {
        try {
            const url = `${this.baseUrl}/${this.phoneNumberId}/media`;
            
            const formData = new FormData();
            formData.append('file', new Blob([fileBuffer]), fileName);
            formData.append('type', fileType);
            formData.append('messaging_product', 'whatsapp');

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to upload media');
            }

            return {
                success: true,
                mediaId: data.id,
                data: data
            };
        } catch (error) {
            console.error('Meta API Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get templates
    async getTemplates() {
        try {
            const url = `${this.baseUrl}/${this.businessAccountId}/message_templates`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error?.message || 'Failed to get templates');
            }

            return {
                success: true,
                templates: data.data,
                data: data
            };
        } catch (error) {
            console.error('Meta API Error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = MetaWhatsAppAPI;