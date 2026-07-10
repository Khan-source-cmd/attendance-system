/**
 * Universal Attendance System - Class Schedule Controller
 * Handles class scheduling for educational institutions
 */

const ClassSchedule = require('../models/ClassSchedule');
const { validationResult } = require('express-validator');

class ClassScheduleController {
    // Get teacher's schedule
    async getTeacherSchedule(req, res) {
        try {
            const teacherId = req.params.teacherId || req.user.digital_id;
            const { day, date } = req.query;
            
            let schedules;
            if (day) {
                // Get schedule for specific day of week
                schedules = await ClassSchedule.getTeacherDailySchedule(teacherId, parseInt(day));
            } else if (date) {
                // Get schedule for specific date
                const dayOfWeek = new Date(date).getDay();
                schedules = await ClassSchedule.findByTeacherId(teacherId, { dayOfWeek, date });
            } else {
                // Get all schedules
                schedules = await ClassSchedule.findByTeacherId(teacherId, { active: true });
            }
            
            res.json({
                success: true,
                schedules
            });
        } catch (error) {
            console.error('Error fetching teacher schedule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch schedule',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    // Get class schedule
    async getClassSchedule(req, res) {
        try {
            const { classId } = req.params;
            
            const schedules = await ClassSchedule.findByClassId(classId);
            
            res.json({
                success: true,
                schedules
            });
        } catch (error) {
            console.error('Error fetching class schedule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch class schedule',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    // Create new class schedule
    async createSchedule(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }
            
            const {
                class_id, teacher_id = req.user.digital_id, day_of_week,
                start_time, end_time, room_number, recurring = 1,
                start_date, end_date, notes
            } = req.body;
            
            // Check for schedule conflicts
            const conflicts = await ClassSchedule.checkConflicts(
                teacher_id, start_time, end_time, day_of_week
            );
            
            if (conflicts && conflicts.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Schedule conflict detected',
                    conflicts
                });
            }
            
            const scheduleData = {
                class_id, teacher_id, day_of_week, start_time, end_time,
                room_number, recurring, start_date, end_date, notes
            };
            
            const schedule = await ClassSchedule.create(scheduleData);
            
            res.status(201).json({
                success: true,
                message: 'Class schedule created successfully',
                schedule
            });
        } catch (error) {
            console.error('Error creating class schedule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create class schedule',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    // Update class schedule
    async updateSchedule(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: errors.array()
                });
            }
            
            const { id } = req.params;
            const {
                day_of_week, start_time, end_time, room_number,
                recurring, start_date, end_date, notes, is_active
            } = req.body;
            
            // Check if schedule exists
            const existingSchedule = await ClassSchedule.findById(id);
            if (!existingSchedule) {
                return res.status(404).json({
                    success: false,
                    message: 'Schedule not found'
                });
            }
            
            // Check if user has permission (teacher or admin)
            if (req.user.role !== 'admin' && existingSchedule.teacher_id !== req.user.digital_id) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to update this schedule'
                });
            }
            
            // Check for schedule conflicts if time or day changed
            if ((day_of_week && day_of_week !== existingSchedule.day_of_week) ||
                (start_time && start_time !== existingSchedule.start_time) ||
                (end_time && end_time !== existingSchedule.end_time)) {
                
                const conflicts = await ClassSchedule.checkConflicts(
                    existingSchedule.teacher_id,
                    start_time || existingSchedule.start_time,
                    end_time || existingSchedule.end_time,
                    day_of_week || existingSchedule.day_of_week,
                    id
                );
                
                if (conflicts && conflicts.length > 0) {
                    return res.status(409).json({
                        success: false,
                        message: 'Schedule conflict detected',
                        conflicts
                    });
                }
            }
            
            const scheduleData = {};
            if (day_of_week !== undefined) scheduleData.day_of_week = day_of_week;
            if (start_time !== undefined) scheduleData.start_time = start_time;
            if (end_time !== undefined) scheduleData.end_time = end_time;
            if (room_number !== undefined) scheduleData.room_number = room_number;
            if (recurring !== undefined) scheduleData.recurring = recurring;
            if (start_date !== undefined) scheduleData.start_date = start_date;
            if (end_date !== undefined) scheduleData.end_date = end_date;
            if (notes !== undefined) scheduleData.notes = notes;
            if (is_active !== undefined) scheduleData.is_active = is_active;
            
            scheduleData.updated_at = new Date().toISOString();
            
            const result = await ClassSchedule.update(id, scheduleData);
            
            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Schedule not found or no changes made'
                });
            }
            
            res.json({
                success: true,
                message: 'Schedule updated successfully',
                changes: result.changes
            });
        } catch (error) {
            console.error('Error updating class schedule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update schedule',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
    
    // Delete class schedule
    async deleteSchedule(req, res) {
        try {
            const { id } = req.params;
            
            // Check if schedule exists
            const existingSchedule = await ClassSchedule.findById(id);
            if (!existingSchedule) {
                return res.status(404).json({
                    success: false,
                    message: 'Schedule not found'
                });
            }
            
            // Check if user has permission (teacher or admin)
            if (req.user.role !== 'admin' && existingSchedule.teacher_id !== req.user.digital_id) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to delete this schedule'
                });
            }
            
            const result = await ClassSchedule.delete(id);
            
            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Schedule not found or already deleted'
                });
            }
            
            res.json({
                success: true,
                message: 'Schedule deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting class schedule:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete schedule',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new ClassScheduleController();