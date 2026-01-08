import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload screenshot buffer to Cloudinary
 * @param buffer - Image buffer to upload
 * @returns Promise<string> - Public URL of uploaded image
 */
export async function uploadScreenshot(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: 'audit-screenshots',
      resource_type: 'image' as const,
      format: 'jpg',
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    };

    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Failed to upload screenshot: ${error.message}`));
          return;
        }

        if (!result || !result.secure_url) {
          reject(new Error('Cloudinary upload succeeded but no URL returned'));
          return;
        }

        resolve(result.secure_url);
      })
      .end(buffer);
  });
}

/**
 * Delete image from Cloudinary by URL
 * @param url - Cloudinary URL to delete
 */
export async function deleteScreenshot(url: string): Promise<void> {
  try {
    // Extract public_id from Cloudinary URL
    const publicIdMatch = url.match(/\/v\d+\/(.+)\.(jpg|jpeg|png|gif|webp)/);
    if (!publicIdMatch) {
      console.warn('Invalid Cloudinary URL format:', url);
      return;
    }

    const publicId = publicIdMatch[1];
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting screenshot from Cloudinary:', error);
    // Don't throw - deletion failure shouldn't break the flow
  }
}



