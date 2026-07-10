/**
 * Universal Attendance System - Attendance Management Module
 * Handles attendance tracking, QR scanning, GPS verification, and reporting
 */

class AttendanceManager {
    constructor() {
        this.currentLocation = null;
        this.watchId = null;
        this.qrScanner = null;
        this.isScanning = false;
        this.attendanceCache = new Map();
        this.syncQueue = [];
        this.offlineMode = false;
        this.geofences = [];
        this.loadGeofences();
    }

    // Initialize attendance system
    init() {
        this.setupLocationTracking();
        this.setupOfflineSync();
        this.loadCachedAttendance();
        this.setupGeofenceSync();
    }

    // Load geofences from localStorage
    loadGeofences() {
        try {
            const stored = localStorage.getItem('attendanceGeofences');
            if (stored) {
                this.geofences = JSON.parse(stored);
                console.log('Loaded geofences:', this.geofences);
            } else {
                this.geofences = [];
            }
        } catch (error) {
            console.error('Error loading geofences:', error);
            this.geofences = [];
        }
    }

    // Setup geofence synchronization
    setupGeofenceSync() {
        // Listen for geofence updates from admin dashboard
        window.addEventListener('geofenceUpdated', () => {
            console.log('Geofence update detected, reloading...');
            this.loadGeofences();
        });

        // Periodic reload to catch updates
        setInterval(() => {
            this.loadGeofences();
        }, 30000); // Check every 30 seconds
    }

    // Check if user is within geofence boundaries
    isWithinGeofence(userLat, userLng) {
        if (!this.geofences || this.geofences.length === 0) {
            console.log('No geofences configured, allowing attendance');
            return true; // No geofences means no restrictions
        }

        return this.geofences.some(fence => {
            if (!fence.active) {
                console.log('Geofence not active:', fence.name);
                return false;
            }

            const distance = this.calculateDistance(
                userLat, userLng,
                fence.center.lat, fence.center.lng
            );

            const withinBoundary = distance <= fence.radius;
            console.log(`Geofence "${fence.name}": distance=${distance.toFixed(2)}m, radius=${fence.radius}m, within=${withinBoundary}`);

            return withinBoundary;
        });
    }

    // Calculate distance between two points using Haversine formula
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distance in meters
    }

    // Manual punch in/out
    async punchAttendance(type, notes = '', forceOffline = false) {
        try {
            // Validate punch type
            if (!['in', 'out', 'break_start', 'break_end'].includes(type)) {
                throw new Error('Invalid punch type');
            }

            const attendanceData = {
                punch_type: type,
                timestamp: new Date().toISOString(),
                notes: notes,
                location_data: await this.getCurrentLocationData(),
                device_info: Utils.getDeviceInfo(),
                method: 'manual'
            };

            // Check if offline or force offline mode
            if (!navigator.onLine || forceOffline || this.offlineMode) {
                return this.saveOfflineAttendance(attendanceData);
            }

            loadingManager.show('punch', `Submitting ${type} attendance request...`);

            // For manual punches, create a pending request instead of immediate recording
            const response = await apiClient.post('/api/attendance/request', attendanceData);

            if (response.success) {
                // Update UI to show pending status
                this.updateAttendanceStatus('pending');

                app.showNotification('Manual punch request submitted for approval', 'info');

                // Dispatch custom event
                this.dispatchAttendanceEvent('manual_punch_requested', {
                    type: type,
                    timestamp: attendanceData.timestamp,
                    request_id: response.request_id,
                    data: response
                });

                return {
                    success: true,
                    message: 'Manual punch request submitted for approval',
                    request_id: response.request_id,
                    timestamp: attendanceData.timestamp,
                    pending: true
                };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Punch attendance error:', error);

            // Try to save offline if online request failed
            if (navigator.onLine) {
                app.showNotification('Failed to submit request. Saving offline...', 'warning');
                return this.saveOfflineAttendance(attendanceData);
            } else {
                app.showNotification(error.message || 'Failed to submit attendance request', 'error');
                throw error;
            }
        } finally {
            loadingManager.hide('punch');
        }
    }

    // GPS-based attendance with boundary validation
    async punchWithGPS(type, notes = '') {
        try {
            loadingManager.show('gps-punch', 'Getting your location and validating boundaries...');

            // Get current location
            const locationData = await this.getCurrentLocationData();
            if (!locationData) {
                throw new Error('Unable to get your current location. Please enable GPS and try again.');
            }

            // Check if user is within geofence boundaries
            const withinBoundary = this.isWithinGeofence(locationData.latitude, locationData.longitude);

            if (!withinBoundary) {
                // User is outside boundary - offer manual punch request
                const proceedWithManual = confirm(
                    '⚠️ LOCATION OUTSIDE BOUNDARY\n\n' +
                    'You are currently outside the allowed attendance area.\n\n' +
                    'Would you like to submit a manual punch request for admin approval instead?\n\n' +
                    'Note: Manual requests require administrator approval before being recorded.'
                );

                if (proceedWithManual) {
                    // Switch to manual punch request
                    loadingManager.hide('gps-punch');
                    return this.punchAttendance(type, notes + ' (GPS: Outside boundary - Manual request)', false);
                } else {
                    throw new Error('Attendance cancelled. You must be within the designated area to punch attendance.');
                }
            }

            // User is within boundary - proceed with GPS punch
            const attendanceData = {
                punch_type: type,
                timestamp: new Date().toISOString(),
                notes: notes || `GPS punch - Within boundary`,
                location_data: locationData,
                device_info: Utils.getDeviceInfo(),
                method: 'gps'
            };

            // Check if offline or force offline mode
            if (!navigator.onLine || this.offlineMode) {
                return this.saveOfflineAttendance(attendanceData);
            }

            const response = await apiClient.post('/api/punch-gps', attendanceData);

            if (response.success) {
                this.cacheAttendance(attendanceData);
                this.updateAttendanceStatus(type);

                app.showNotification(`GPS ${type} successful! Location verified within boundary.`, 'success');

                this.dispatchAttendanceEvent('gps_punch_success', {
                    type: type,
                    location: locationData,
                    timestamp: attendanceData.timestamp,
                    boundary_verified: true
                });

                return {
                    success: true,
                    message: `GPS ${type} successful! Location verified within boundary.`,
                    location: locationData,
                    boundary_verified: true
                };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('GPS punch error:', error);

            // If it's a boundary violation, don't try offline save
            if (error.message.includes('boundary') || error.message.includes('cancelled')) {
                app.showNotification(error.message, 'warning');
                throw error;
            }

            // For other GPS errors, try to save offline if online request failed
            if (navigator.onLine) {
                app.showNotification('GPS punch failed. Would you like to submit a manual request?', 'warning');

                const proceedWithManual = confirm(
                    'GPS attendance failed. Would you like to submit a manual punch request for admin approval instead?'
                );

                if (proceedWithManual) {
                    return this.punchAttendance(type, notes + ' (GPS failed - Manual request)', false);
                } else {
                    throw new Error('Attendance cancelled.');
                }
            } else {
                app.showNotification(error.message || 'GPS attendance failed', 'error');
                throw error;
            }
        } finally {
            loadingManager.hide('gps-punch');
        }
    }

    // QR Code attendance with boundary validation
    async punchWithQR(qrData, type) {
        try {
            loadingManager.show('qr-punch', 'Processing QR attendance and validating boundaries...');

            // Validate QR data
            let parsedQRData;
            try {
                parsedQRData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
            } catch (e) {
                throw new Error('Invalid QR code format');
            }

            // Verify QR code timestamp (check if not expired)
            const qrTimestamp = new Date(parsedQRData.timestamp);
            const now = new Date();
            const diffHours = (now - qrTimestamp) / (1000 * 60 * 60);

            if (diffHours > 24) { // QR code valid for 24 hours
                throw new Error('QR code has expired');
            }

            // Get current location for boundary validation
            const locationData = await this.getCurrentLocationData();
            if (!locationData) {
                throw new Error('Unable to get your current location. Please enable GPS and try again.');
            }

            // Check if user is within geofence boundaries
            const withinBoundary = this.isWithinGeofence(locationData.latitude, locationData.longitude);

            if (!withinBoundary) {
                // User is outside boundary - offer manual punch request
                const proceedWithManual = confirm(
                    '⚠️ LOCATION OUTSIDE BOUNDARY\n\n' +
                    'You are currently outside the allowed attendance area.\n\n' +
                    'Would you like to submit a manual punch request for admin approval instead?\n\n' +
                    'Note: Manual requests require administrator approval before being recorded.'
                );

                if (proceedWithManual) {
                    // Switch to manual punch request
                    loadingManager.hide('qr-punch');
                    return this.punchAttendance(type, 'QR scan - Outside boundary - Manual request', false);
                } else {
                    throw new Error('Attendance cancelled. You must be within the designated area to scan QR codes.');
                }
            }

            // User is within boundary - proceed with QR punch
            const attendanceData = {
                punch_type: type,
                qr_data: JSON.stringify(parsedQRData),
                location_data: locationData,
                timestamp: new Date().toISOString(),
                method: 'qr'
            };

            const response = await apiClient.post('/api/punch-qr', attendanceData);

            if (response.success) {
                this.cacheAttendance(attendanceData);
                this.updateAttendanceStatus(type);

                app.showNotification(`QR ${type} successful! Location verified within boundary.`, 'success');

                this.dispatchAttendanceEvent('qr_punch_success', {
                    type: type,
                    location: locationData,
                    timestamp: attendanceData.timestamp,
                    boundary_verified: true
                });

                return {
                    success: true,
                    message: `QR ${type} successful! Location verified within boundary.`,
                    location: locationData,
                    boundary_verified: true
                };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('QR punch error:', error);

            // If it's a boundary violation, don't try other fallbacks
            if (error.message.includes('boundary') || error.message.includes('cancelled')) {
                app.showNotification(error.message, 'warning');
                throw error;
            }

            // For other QR errors, try to save offline if online request failed
            if (navigator.onLine) {
                app.showNotification('QR punch failed. Would you like to submit a manual request?', 'warning');

                const proceedWithManual = confirm(
                    'QR attendance failed. Would you like to submit a manual punch request for admin approval instead?'
                );

                if (proceedWithManual) {
                    return this.punchAttendance(type, 'QR scan failed - Manual request', false);
                } else {
                    throw new Error('Attendance cancelled.');
                }
            } else {
                app.showNotification(error.message || 'QR attendance failed', 'error');
                throw error;
            }
        } finally {
            loadingManager.hide('qr-punch');
        }
    }

    // Start QR Scanner
    async startQRScanner(videoElement, onScan) {
        try {
            if (this.isScanning) {
                throw new Error('Scanner is already running');
            }

            // Check if browser supports camera
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported in this browser');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: "environment", // Use back camera on mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            videoElement.srcObject = stream;
            videoElement.play();

            this.isScanning = true;

            // Initialize QR scanner (using a QR library like jsQR)
            this.qrScanner = setInterval(() => {
                this.scanQRFromVideo(videoElement, onScan);
            }, 250); // Scan every 250ms

            return { success: true, message: 'Scanner started' };

        } catch (error) {
            console.error('QR scanner start error:', error);
            app.showNotification(error.message || 'Failed to start camera', 'error');
            throw error;
        }
    }

    // Stop QR Scanner
    stopQRScanner() {
        try {
            if (this.qrScanner) {
                clearInterval(this.qrScanner);
                this.qrScanner = null;
            }

            this.isScanning = false;

            // Stop camera stream
            const videoElements = document.querySelectorAll('video');
            videoElements.forEach(video => {
                if (video.srcObject) {
                    const tracks = video.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                    video.srcObject = null;
                }
            });

            return { success: true, message: 'Scanner stopped' };

        } catch (error) {
            console.error('QR scanner stop error:', error);
            throw error;
        }
    }

    // Scan QR from video (requires jsQR library)
    scanQRFromVideo(videoElement, onScan) {
        try {
            if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
                return;
            }

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            
            // This would require jsQR library
            // const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            // For now, simulate QR detection
            // In real implementation, you'd use jsQR or similar library
            
        } catch (error) {
            console.error('QR scan error:', error);
        }
    }

    // Get attendance history
    async getAttendanceHistory(limit = 50, offset = 0, dateRange = null) {
        try {
            loadingManager.show('history', 'Loading attendance history...');

            let endpoint = `/api/history?limit=${limit}&offset=${offset}`;
            
            if (dateRange) {
                endpoint += `&from=${dateRange.from}&to=${dateRange.to}`;
            }

            const response = await apiClient.get(endpoint);

            if (response.success) {
                // Cache history data
                this.cacheAttendanceHistory(response.history);
                
                return {
                    success: true,
                    history: response.history,
                    total: response.total || response.history.length
                };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Get history error:', error);
            
            // Try to return cached data if online request fails
            const cachedHistory = this.getCachedHistory();
            if (cachedHistory.length > 0) {
                app.showNotification('Showing cached attendance data', 'info');
                return {
                    success: true,
                    history: cachedHistory,
                    cached: true
                };
            }
            
            app.showNotification(error.message || 'Failed to load history', 'error');
            throw error;
        } finally {
            loadingManager.hide('history');
        }
    }

    // Get attendance statistics
    async getAttendanceStats(period = 'month') {
        try {
            const response = await apiClient.get(`/api/attendance_stats?period=${period}`);
            
            if (response.success) {
                return {
                    success: true,
                    stats: response.stats
                };
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('Get stats error:', error);
            
            // Calculate basic stats from cached data
            const cachedStats = this.calculateCachedStats(period);
            if (cachedStats) {
                app.showNotification('Showing estimated statistics', 'info');
                return {
                    success: true,
                    stats: cachedStats,
                    estimated: true
                };
            }
            
            throw error;
        }
    }

    // Location tracking
    async setupLocationTracking() {
        if (!navigator.geolocation) {
            console.warn('Geolocation not supported');
            return;
        }

        try {
            // Get current position
            const position = await this.getCurrentPosition();
            this.currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().toISOString()
            };

            // Watch position changes
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.currentLocation = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };
                },
                (error) => {
                    console.warn('Location tracking error:', error);
                },
                {
                    enableHighAccuracy: false,
                    timeout: 10000,
                    maximumAge: 300000 // 5 minutes
                }
            );

        } catch (error) {
            console.warn('Location setup error:', error);
        }
    }

    // Get current position as Promise
    getCurrentPosition(options = {}) {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 300000,
                ...options
            });
        });
    }

    // Get current location data
    async getCurrentLocationData() {
        if (this.currentLocation) {
            return this.currentLocation;
        }

        try {
            const position = await this.getCurrentPosition();
            return {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn('Could not get location:', error);
            return null;
        }
    }

    // Offline functionality
    saveOfflineAttendance(attendanceData) {
        try {
            const offlineData = {
                ...attendanceData,
                id: Utils.generateId(),
                offline: true,
                created_at: new Date().toISOString()
            };

            this.syncQueue.push(offlineData);
            this.saveSyncQueue();
            
            app.showNotification('Attendance saved offline. Will sync when online.', 'info');
            
            return {
                success: true,
                message: 'Attendance saved offline',
                offline: true,
                id: offlineData.id
            };

        } catch (error) {
            console.error('Save offline error:', error);
            throw error;
        }
    }

    // Setup offline sync
    setupOfflineSync() {
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this.offlineMode = false;
            app.showNotification('Connection restored. Syncing offline data...', 'info');
            this.syncOfflineData();
        });

        window.addEventListener('offline', () => {
            this.offlineMode = true;
            app.showNotification('Working offline. Data will sync when connection is restored.', 'warning');
        });

        // Load existing sync queue
        this.loadSyncQueue();
    }

    // Sync offline data
    async syncOfflineData() {
        if (this.syncQueue.length === 0) return;

        try {
            loadingManager.show('sync', 'Syncing offline attendance...');

            const synced = [];
            const failed = [];

            for (const data of this.syncQueue) {
                try {
                    const response = await apiClient.post('/api/punch', data);
                    if (response.success) {
                        synced.push(data.id);
                    } else {
                        failed.push(data.id);
                    }
                } catch (error) {
                    failed.push(data.id);
                }
            }

            // Remove synced items from queue
            this.syncQueue = this.syncQueue.filter(item => !synced.includes(item.id));
            this.saveSyncQueue();

            if (synced.length > 0) {
                app.showNotification(`Synced ${synced.length} attendance records`, 'success');
            }

            if (failed.length > 0) {
                app.showNotification(`Failed to sync ${failed.length} records`, 'warning');
            }

        } catch (error) {
            console.error('Sync error:', error);
            app.showNotification('Sync failed. Will retry later.', 'error');
        } finally {
            loadingManager.hide('sync');
        }
    }

    // Cache management
    cacheAttendance(attendanceData) {
        const cacheKey = `attendance_${Date.now()}`;
        this.attendanceCache.set(cacheKey, attendanceData);
        
        // Limit cache size
        if (this.attendanceCache.size > 100) {
            const firstKey = this.attendanceCache.keys().next().value;
            this.attendanceCache.delete(firstKey);
        }
        
        this.saveAttendanceCache();
    }

    cacheAttendanceHistory(history) {
        localStorage.setItem('cached_attendance_history', JSON.stringify({
            data: history,
            timestamp: new Date().toISOString()
        }));
    }

    getCachedHistory() {
        try {
            const cached = localStorage.getItem('cached_attendance_history');
            if (cached) {
                const parsed = JSON.parse(cached);
                // Return cached data if less than 1 hour old
                const age = Date.now() - new Date(parsed.timestamp).getTime();
                if (age < 3600000) { // 1 hour
                    return parsed.data;
                }
            }
        } catch (error) {
            console.error('Cache read error:', error);
        }
        return [];
    }

    calculateCachedStats(period) {
        const history = this.getCachedHistory();
        if (history.length === 0) return null;

        // Basic statistics calculation
        const now = new Date();
        let periodStart;

        switch (period) {
            case 'week':
                periodStart = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                break;
            case 'month':
                periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            default:
                periodStart = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        }

        const periodHistory = history.filter(record => 
            new Date(record.timestamp) >= periodStart
        );

        const totalDays = periodHistory.filter(r => r.punch_type === 'in').length;
        const totalHours = Math.round(totalDays * 8); // Estimate 8 hours per day
        const attendanceRate = Math.round((totalDays / 30) * 100); // Rough estimate

        return {
            total_days: totalDays,
            total_hours: totalHours,
            attendance_rate: attendanceRate,
            period: period,
            estimated: true
        };
    }

    // Storage helpers
    loadSyncQueue() {
        try {
            const stored = localStorage.getItem('attendance_sync_queue');
            if (stored) {
                this.syncQueue = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Load sync queue error:', error);
            this.syncQueue = [];
        }
    }

    saveSyncQueue() {
        try {
            localStorage.setItem('attendance_sync_queue', JSON.stringify(this.syncQueue));
        } catch (error) {
            console.error('Save sync queue error:', error);
        }
    }

    loadCachedAttendance() {
        try {
            const stored = localStorage.getItem('attendance_cache');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.attendanceCache = new Map(parsed);
            }
        } catch (error) {
            console.error('Load cache error:', error);
            this.attendanceCache = new Map();
        }
    }

    saveAttendanceCache() {
        try {
            const cacheArray = Array.from(this.attendanceCache.entries());
            localStorage.setItem('attendance_cache', JSON.stringify(cacheArray));
        } catch (error) {
            console.error('Save cache error:', error);
        }
    }

    // UI helpers
    updateAttendanceStatus(type) {
        // Update status indicators in UI
        const statusElements = document.querySelectorAll('[data-attendance-status]');
        statusElements.forEach(element => {
            element.textContent = type === 'in' ? 'Checked In' : 'Checked Out';
            element.className = `status-${type}`;
        });

        // Update last action time
        const timeElements = document.querySelectorAll('[data-last-action-time]');
        timeElements.forEach(element => {
            element.textContent = new Date().toLocaleTimeString();
        });
    }

    // Event dispatcher
    dispatchAttendanceEvent(eventName, data) {
        const event = new CustomEvent(eventName, { detail: data });
        document.dispatchEvent(event);
    }

    // Cleanup
    destroy() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
        }
        
        this.stopQRScanner();
        
        window.removeEventListener('online', this.syncOfflineData);
        window.removeEventListener('offline', () => {});
    }
}

// QR Code Generator (for admin)
class QRCodeGenerator {
    constructor() {
        this.defaultOptions = {
            width: 256,
            height: 256,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        };
    }

    // Generate QR code for location
    async generateLocationQR(locationData, validHours = 24) {
        try {
            const qrData = {
                type: 'attendance_location',
                location: locationData.name,
                coordinates: locationData.coordinates,
                org_id: locationData.org_id || 1,
                valid_until: new Date(Date.now() + (validHours * 60 * 60 * 1000)).toISOString(),
                created_at: new Date().toISOString()
            };

            // This would use a QR code generation library like qrcode.js
            // const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(qrData), this.defaultOptions);
            
            // For demo purposes, return a placeholder
            const qrCodeDataUrl = 'data:image/png;base64,placeholder_qr_code';

            return {
                success: true,
                qr_code: qrCodeDataUrl,
                data: qrData,
                valid_until: qrData.valid_until
            };

        } catch (error) {
            console.error('QR generation error:', error);
            throw error;
        }
    }
}

// Initialize attendance manager
const attendanceManager = new AttendanceManager();
const qrCodeGenerator = new QRCodeGenerator();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    attendanceManager.init();
});

// Export for global access
window.attendanceManager = attendanceManager;
window.qrCodeGenerator = qrCodeGenerator;
