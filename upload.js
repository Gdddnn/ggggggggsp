// api/upload.js
import { put } from '@vercel/blob';
import multiparty from 'multiparty';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const form = new multiparty.Form();
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      });

      const file = files.file[0];
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fs = require('fs');
      const fileBuffer = fs.readFileSync(file.path);

      const blob = await put(file.originalFilename, fileBuffer, {
        access: 'public',
      });

      return res.json({
        url: blob.url,
        name: file.originalFilename,
        size: file.size,
        type: file.headers['content-type'],
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}