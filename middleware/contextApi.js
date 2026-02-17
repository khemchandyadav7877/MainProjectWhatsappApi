// middleware/contextApi.js

class ContextApi {
    constructor(req, res) {
        this.req = req;
        this.res = res;
    }

    // ==================== USER METHODS ====================
    
    get user() {
        return this.req.session.user || null;
    }

    get isAuthenticated() {
        return !!this.req.session.user;
    }

    login(userData) {
        this.req.session.user = userData;
        this.showToast(`Welcome ${userData.firstName || userData.name || "User"}!`, 'success');
        return userData;
    }

    logout() {
        this.req.session.destroy((err) => {
            if (err) {
                console.error('Logout error:', err);
                this.showToast('Logout failed!', 'error');
            } else {
                this.showToast('Logged out successfully!', 'info');
            }
        });
    }

    updateUser(updatedData) {
        if (!this.user) {
            this.showToast('No user logged in!', 'error');
            return null;
        }

        const newUserData = { ...this.user, ...updatedData };
        this.req.session.user = newUserData;
        this.showToast('Profile updated!', 'success');
        return newUserData;
    }

    // ==================== FEATURES METHODS ====================
    
    getSidebarFeatures() {
        try {
            // MongoDB se features fetch karein
            // Temporary static data
            const userRole = this.user?.role || 'Guest';
            
            const featuresByRole = {
                'SuperAdmin': [
                    {
                        id: 'dashboard',
                        section: '*** Dashboard',
                        label: '1. Dashboard',
                        path: '/dashboard',
                        icon: 'fa-tachometer-alt',
                        order: 1
                    },
                    {
                        id: 'all-users',
                        section: '*** Users Management',
                        label: '1. All Users',
                        path: '/dashboard/allusers',
                        icon: 'fa-users',
                        order: 1
                    },
                    {
                        id: 'role-permissions',
                        section: '*** Administration',
                        label: '1. Role Permissions',
                        path: '/dashboard/role-permissions',
                        icon: 'fa-user-shield',
                        order: 1
                    },
                    {
                        id: 'whatsapp-scan',
                        section: '*** WhatsApp',
                        label: '1. WhatsApp Scan',
                        path: '/WhatsappScan',
                        icon: 'fa-whatsapp',
                        order: 1
                    }
                ],
                'Educator': [
                    {
                        id: 'dashboard',
                        section: '*** Dashboard',
                        label: '1. Dashboard',
                        path: '/dashboard',
                        icon: 'fa-tachometer-alt',
                        order: 1
                    },
                    {
                        id: 'whatsapp-scan',
                        section: '*** WhatsApp',
                        label: '1. WhatsApp Scan',
                        path: '/WhatsappScan',
                        icon: 'fa-whatsapp',
                        order: 1
                    }
                ],
                'Student': [
                    {
                        id: 'dashboard',
                        section: '*** Dashboard',
                        label: '1. Dashboard',
                        path: '/dashboard',
                        icon: 'fa-tachometer-alt',
                        order: 1
                    }
                ]
            };

            return featuresByRole[userRole] || [];
        } catch (error) {
            console.error('Error getting sidebar features:', error);
            return [];
        }
    }

    getFeatureStats() {
        const features = this.getSidebarFeatures();
        
        // Group by section
        const sections = [...new Set(features.map(f => f.section))];
        
        return {
            totalFeatures: features.length,
            totalSections: sections.length
        };
    }

    // ==================== TOAST METHODS ====================
    
    showToast(message, type = 'info') {
        this.req.flash('toast', message);
        this.req.flash('toastType', type);
        console.log(`[TOAST-${type.toUpperCase()}] ${message}`);
        return { message, type };
    }

    getToast() {
        const message = this.req.flash('toast');
        const type = this.req.flash('toastType');
        
        if (message.length > 0 && type.length > 0) {
            return {
                message: message[0],
                type: type[0]
            };
        }
        return null;
    }

    // ==================== HELPER METHODS ====================
    
    getRoleColor() {
        const colors = {
            'SuperAdmin': '#1013e0ff',
            'Educator': '#3b82f6',
            'Trainer': '#10b981',
            'Student': '#f59e0b'
        };
        return colors[this.user?.role] || '#6b7280';
    }

    getUserInitial() {
        if (!this.user) return 'G';
        return this.user.firstName?.charAt(0).toUpperCase() || 
               this.user.name?.charAt(0).toUpperCase() || 'U';
    }

    getSectionIcon(section) {
        const icons = {
            '*** Dashboard': 'fa-tachometer-alt',
            '*** Users Management': 'fa-users',
            '*** Administration': 'fa-shield-alt',
            '*** WhatsApp': 'fa-whatsapp',
            '*** Courses': 'fa-graduation-cap',
            '*** AI Tools': 'fa-robot',
            '*** Payments': 'fa-credit-card',
            '*** Settings': 'fa-cog'
        };
        return icons[section] || 'fa-folder';
    }

    // ==================== WHATSAPP CLIENTS ACCESS ====================
    
    getWhatsappClients() {
        return global.whatsappClients || {};
    }

    getWhatsappClientStatus() {
        const clients = this.getWhatsappClients();
        return Object.keys(clients).map(clientId => ({
            clientId,
            isConnected: clients[clientId]?.isConnected || false
        }));
    }
}

module.exports = ContextApi;