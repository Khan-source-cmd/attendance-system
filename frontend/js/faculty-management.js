/**
 * Universal Attendance System - Faculty Management
 * Handles faculty operations for educational institutions
 */

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:4000'
  : ''; // Use relative path for production (same domain)

// Authentication handling
function getAuthToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function getUserData() {
  return {
    token: getAuthToken(),
    digital_id: localStorage.getItem('digital_id') || sessionStorage.getItem('digital_id'),
    role: localStorage.getItem('role') || sessionStorage.getItem('role'),
    name: localStorage.getItem('name') || sessionStorage.getItem('name'),
    industry_type: localStorage.getItem('industry_type') || sessionStorage.getItem('industry_type'),
    organization_id: localStorage.getItem('organization_id') || sessionStorage.getItem('organization_id')
  };
}

// Faculty management functions
const FacultyManager = {
  // Load all faculty members
  loadFaculty: async function(filters = {}) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      let url = `${API_BASE}/api/faculty`;
      
      // Add filters to query string
      const queryParams = new URLSearchParams();
      if (filters.department_id) queryParams.append('department_id', filters.department_id);
      if (filters.is_active !== undefined) queryParams.append('is_active', filters.is_active);
      
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to load faculty members');
      }
      
      return data.faculty;
    } catch (error) {
      console.error('Error loading faculty:', error);
      showToast('error', `Failed to load faculty: ${error.message}`);
      return [];
    } finally {
      hideLoading();
    }
  },
  
  // Get faculty by ID
  getFacultyById: async function(facultyId) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/${facultyId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to load faculty member');
      }
      
      return data.faculty;
    } catch (error) {
      console.error('Error loading faculty member:', error);
      showToast('error', `Failed to load faculty member: ${error.message}`);
      return null;
    } finally {
      hideLoading();
    }
  },
  
  // Create new faculty member
  createFaculty: async function(facultyData) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(facultyData)
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to create faculty member');
      }
      
      showToast('success', 'Faculty member created successfully');
      return data.faculty;
    } catch (error) {
      console.error('Error creating faculty member:', error);
      showToast('error', `Failed to create faculty member: ${error.message}`);
      return null;
    } finally {
      hideLoading();
    }
  },
  
  // Update faculty member
  updateFaculty: async function(facultyId, facultyData) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/${facultyId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(facultyData)
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to update faculty member');
      }
      
      showToast('success', 'Faculty member updated successfully');
      return true;
    } catch (error) {
      console.error('Error updating faculty member:', error);
      showToast('error', `Failed to update faculty member: ${error.message}`);
      return false;
    } finally {
      hideLoading();
    }
  },
  
  // Associate faculty with class
  associateWithClass: async function(facultyId, classId, role = 'instructor', isPrimary = true) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/${facultyId}/classes/${classId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          role: role,
          is_primary: isPrimary ? 1 : 0
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to associate faculty with class');
      }
      
      showToast('success', 'Faculty associated with class successfully');
      return true;
    } catch (error) {
      console.error('Error associating faculty with class:', error);
      showToast('error', `Failed to associate faculty with class: ${error.message}`);
      return false;
    } finally {
      hideLoading();
    }
  },
  
  // Remove faculty from class
  removeFromClass: async function(facultyId, classId) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/${facultyId}/classes/${classId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to remove faculty from class');
      }
      
      showToast('success', 'Faculty removed from class successfully');
      return true;
    } catch (error) {
      console.error('Error removing faculty from class:', error);
      showToast('error', `Failed to remove faculty from class: ${error.message}`);
      return false;
    } finally {
      hideLoading();
    }
  },
  
  // Get classes taught by faculty
  getFacultyClasses: async function(facultyId) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/${facultyId}/classes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to load faculty classes');
      }
      
      return data.classes;
    } catch (error) {
      console.error('Error loading faculty classes:', error);
      showToast('error', `Failed to load faculty classes: ${error.message}`);
      return [];
    } finally {
      hideLoading();
    }
  },
  
  // Get faculty members for a class
  getClassFaculty: async function(classId) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/classes/${classId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to load class faculty');
      }
      
      return data.faculty;
    } catch (error) {
      console.error('Error loading class faculty:', error);
      showToast('error', `Failed to load class faculty: ${error.message}`);
      return [];
    } finally {
      hideLoading();
    }
  },
  
  // Get faculty statistics
  getFacultyStatistics: async function(facultyId) {
    try {
      showLoading();
      const token = getAuthToken();
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch(`${API_BASE}/api/faculty/${facultyId}/statistics`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to load faculty statistics');
      }
      
      return data.statistics;
    } catch (error) {
      console.error('Error loading faculty statistics:', error);
      showToast('error', `Failed to load faculty statistics: ${error.message}`);
      return null;
    } finally {
      hideLoading();
    }
  }
};

// UI Rendering Functions
function renderFacultyList(facultyList, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (!facultyList || facultyList.length === 0) {
    container.innerHTML = '<div class="alert alert-info">No faculty members found</div>';
    return;
  }
  
  let html = `
    <div class="table-responsive">
      <table class="table table-hover">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Position</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
  `;
  
  facultyList.forEach(faculty => {
    html += `
      <tr data-faculty-id="${faculty.id}">
        <td>${faculty.name}</td>
        <td>${faculty.email}</td>
        <td>${faculty.department_name || 'N/A'}</td>
        <td>${faculty.position || 'N/A'}</td>
        <td>
          <span class="badge ${faculty.is_active ? 'bg-success' : 'bg-danger'}">
            ${faculty.is_active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary view-faculty" data-faculty-id="${faculty.id}">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-outline-secondary edit-faculty" data-faculty-id="${faculty.id}">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-outline-info faculty-classes" data-faculty-id="${faculty.id}">
              <i class="fas fa-chalkboard-teacher"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Attach event listeners
  container.querySelectorAll('.view-faculty').forEach(btn => {
    btn.addEventListener('click', () => viewFacultyDetails(btn.dataset.facultyId));
  });
  
  container.querySelectorAll('.edit-faculty').forEach(btn => {
    btn.addEventListener('click', () => openEditFacultyModal(btn.dataset.facultyId));
  });
  
  container.querySelectorAll('.faculty-classes').forEach(btn => {
    btn.addEventListener('click', () => viewFacultyClasses(btn.dataset.facultyId));
  });
}

async function viewFacultyDetails(facultyId) {
  try {
    const faculty = await FacultyManager.getFacultyById(facultyId);
    if (!faculty) return;
    
    const modal = new bootstrap.Modal(document.getElementById('facultyDetailsModal'));
    const modalBody = document.getElementById('facultyDetailsBody');
    
    if (!modalBody) return;
    
    modalBody.innerHTML = `
      <div class="card">
        <div class="card-body">
          <h5 class="card-title">${faculty.name}</h5>
          <h6 class="card-subtitle mb-2 text-muted">${faculty.position || 'Faculty Member'}</h6>
          
          <div class="row mt-4">
            <div class="col-md-6">
              <p><strong>Email:</strong> ${faculty.email}</p>
              <p><strong>Department:</strong> ${faculty.department_name || 'N/A'}</p>
              <p><strong>Specialization:</strong> ${faculty.specialization || 'N/A'}</p>
            </div>
            <div class="col-md-6">
              <p><strong>Status:</strong> 
                <span class="badge ${faculty.is_active ? 'bg-success' : 'bg-danger'}">
                  ${faculty.is_active ? 'Active' : 'Inactive'}
                </span>
              </p>
              <p><strong>Joined:</strong> ${new Date(faculty.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    `;
    
    modal.show();
  } catch (error) {
    console.error('Error viewing faculty details:', error);
    showToast('error', 'Failed to load faculty details');
  }
}

async function openEditFacultyModal(facultyId) {
  try {
    const faculty = facultyId ? await FacultyManager.getFacultyById(facultyId) : null;
    
    const modal = new bootstrap.Modal(document.getElementById('editFacultyModal'));
    const form = document.getElementById('editFacultyForm');
    const titleEl = document.getElementById('editFacultyTitle');
    
    if (!form || !titleEl) return;
    
    // Update modal title
    titleEl.textContent = faculty ? 'Edit Faculty Member' : 'Add New Faculty Member';
    
    // Reset form
    form.reset();
    
    // Set form values if editing
    if (faculty) {
      form.elements['faculty-id'].value = faculty.id;
      form.elements['faculty-name'].value = faculty.name;
      form.elements['faculty-email'].value = faculty.email;
      form.elements['faculty-department'].value = faculty.department_id || '';
      form.elements['faculty-position'].value = faculty.position || '';
      form.elements['faculty-specialization'].value = faculty.specialization || '';
      form.elements['faculty-is-active'].checked = faculty.is_active;
    } else {
      form.elements['faculty-id'].value = '';
      form.elements['faculty-is-active'].checked = true;
    }
    
    modal.show();
  } catch (error) {
    console.error('Error opening faculty modal:', error);
    showToast('error', 'Failed to load faculty data');
  }
}

async function saveFaculty(event) {
  event.preventDefault();
  
  const form = event.target;
  const facultyId = form.elements['faculty-id'].value;
  
  const facultyData = {
    name: form.elements['faculty-name'].value,
    email: form.elements['faculty-email'].value,
    department_id: form.elements['faculty-department'].value || null,
    position: form.elements['faculty-position'].value || null,
    specialization: form.elements['faculty-specialization'].value || null,
    is_active: form.elements['faculty-is-active'].checked ? 1 : 0
  };
  
  try {
    let result;
    
    if (facultyId) {
      // Update existing faculty
      result = await FacultyManager.updateFaculty(facultyId, facultyData);
    } else {
      // Create new faculty
      result = await FacultyManager.createFaculty(facultyData);
    }
    
    if (result) {
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('editFacultyModal'));
      if (modal) modal.hide();
      
      // Reload faculty list
      loadFacultySection();
    }
  } catch (error) {
    console.error('Error saving faculty:', error);
    showToast('error', 'Failed to save faculty data');
  }
}

async function viewFacultyClasses(facultyId) {
  try {
    const faculty = await FacultyManager.getFacultyById(facultyId);
    const classes = await FacultyManager.getFacultyClasses(facultyId);
    
    if (!faculty) return;
    
    const modal = new bootstrap.Modal(document.getElementById('facultyClassesModal'));
    const modalTitle = document.getElementById('facultyClassesTitle');
    const modalBody = document.getElementById('facultyClassesBody');
    
    if (!modalTitle || !modalBody) return;
    
    modalTitle.textContent = `Classes for ${faculty.name}`;
    
    if (!classes || classes.length === 0) {
      modalBody.innerHTML = '<div class="alert alert-info">No classes assigned to this faculty member</div>';
      modal.show();
      return;
    }
    
    let html = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Class Name</th>
              <th>Subject</th>
              <th>Role</th>
              <th>Primary</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    classes.forEach(cls => {
      html += `
        <tr data-class-id="${cls.id}">
          <td>${cls.class_name}</td>
          <td>${cls.subject}</td>
          <td>${cls.role || 'Instructor'}</td>
          <td>
            <span class="badge ${cls.is_primary ? 'bg-primary' : 'bg-secondary'}">
              ${cls.is_primary ? 'Primary' : 'Secondary'}
            </span>
          </td>
          <td>
            <button class="btn btn-sm btn-outline-danger remove-class" 
                    data-faculty-id="${facultyId}" 
                    data-class-id="${cls.id}">
              <i class="fas fa-unlink"></i> Remove
            </button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
      <div class="mt-3">
        <button class="btn btn-primary" id="addClassToFaculty" data-faculty-id="${facultyId}">
          <i class="fas fa-plus"></i> Add Class
        </button>
      </div>
    `;
    
    modalBody.innerHTML = html;
    
    // Attach event listeners
    modalBody.querySelectorAll('.remove-class').forEach(btn => {
      btn.addEventListener('click', async () => {
        const facultyId = btn.dataset.facultyId;
        const classId = btn.dataset.classId;
        
        if (confirm('Are you sure you want to remove this class from the faculty member?')) {
          const result = await FacultyManager.removeFromClass(facultyId, classId);
          if (result) {
            viewFacultyClasses(facultyId); // Refresh the modal
          }
        }
      });
    });
    
    document.getElementById('addClassToFaculty').addEventListener('click', () => {
      openAddClassModal(facultyId);
    });
    
    modal.show();
  } catch (error) {
    console.error('Error viewing faculty classes:', error);
    showToast('error', 'Failed to load faculty classes');
  }
}

async function openAddClassModal(facultyId) {
  try {
    // Get all classes
    const response = await fetch(`${API_BASE}/api/classes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load classes');
    }
    
    // Get faculty's existing classes
    const facultyClasses = await FacultyManager.getFacultyClasses(facultyId);
    const existingClassIds = facultyClasses.map(c => c.id);
    
    // Filter out classes already assigned to faculty
    const availableClasses = data.classes.filter(c => !existingClassIds.includes(c.id));
    
    const modal = new bootstrap.Modal(document.getElementById('addClassModal'));
    const form = document.getElementById('addClassForm');
    const classSelect = document.getElementById('class-select');
    
    if (!form || !classSelect) return;
    
    // Reset form
    form.reset();
    form.elements['faculty-id'].value = facultyId;
    
    // Populate class select
    classSelect.innerHTML = '';
    if (availableClasses.length === 0) {
      classSelect.innerHTML = '<option value="">No available classes</option>';
      classSelect.disabled = true;
    } else {
      classSelect.disabled = false;
      classSelect.innerHTML = '<option value="">Select a class</option>';
      availableClasses.forEach(cls => {
        classSelect.innerHTML += `<option value="${cls.id}">${cls.class_name} - ${cls.subject}</option>`;
      });
    }
    
    modal.show();
  } catch (error) {
    console.error('Error opening add class modal:', error);
    showToast('error', 'Failed to load available classes');
  }
}

async function associateFacultyWithClass(event) {
  event.preventDefault();
  
  const form = event.target;
  const facultyId = form.elements['faculty-id'].value;
  const classId = form.elements['class-select'].value;
  const role = form.elements['faculty-role'].value;
  const isPrimary = form.elements['is-primary'].checked;
  
  if (!classId) {
    showToast('error', 'Please select a class');
    return;
  }
  
  try {
    const result = await FacultyManager.associateWithClass(facultyId, classId, role, isPrimary);
    
    if (result) {
      // Close modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('addClassModal'));
      if (modal) modal.hide();
      
      // Refresh faculty classes view
      viewFacultyClasses(facultyId);
    }
  } catch (error) {
    console.error('Error associating faculty with class:', error);
    showToast('error', 'Failed to associate faculty with class');
  }
}

// Initialize faculty management
async function loadFacultySection() {
  try {
    const facultyList = await FacultyManager.loadFaculty();
    renderFacultyList(facultyList, 'facultyListContainer');
  } catch (error) {
    console.error('Error loading faculty section:', error);
    showToast('error', 'Failed to load faculty data');
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the admin dashboard page
  if (document.getElementById('facultySection')) {
    // Initialize faculty section
    loadFacultySection();
    
    // Setup form submission handlers
    const editFacultyForm = document.getElementById('editFacultyForm');
    if (editFacultyForm) {
      editFacultyForm.addEventListener('submit', saveFaculty);
    }
    
    const addClassForm = document.getElementById('addClassForm');
    if (addClassForm) {
      addClassForm.addEventListener('submit', associateFacultyWithClass);
    }
    
    // Add faculty button
    const addFacultyBtn = document.getElementById('addFacultyBtn');
    if (addFacultyBtn) {
      addFacultyBtn.addEventListener('click', () => openEditFacultyModal());
    }
    
    // Filter form
    const facultyFilterForm = document.getElementById('facultyFilterForm');
    if (facultyFilterForm) {
      facultyFilterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const filters = {
          department_id: e.target.elements['filter-department'].value || null,
          is_active: e.target.elements['filter-status'].value !== '' ? 
            parseInt(e.target.elements['filter-status'].value) : undefined
        };
        
        const facultyList = await FacultyManager.loadFaculty(filters);
        renderFacultyList(facultyList, 'facultyListContainer');
      });
    }
  }
});