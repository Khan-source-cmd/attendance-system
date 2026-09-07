/**
 * Request Validation Middleware (using express-validator)
 */
const { body, validationResult } = require('express-validator');

const registerValidationRules = () => {
    return [
        body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
        body('email').isEmail().withMessage('Invalid email address'),
        body('phone').isMobilePhone().withMessage('Invalid phone number'),
        body('password').isLength({ min: 12 }).withMessage('Password must be at least 12 characters')
            .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
            .matches(/\d/).withMessage('Password must contain a number'),
        body('role').notEmpty().withMessage('Role is required'),
        body('industry_type').notEmpty().withMessage('Industry must be selected')
    ];
};

const loginValidationRules = () => {
    return [
        body('digital_id').notEmpty().withMessage('Digital ID is required'),
        body('password').notEmpty().withMessage('Password is required')
    ];
};

const validate = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

module.exports = {
    registerValidationRules,
    loginValidationRules,
    validate
};
