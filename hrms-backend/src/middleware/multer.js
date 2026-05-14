const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * Factory function to create specific multer uploaders
 * @param {string} folderName - The subfolder in the public/uploads directory
 * @param {Array} allowedTypes - Array of allowed mime types
 */
const createUploader = (folderName, allowedTypes) => {
    // We put it in 'public/uploads/...' so the frontend can access images directly via URL
    const uploadDir = path.join(__dirname, '../../public/uploads', folderName);
    
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, uploadDir);
        },
        filename: function (req, file, cb) {
            // Create a unique filename: timestamp + original name
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });

    const fileFilter = (req, file, cb) => {
        const isAllowed = allowedTypes.some(type => 
            file.mimetype.startsWith(type) || file.mimetype === type
        );

        if (isAllowed) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} are allowed.`), false);
        }
    };

    return multer({ 
        storage: storage,
        fileFilter: fileFilter,
        limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
    });
};

// ─── Export Specific Uploaders for different Modules ───

// 1. Your original medical document uploader
const uploadMedical = createUploader('medical_documents', ['image/', 'application/pdf']);

// 2. NEW: Profile Picture Uploader (Images only)
const uploadProfile = createUploader('profiles', ['image/']);

// 3. NEW: Official HR Documents (For Epic 2: EM-003 - IDs, Passports, CVs)
const uploadDocument = createUploader('hr_documents', ['image/', 'application/pdf']);

module.exports = {
    uploadMedical,
    uploadProfile,
    uploadDocument
};