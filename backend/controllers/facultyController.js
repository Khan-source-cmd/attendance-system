/**
 * Universal Attendance System - Faculty Controller
 * Handles faculty operations for educational institutions
 */

const Faculty = require('../models/Faculty');
const { validationResult } = require('express-validator');

class FacultyController {
    // Get all faculty members
    async getAllFaculty(req, res) {
        try {
            const organizationId = req.query.organization_id || req.user.organization_id;
            const departmentId = req.query.department_id;
            const isActive = req.query.is_active !== undefined ? parseInt(req.query.is_active) : 1;
            
            const filters = { 
                organization_id: organizationId,
                is_active: isActive
            };
            
            if (departmentId) {
                filters.department_id = departmentId;
            }
            
            const faculty = await Faculty.findAll(filters);
            
            res.json({
                success: true,
                faculty
            });
        } catch (error) {
            console.error('Error fetching faculty:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch faculty members',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get faculty by ID
    async getFacultyById(req, res) {
        try {
            const facultyId = req.params.facultyId;
            const faculty = await Faculty.findByFacultyId(facultyId);
            
            if (!faculty) {
                return res.status(404).json({
                    success: false,
                    message: 'Faculty member not found'
                });
            }
            
            res.json({
                success: true,
                faculty
            });
        } catch (error) {
            console.error('Error fetching faculty member:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch faculty member',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Create new faculty member
    async createFaculty(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }
            
            const facultyData = req.body;
            const newFaculty = await Faculty.create(facultyData);
            
            res.status(201).json({
                success: true,
                message: 'Faculty member created successfully',
                faculty: newFaculty
            });
        } catch (error) {
            console.error('Error creating faculty member:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create faculty member',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Update faculty member
    async updateFaculty(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }
            
            const facultyId = req.params.facultyId;
            const facultyData = req.body;
            
            const result = await Faculty.update(facultyId, facultyData);
            
            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Faculty member not found or no changes made'
                });
            }
            
            res.json({
                success: true,
                message: 'Faculty member updated successfully',
                changes: result.changes
            });
        } catch (error) {
            console.error('Error updating faculty member:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update faculty member',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Associate faculty with class
    async associateWithClass(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }
            
            const { facultyId, classId } = req.params;
            const { role = 'instructor', is_primary = 1 } = req.body;
            
            const result = await Faculty.associateWithClass(facultyId, classId, role, is_primary);
            
            res.json({
                success: true,
                message: 'Faculty associated with class successfully',
                association: result
            });
        } catch (error) {
            console.error('Error associating faculty with class:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to associate faculty with class',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Remove faculty from class
    async removeFromClass(req, res) {
        try {
            const { facultyId, classId } = req.params;
            
            const result = await Faculty.removeFromClass(facultyId, classId);
            
            if (result.changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Faculty-class association not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Faculty removed from class successfully',
                changes: result.changes
            });
        } catch (error) {
            console.error('Error removing faculty from class:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove faculty from class',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get classes taught by faculty
    async getFacultyClasses(req, res) {
        try {
            const facultyId = req.params.facultyId;
            const classes = await Faculty.getClasses(facultyId);
            
            res.json({
                success: true,
                classes
            });
        } catch (error) {
            console.error('Error fetching faculty classes:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch faculty classes',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get faculty members for a class
    async getClassFaculty(req, res) {
        try {
            const classId = req.params.classId;
            const faculty = await Faculty.getClassFaculty(classId);
            
            res.json({
                success: true,
                faculty
            });
        } catch (error) {
            console.error('Error fetching class faculty:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch class faculty',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    // Get faculty statistics
    async getFacultyStatistics(req, res) {
        try {
            const facultyId = req.params.facultyId || req.user.digital_id;
            const stats = await Faculty.getStatistics(facultyId);
            
            res.json({
                success: true,
                statistics: stats
            });
        } catch (error) {
            console.error('Error fetching faculty statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch faculty statistics',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = new FacultyController();