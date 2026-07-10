/**
 * Universal Attendance System - Class Schedule Management
 * Handles class scheduling for educational institutions
 */

document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    checkAuthentication();
    
    // Initialize variables
    let currentUser = null;
    let allClasses = [];
    let allSchedules = [];
    let calendar = null;
    let currentScheduleId = null;
    
    // DOM elements
    const schedulesByDayEl = document.getElementById('schedulesByDay');
    const loadingSchedulesEl = document.getElementById('loadingSchedules');
    const scheduleSearchEl = document.getElementById('scheduleSearch');
    const filterAllBtn = document.getElementById('filterAll');
    const filterWeekdayBtn = document.getElementById('filterWeekday');
    const filterWeekendBtn = document.getElementById('filterWeekend');
    
    // Modal elements
    const addScheduleModal = new bootstrap.Modal(document.getElementById('addScheduleModal'));
    const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
    const scheduleForm = document.getElementById('scheduleForm');
    const scheduleIdInput = document.getElementById('scheduleId');
    const classSelectEl = document.getElementById('classSelect');
    const dayOfWeekEl = document.getElementById('dayOfWeek');
    const startTimeEl = document.getElementById('startTime');
    const endTimeEl = document.getElementById('endTime');
    const roomNumberEl = document.getElementById('roomNumber');
    const recurringEl = document.getElementById('recurring');
    const startDateEl = document.getElementById('startDate');
    const endDateEl = document.getElementById('endDate');
    const notesEl = document.getElementById('notes');
    const scheduleConflictAlertEl = document.getElementById('scheduleConflictAlert');
    const conflictMessageEl = document.getElementById('conflictMessage');
    const saveScheduleBtn = document.getElementById('saveScheduleBtn');
    const deleteScheduleBtn = document.getElementById('deleteScheduleBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    
    // Initialize the page
    initPage();
    
    // Event listeners
    scheduleSearchEl.addEventListener('input', filterSchedules);
    filterAllBtn.addEventListener('click', () => filterByDayType('all'));
    filterWeekdayBtn.addEventListener('click', () => filterByDayType('weekday'));
    filterWeekendBtn.addEventListener('click', () => filterByDayType('weekend'));
    saveScheduleBtn.addEventListener('click', saveSchedule);
    deleteScheduleBtn.addEventListener('click', showDeleteConfirmation);
    confirmDeleteBtn.addEventListener('click', deleteSchedule);
    
    // Tab change event for calendar initialization
    document.getElementById('calendar-tab').addEventListener('shown.bs.tab', function() {
        if (!calendar) {
            initializeCalendar();
        } else {
            calendar.render();
        }
    });
    
    // Initialize the page
    async function initPage() {
        try {
            // Get current user
            currentUser = await getCurrentUser();
            
            // Set user role in sidebar
            document.getElementById('userRole').textContent = `${currentUser.role} - ${currentUser.industry_type}`;
            
            // Load classes and schedules
            await Promise.all([
                loadClasses(),
                loadSchedules()
            ]);
            
            // Set default date for new schedules
            const today = new Date();
            startDateEl.value = today.toISOString().split('T')[0];
            
        } catch (error) {
            console.error('Error initializing page:', error);
            showToast('error', 'Failed to initialize page. Please refresh and try again.');
        }
    }
    
    // Load classes for the current teacher
    async function loadClasses() {
        try {
            const response = await fetch('/api/teacher/classes', {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch classes');
            }
            
            const data = await response.json();
            allClasses = data.classes || [];
            
            // Populate class select dropdown
            classSelectEl.innerHTML = '<option value="" selected disabled>Select a class</option>';
            allClasses.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls.id;
                option.textContent = `${cls.class_name} - ${cls.subject}`;
                classSelectEl.appendChild(option);
            });
            
        } catch (error) {
            console.error('Error loading classes:', error);
            showToast('error', 'Failed to load classes');
        }
    }
    
    // Load schedules for the current teacher
    async function loadSchedules() {
        try {
            loadingSchedulesEl.classList.remove('d-none');
            
            const response = await fetch(`/api/schedule/teacher`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch schedules');
            }
            
            const data = await response.json();
            allSchedules = data.schedules || [];
            
            // Display schedules
            displaySchedules(allSchedules);
            
        } catch (error) {
            console.error('Error loading schedules:', error);
            showToast('error', 'Failed to load schedules');
            loadingSchedulesEl.classList.add('d-none');
            schedulesByDayEl.innerHTML = `
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load schedules. Please try again.
                </div>
            `;
        }
    }
    
    // Display schedules grouped by day
    function displaySchedules(schedules) {
        loadingSchedulesEl.classList.add('d-none');
        
        if (schedules.length === 0) {
            schedulesByDayEl.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-calendar-x" style="font-size: 3rem; color: #6c757d;"></i>
                    <p class="mt-3">No schedules found. Click "Add New Schedule" to create one.</p>
                </div>
            `;
            return;
        }
        
        // Group schedules by day of week
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const schedulesByDay = {};
        
        dayNames.forEach(day => {
            schedulesByDay[day] = [];
        });
        
        schedules.forEach(schedule => {
            const dayName = dayNames[schedule.day_of_week];
            schedulesByDay[dayName].push(schedule);
        });
        
        // Create HTML for each day
        let html = '';
        
        dayNames.forEach(day => {
            const daySchedules = schedulesByDay[day];
            if (daySchedules.length > 0) {
                html += `
                    <div class="day-group" data-day="${day.toLowerCase()}">
                        <div class="day-header">
                            <i class="bi bi-calendar-day me-2"></i>${day}
                        </div>
                        <div class="row">
                `;
                
                daySchedules.forEach(schedule => {
                    const classInfo = allClasses.find(c => c.id === schedule.class_id) || {};
                    html += `
                        <div class="col-md-6 col-lg-4 mb-3">
                            <div class="card schedule-card ${day.toLowerCase()}" data-schedule-id="${schedule.id}">
                                <div class="card-body">
                                    <h5 class="card-title">${classInfo.class_name || 'Unknown Class'}</h5>
                                    <h6 class="card-subtitle mb-2 text-muted">${classInfo.subject || ''}</h6>
                                    <div class="time-slot mb-2">
                                        <i class="bi bi-clock me-1"></i>
                                        ${formatTime(schedule.start_time)} - ${formatTime(schedule.end_time)}
                                    </div>
                                    <div class="mb-2">
                                        <span class="badge room-badge">
                                            <i class="bi bi-geo-alt me-1"></i>
                                            ${schedule.room_number || 'No Room Assigned'}
                                        </span>
                                        ${schedule.recurring == 1 ? 
                                            '<span class="badge bg-info ms-1"><i class="bi bi-arrow-repeat me-1"></i>Weekly</span>' : 
                                            '<span class="badge bg-warning ms-1"><i class="bi bi-calendar-event me-1"></i>One-time</span>'}
                                    </div>
                                    ${schedule.notes ? `<p class="card-text small text-muted">${schedule.notes}</p>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            }
        });
        
        schedulesByDayEl.innerHTML = html;
        
        // Add click event to schedule cards
        document.querySelectorAll('.schedule-card').forEach(card => {
            card.addEventListener('click', () => {
                const scheduleId = card.dataset.scheduleId;
                openEditScheduleModal(scheduleId);
            });
        });
    }
    
    // Initialize FullCalendar
    function initializeCalendar() {
        const calendarEl = document.getElementById('scheduleCalendar');
        
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'timeGridWeek,timeGridDay'
            },
            slotMinTime: '07:00:00',
            slotMaxTime: '22:00:00',
            allDaySlot: false,
            height: 'auto',
            events: generateCalendarEvents(),
            eventClick: function(info) {
                // Extract schedule ID from the event
                const scheduleId = info.event.extendedProps.scheduleId;
                openEditScheduleModal(scheduleId);
            }
        });
        
        calendar.render();
    }
    
    // Generate events for FullCalendar from schedules
    function generateCalendarEvents() {
        const events = [];
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const colors = [
            '#dc3545', // Sunday - red
            '#0d6efd', // Monday - blue
            '#6610f2', // Tuesday - purple
            '#0dcaf0', // Wednesday - cyan
            '#198754', // Thursday - green
            '#ffc107', // Friday - yellow
            '#fd7e14'  // Saturday - orange
        ];
        
        allSchedules.forEach(schedule => {
            const classInfo = allClasses.find(c => c.id === schedule.class_id) || {};
            const dayIndex = parseInt(schedule.day_of_week);
            
            // Create a date for the current week with the correct day
            const date = new Date();
            const currentDay = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const daysToAdd = (dayIndex - currentDay + 7) % 7;
            date.setDate(date.getDate() + daysToAdd);
            
            // Format the date as YYYY-MM-DD
            const dateStr = date.toISOString().split('T')[0];
            
            events.push({
                title: `${classInfo.class_name || 'Class'} - ${schedule.room_number || 'No Room'}`,
                start: `${dateStr}T${schedule.start_time}`,
                end: `${dateStr}T${schedule.end_time}`,
                backgroundColor: colors[dayIndex],
                borderColor: colors[dayIndex],
                extendedProps: {
                    scheduleId: schedule.id,
                    className: classInfo.class_name,
                    subject: classInfo.subject,
                    room: schedule.room_number
                }
            });
        });
        
        return events;
    }
    
    // Filter schedules based on search input
    function filterSchedules() {
        const searchTerm = scheduleSearchEl.value.toLowerCase();
        
        if (!searchTerm) {
            // If search is empty, show all schedules
            document.querySelectorAll('.schedule-card').forEach(card => {
                card.closest('.col-md-6').style.display = 'block';
            });
            
            // Show all day groups that have visible schedules
            document.querySelectorAll('.day-group').forEach(group => {
                group.style.display = 'block';
            });
            
            return;
        }
        
        // Filter schedule cards
        document.querySelectorAll('.schedule-card').forEach(card => {
            const cardText = card.textContent.toLowerCase();
            const shouldShow = cardText.includes(searchTerm);
            card.closest('.col-md-6').style.display = shouldShow ? 'block' : 'none';
        });
        
        // Hide day groups with no visible schedules
        document.querySelectorAll('.day-group').forEach(group => {
            const visibleCards = group.querySelectorAll('.col-md-6[style="display: block"]');
            group.style.display = visibleCards.length > 0 ? 'block' : 'none';
        });
    }
    
    // Filter schedules by day type (all, weekday, weekend)
    function filterByDayType(type) {
        // Update active button
        [filterAllBtn, filterWeekdayBtn, filterWeekendBtn].forEach(btn => {
            btn.classList.remove('active', 'btn-secondary');
            btn.classList.add('btn-outline-secondary');
        });
        
        if (type === 'all') {
            filterAllBtn.classList.remove('btn-outline-secondary');
            filterAllBtn.classList.add('active', 'btn-secondary');
        } else if (type === 'weekday') {
            filterWeekdayBtn.classList.remove('btn-outline-secondary');
            filterWeekdayBtn.classList.add('active', 'btn-secondary');
        } else if (type === 'weekend') {
            filterWeekendBtn.classList.remove('btn-outline-secondary');
            filterWeekendBtn.classList.add('active', 'btn-secondary');
        }
        
        // Filter day groups
        document.querySelectorAll('.day-group').forEach(group => {
            const day = group.dataset.day.toLowerCase();
            
            if (type === 'all') {
                group.style.display = 'block';
            } else if (type === 'weekday') {
                group.style.display = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].includes(day) ? 'block' : 'none';
            } else if (type === 'weekend') {
                group.style.display = ['saturday', 'sunday'].includes(day) ? 'block' : 'none';
            }
        });
    }
    
    // Open modal to add a new schedule
    document.querySelector('[data-bs-target="#addScheduleModal"]').addEventListener('click', () => {
        resetScheduleForm();
        document.getElementById('addScheduleModalLabel').textContent = 'Add New Class Schedule';
        deleteScheduleBtn.classList.add('d-none');
        addScheduleModal.show();
    });
    
    // Open modal to edit an existing schedule
    function openEditScheduleModal(scheduleId) {
        const schedule = allSchedules.find(s => s.id == scheduleId);
        if (!schedule) return;
        
        currentScheduleId = scheduleId;
        document.getElementById('addScheduleModalLabel').textContent = 'Edit Class Schedule';
        
        // Fill form with schedule data
        scheduleIdInput.value = schedule.id;
        classSelectEl.value = schedule.class_id;
        dayOfWeekEl.value = schedule.day_of_week;
        startTimeEl.value = schedule.start_time;
        endTimeEl.value = schedule.end_time;
        roomNumberEl.value = schedule.room_number || '';
        recurringEl.value = schedule.recurring;
        startDateEl.value = schedule.start_date;
        endDateEl.value = schedule.end_date || '';
        notesEl.value = schedule.notes || '';
        
        // Show delete button for existing schedules
        deleteScheduleBtn.classList.remove('d-none');
        
        // Show the modal
        addScheduleModal.show();
    }
    
    // Reset schedule form
    function resetScheduleForm() {
        currentScheduleId = null;
        scheduleForm.reset();
        scheduleIdInput.value = '';
        scheduleConflictAlertEl.classList.add('d-none');
        
        // Set default date
        const today = new Date();
        startDateEl.value = today.toISOString().split('T')[0];
    }
    
    // Save schedule (create or update)
    async function saveSchedule() {
        try {
            // Validate form
            if (!scheduleForm.checkValidity()) {
                scheduleForm.reportValidity();
                return;
            }
            
            // Collect form data
            const scheduleData = {
                class_id: classSelectEl.value,
                day_of_week: dayOfWeekEl.value,
                start_time: startTimeEl.value,
                end_time: endTimeEl.value,
                room_number: roomNumberEl.value,
                recurring: recurringEl.value,
                start_date: startDateEl.value,
                notes: notesEl.value
            };
            
            if (endDateEl.value) {
                scheduleData.end_date = endDateEl.value;
            }
            
            // Disable save button and show loading
            saveScheduleBtn.disabled = true;
            saveScheduleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Saving...';
            
            let response;
            let url;
            let method;
            
            if (currentScheduleId) {
                // Update existing schedule
                url = `/api/schedule/${currentScheduleId}`;
                method = 'PUT';
            } else {
                // Create new schedule
                url = '/api/schedule';
                method = 'POST';
            }
            
            response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(scheduleData)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                // Check for schedule conflicts
                if (response.status === 409 && data.conflicts) {
                    scheduleConflictAlertEl.classList.remove('d-none');
                    let conflictMsg = 'Schedule conflicts with:';
                    data.conflicts.forEach(conflict => {
                        const classInfo = allClasses.find(c => c.id === conflict.class_id) || {};
                        conflictMsg += `<br>- ${classInfo.class_name || 'Class'} (${formatTime(conflict.start_time)} - ${formatTime(conflict.end_time)})`;
                    });
                    conflictMessageEl.innerHTML = conflictMsg;
                    throw new Error('Schedule conflict detected');
                } else {
                    throw new Error(data.message || 'Failed to save schedule');
                }
            }
            
            // Success
            showToast('success', currentScheduleId ? 'Schedule updated successfully' : 'New schedule created successfully');
            addScheduleModal.hide();
            
            // Reload schedules
            await loadSchedules();
            
            // Update calendar if initialized
            if (calendar) {
                calendar.removeAllEvents();
                calendar.addEventSource(generateCalendarEvents());
            }
            
        } catch (error) {
            console.error('Error saving schedule:', error);
            if (!error.message.includes('conflict')) {
                showToast('error', error.message || 'Failed to save schedule');
            }
        } finally {
            // Re-enable save button
            saveScheduleBtn.disabled = false;
            saveScheduleBtn.innerHTML = 'Save Schedule';
        }
    }
    
    // Show delete confirmation modal
    function showDeleteConfirmation() {
        deleteConfirmModal.show();
    }
    
    // Delete schedule
    async function deleteSchedule() {
        try {
            if (!currentScheduleId) return;
            
            // Disable delete button and show loading
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Deleting...';
            
            const response = await fetch(`/api/schedule/${currentScheduleId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || 'Failed to delete schedule');
            }
            
            // Success
            showToast('success', 'Schedule deleted successfully');
            deleteConfirmModal.hide();
            addScheduleModal.hide();
            
            // Reload schedules
            await loadSchedules();
            
            // Update calendar if initialized
            if (calendar) {
                calendar.removeAllEvents();
                calendar.addEventSource(generateCalendarEvents());
            }
            
        } catch (error) {
            console.error('Error deleting schedule:', error);
            showToast('error', error.message || 'Failed to delete schedule');
        } finally {
            // Re-enable delete button
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.innerHTML = 'Delete';
        }
    }
    
    // Helper function to format time (HH:MM)
    function formatTime(timeStr) {
        if (!timeStr) return '';
        
        try {
            const [hours, minutes] = timeStr.split(':');
            const hour = parseInt(hours);
            const period = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            return `${displayHour}:${minutes} ${period}`;
        } catch (e) {
            return timeStr;
        }
    }
    
    // Helper function to show toast notifications
    function showToast(type, message) {
        const toastContainer = document.querySelector('.toast-container') || createToastContainer();
        
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${type === 'success' ? 'success' : 'danger'} border-0`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        const bsToast = new bootstrap.Toast(toast, {
            autohide: true,
            delay: 5000
        });
        
        bsToast.show();
        
        // Remove toast after it's hidden
        toast.addEventListener('hidden.bs.toast', function() {
            toast.remove();
        });
    }
    
    // Create toast container if it doesn't exist
    function createToastContainer() {
        const container = document.createElement('div');
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1050';
        document.body.appendChild(container);
        return container;
    }
    
    // Helper function to get current user
    async function getCurrentUser() {
        try {
            const response = await fetch('/api/profile', {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch user profile');
            }
            
            const data = await response.json();
            return data.user;
            
        } catch (error) {
            console.error('Error getting current user:', error);
            return null;
        }
    }
});