// api/upload.js
import { put } from '@vercel/blob';

export default function handler(req, res) {
  if (req.method === 'POST') {
    // 处理文件上传
    const formidable = require('formidable');
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return res.status(500).json({ error: 'Upload failed' });
      }

      const file = files.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fs = require('fs');
      const fileBuffer = fs.readFileSync(file.path);

      try {
        const blob = await put(file.name, fileBuffer, {
          access: 'public',
          contentType: file.type,
        });

        return res.json({
          url: blob.url,
          name: file.name,
          size: file.size,
          type: file.type,
        });
      } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({ error: 'Upload failed' });
      }
    });
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
