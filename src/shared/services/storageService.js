import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/config/firebase';
import imageCompression from 'browser-image-compression';

/**
 * Generic image uploader for Firebase Storage.
 * Accepts an array of File objects or existing URL strings.
 * - File objects → compressed to WebP, uploaded and returns new download URL
 * - Existing URL strings → returned as-is (edit mode passthrough)
 *
 * @param {Array<File|string>} files  - Files to upload or existing URLs
 * @param {string}             folder - Storage folder path (e.g. 'competitions', 'users')
 * @returns {Promise<string[]>}       - Array of download URLs
 */
export const uploadImages = async (files, folder) => {
  if (!files || files.length === 0) return [];

  const uploads = files.map(async (file) => {
    if (file instanceof File) {
      // Compress and convert to WebP before upload
      const options = {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp'
      };
      
      try {
        const compressedFile = await imageCompression(file, options);
        // Replace extension with .webp
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        const fileName = `${Date.now()}_${baseName}.webp`;
        
        const storageRef = ref(storage, `${folder}/${fileName}`);
        await uploadBytes(storageRef, compressedFile);
        return await getDownloadURL(storageRef);
      } catch (error) {
        console.error("Error compressing image:", error);
        // Fallback to original file if compression fails
        const fileName = `${Date.now()}_${file.name}`;
        const storageRef = ref(storage, `${folder}/${fileName}`);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
      }
    }
    // Already a URL string — pass through untouched
    return file;
  });

  return Promise.all(uploads);
};
