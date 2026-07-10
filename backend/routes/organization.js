/**
 * Universal Attendance System - Organization Routes
 * Handles organization management, codes, and settings
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Import middleware
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Get organization details (admin only)
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  req.db.get(`
    SELECT o.*, COUNT(u.digital_id) as user_count
    FROM organizations o
    LEFT JOIN users u ON o.id = u.organization_id AND u.is_active = 1
    WHERE o.id = ?
    GROUP BY o.id
  `, [organizationId], (err, org) => {
    if (err) {
      console.error("❌ Organization fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization" });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    // Parse organization data
    try {
      org.settings = org.settings ? JSON.parse(org.settings) : {};
      org.metadata = org.metadata ? JSON.parse(org.metadata) : {};
    } catch (parseErr) {
      console.error("❌ Organization data parse error:", parseErr);
      org.settings = {};
      org.metadata = {};
    }

    console.log(` Organization details fetched: ${org.name}`);
    res.json({ success: true, organization: org });
  });
});

// Get organization details (all authenticated users)
router.get('/details', authenticateToken, (req, res) => {
  const organizationId = req.user.organization_id;

  req.db.get(`
    SELECT o.id, o.name, o.type as industry, o.type, o.address, o.contact_email,
           COUNT(u.digital_id) as user_count
    FROM organizations o
    LEFT JOIN users u ON o.id = u.organization_id AND u.is_active = 1
    WHERE o.id = ?
    GROUP BY o.id
  `, [organizationId], (err, org) => {
    if (err) {
      console.error("❌ Organization details fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization details" });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    console.log(` Organization details fetched: ${org.name}`);
    res.json({ success: true, organization: org });
  });
});

// Update organization details
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { name, industry, address, phone, email, settings } = req.body;

  if (!name || !industry) {
    return res.status(400).json({ success: false, message: "Organization name and industry are required" });
  }

  const updateData = {
    name: name.trim(),
    industry: industry.trim(),
    address: address ? address.trim() : null,
    phone: phone ? phone.trim() : null,
    email: email ? email.trim() : null,
    settings: settings ? JSON.stringify(settings) : null,
    updated_at: new Date().toISOString()
  };

  const fields = Object.keys(updateData).filter(key => updateData[key] !== null);
  const values = fields.map(key => updateData[key]);
  const placeholders = fields.map(() => '?').join(', ');
  const setClause = fields.map(field => `${field} = ?`).join(', ');

  values.push(organizationId);

  req.db.run(`
    UPDATE organizations SET ${setClause}
    WHERE id = ?
  `, values, function(err) {
    if (err) {
      console.error("❌ Organization update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update organization" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    console.log(` Organization updated: ${name} by admin: ${req.user.digital_id}`);
    res.json({
      success: true,
      message: "Organization updated successfully",
      organization: updateData
    });
  });
});

// Generate new organization code
router.post('/generate-code', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { prefix = '', description = '' } = req.body;

  // Generate a unique code
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const code = prefix ? `${prefix.toUpperCase()}-${timestamp}-${random}` : `ORG-${timestamp}-${random}`;

  // Check if code already exists
  req.db.get('SELECT id FROM organization_codes WHERE code = ? AND organization_id = ?',
    [code, organizationId], (err, existing) => {
      if (err) {
        console.error("❌ Code existence check error:", err);
        return res.status(500).json({ success: false, message: "Failed to generate code" });
      }

      if (existing) {
        // Code already exists, generate a new one
        return generateUniqueCode(req, res, organizationId, prefix, description);
      }

      // Insert the new code
      const codeData = {
        organization_id: organizationId,
        code: code,
        description: description || `Generated code for ${new Date().toLocaleDateString()}`,
        created_by: req.user.digital_id,
        is_active: 1,
        usage_count: 0,
        max_uses: null, // Unlimited uses
        expires_at: null, // No expiration
        created_at: new Date().toISOString()
      };

      req.db.run(`
        INSERT INTO organization_codes (
          organization_id, code, description, created_by, is_active,
          usage_count, max_uses, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        codeData.organization_id,
        codeData.code,
        codeData.description,
        codeData.created_by,
        codeData.is_active,
        codeData.usage_count,
        codeData.max_uses,
        codeData.expires_at,
        codeData.created_at
      ], function(err) {
        if (err) {
          console.error("❌ Code generation error:", err);
          return res.status(500).json({ success: false, message: "Failed to generate organization code" });
        }

        console.log(` Organization code generated: ${code} for org: ${organizationId}`);
        res.json({
          success: true,
          message: "Organization code generated successfully",
          code: {
            id: this.lastID,
            code: code,
            description: codeData.description,
            created_at: codeData.created_at,
            is_active: true
          }
        });
      });
    });
});

// Helper function to generate unique code if collision occurs
function generateUniqueCode(req, res, organizationId, prefix, description) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(6).toString('hex').toUpperCase();
  const code = prefix ? `${prefix.toUpperCase()}-${timestamp}-${random}` : `ORG-${timestamp}-${random}`;

  const codeData = {
    organization_id: organizationId,
    code: code,
    description: description || `Generated code for ${new Date().toLocaleDateString()}`,
    created_by: req.user.digital_id,
    is_active: 1,
    usage_count: 0,
    max_uses: null,
    expires_at: null,
    created_at: new Date().toISOString()
  };

  req.db.run(`
    INSERT INTO organization_codes (
      organization_id, code, description, created_by, is_active,
      usage_count, max_uses, expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    codeData.organization_id,
    codeData.code,
    codeData.description,
    codeData.created_by,
    codeData.is_active,
    codeData.usage_count,
    codeData.max_uses,
    codeData.expires_at,
    codeData.created_at
  ], function(err) {
    if (err) {
      console.error("❌ Unique code generation error:", err);
      return res.status(500).json({ success: false, message: "Failed to generate unique organization code" });
    }

    console.log(` Unique organization code generated: ${code} for org: ${organizationId}`);
    res.json({
      success: true,
      message: "Organization code generated successfully",
      code: {
        id: this.lastID,
        code: code,
        description: codeData.description,
        created_at: codeData.created_at,
        is_active: true
      }
    });
  });
}

// Get all organization codes
router.get('/codes', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;
  const { limit = 50, offset = 0, active_only = false } = req.query;

  let query = `
    SELECT oc.*, u.name as created_by_name
    FROM organization_codes oc
    LEFT JOIN users u ON oc.created_by = u.digital_id
    WHERE oc.organization_id = ?
  `;
  let params = [organizationId];

  if (active_only === 'true') {
    query += ` AND oc.is_active = 1 AND (oc.expires_at IS NULL OR oc.expires_at > datetime('now'))`;
  }

  query += ` ORDER BY oc.created_at DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  req.db.all(query, params, (err, codes) => {
    if (err) {
      console.error("❌ Organization codes fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization codes" });
    }

    // Process codes
    const processedCodes = codes.map(code => ({
      ...code,
      is_expired: code.expires_at && new Date(code.expires_at) < new Date(),
      can_use: code.is_active && (!code.expires_at || new Date(code.expires_at) > new Date()) &&
               (!code.max_uses || code.usage_count < code.max_uses)
    }));

    console.log(` Organization codes fetched: ${codes.length} codes for org: ${organizationId}`);
    res.json({
      success: true,
      codes: processedCodes,
      meta: {
        total: codes.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        active_only: active_only === 'true'
      }
    });
  });
});

// Update organization code status
router.patch('/codes/:codeId', authenticateToken, requireAdmin, (req, res) => {
  const { codeId } = req.params;
  const organizationId = req.user.organization_id;
  const { is_active, description, max_uses, expires_at } = req.body;

  const updates = [];
  const params = [];

  if (typeof is_active === 'boolean') {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }

  if (max_uses !== undefined) {
    updates.push('max_uses = ?');
    params.push(max_uses);
  }

  if (expires_at !== undefined) {
    updates.push('expires_at = ?');
    params.push(expires_at);
  }

  if (updates.length === 0) {
    return res.status(400).json({ success: false, message: "No updates provided" });
  }

  params.push(codeId, organizationId);

  req.db.run(`
    UPDATE organization_codes SET ${updates.join(', ')}, updated_at = datetime('now')
    WHERE id = ? AND organization_id = ?
  `, params, function(err) {
    if (err) {
      console.error("❌ Code update error:", err);
      return res.status(500).json({ success: false, message: "Failed to update organization code" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization code not found" });
    }

    console.log(` Organization code updated: ${codeId} by admin: ${req.user.digital_id}`);
    res.json({
      success: true,
      message: "Organization code updated successfully"
    });
  });
});

// Delete organization code
router.delete('/codes/:codeId', authenticateToken, requireAdmin, (req, res) => {
  const { codeId } = req.params;
  const organizationId = req.user.organization_id;

  req.db.run(`
    DELETE FROM organization_codes
    WHERE id = ? AND organization_id = ?
  `, [codeId, organizationId], function(err) {
    if (err) {
      console.error("❌ Code deletion error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete organization code" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: "Organization code not found" });
    }

    console.log(` Organization code deleted: ${codeId} by admin: ${req.user.digital_id}`);
    res.json({
      success: true,
      message: "Organization code deleted successfully"
    });
  });
});

// Validate organization code (for user registration) - Alias endpoint
router.post('/validate-org-code', (req, res) => {
  const { code, industry_type } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: "Organization code is required" });
  }

  req.db.get(`
    SELECT oc.*, o.name as organization_name, o.type as organization_industry, o.contact_email as admin_email
    FROM organization_codes oc
    LEFT JOIN organizations o ON oc.organization_id = o.id
    WHERE UPPER(oc.code) = ? AND oc.is_active = 1
  `, [code.toUpperCase()], (err, codeData) => {
    if (err) {
      console.error("❌ Code validation error:", err);
      return res.status(500).json({ success: false, message: "Failed to validate code" });
    }

    if (!codeData) {
      return res.status(404).json({ success: false, message: "Invalid organization code" });
    }

    // Check if code is expired
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "Organization code has expired" });
    }

    // Check usage limit
    if (codeData.max_uses && codeData.usage_count >= codeData.max_uses) {
      return res.status(400).json({ success: false, message: "Organization code usage limit exceeded" });
    }

    console.log(` Organization code validated: ${code} for org: ${codeData.organization_name}`);
    res.json({
      success: true,
      message: "Organization code is valid",
      organization_name: codeData.organization_name,
      organization_id: codeData.organization_id,
      admin_name: codeData.admin_email ? codeData.admin_email.split('@')[0] : 'Organization Admin',
      organization: {
        id: codeData.organization_id,
        name: codeData.organization_name,
        industry: codeData.organization_industry
      },
      code: {
        id: codeData.id,
        description: codeData.description,
        usage_count: codeData.usage_count,
        max_uses: codeData.max_uses,
        expires_at: codeData.expires_at
      }
    });
  });
});

// Validate organization code (for user registration)
router.post('/validate-code', (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, message: "Organization code is required" });
  }

  req.db.get(`
    SELECT oc.*, o.name as organization_name, o.industry as organization_industry
    FROM organization_codes oc
    LEFT JOIN organizations o ON oc.organization_id = o.id
    WHERE oc.code = ? AND oc.is_active = 1
  `, [code.toUpperCase()], (err, codeData) => {
    if (err) {
      console.error("❌ Code validation error:", err);
      return res.status(500).json({ success: false, message: "Failed to validate code" });
    }

    if (!codeData) {
      return res.status(404).json({ success: false, message: "Invalid organization code" });
    }

    // Check if code is expired
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: "Organization code has expired" });
    }

    // Check usage limit
    if (codeData.max_uses && codeData.usage_count >= codeData.max_uses) {
      return res.status(400).json({ success: false, message: "Organization code usage limit exceeded" });
    }

    console.log(` Organization code validated: ${code} for org: ${codeData.organization_name}`);
    res.json({
      success: true,
      message: "Organization code is valid",
      organization: {
        id: codeData.organization_id,
        name: codeData.organization_name,
        industry: codeData.organization_industry
      },
      code: {
        id: codeData.id,
        description: codeData.description,
        usage_count: codeData.usage_count,
        max_uses: codeData.max_uses,
        expires_at: codeData.expires_at
      }
    });
  });
});

// Get basic organization info for regular users
router.get('/basic', authenticateToken, (req, res) => {
  const organizationId = req.user.organization_id;

  req.db.get(`
    SELECT o.id, o.name, o.type as industry, o.type, o.address, o.contact_email,
           COUNT(u.digital_id) as user_count
    FROM organizations o
    LEFT JOIN users u ON o.id = u.organization_id AND u.is_active = 1
    WHERE o.id = ?
    GROUP BY o.id
  `, [organizationId], (err, org) => {
    if (err) {
      console.error("❌ Basic organization fetch error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch organization" });
    }

    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    console.log(` Basic organization details fetched: ${org.name}`);
    res.json({ success: true, organization: org });
  });
});

// Get organization statistics
router.get('/stats', authenticateToken, requireAdmin, (req, res) => {
  const organizationId = req.user.organization_id;

  // Get various organization statistics
  const queries = {
    totalUsers: `SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1`,
    totalCodes: `SELECT COUNT(*) as count FROM organization_codes WHERE organization_id = ?`,
    activeCodes: `SELECT COUNT(*) as count FROM organization_codes WHERE organization_id = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    totalCodeUsage: `SELECT SUM(usage_count) as count FROM organization_codes WHERE organization_id = ?`,
    recentCodes: `SELECT COUNT(*) as count FROM organization_codes WHERE organization_id = ? AND created_at >= datetime('now', '-30 days')`
  };

  const stats = {};
  let completedQueries = 0;
  const totalQueries = Object.keys(queries).length;

  Object.entries(queries).forEach(([key, query]) => {
    req.db.get(query, [organizationId], (err, result) => {
      if (err) {
        console.error(`❌ Error fetching ${key}:`, err);
        stats[key] = 0;
      } else {
        stats[key] = result.count || 0;
      }

      completedQueries++;
      if (completedQueries === totalQueries) {
        console.log(` Organization stats fetched for org: ${organizationId}`);
        res.json({
          success: true,
          stats: stats,
          organization_id: organizationId
        });
      }
    });
  });
});

module.exports = router;
