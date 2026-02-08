// api/upload.js
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // 使用 FormData 解析
      const formData = await req.formData();
      const file = formData.get('file');

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // 读取文件为 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 上传到 Vercel Blob
      const blob = await put(file.name, buffer, {
        access: 'public',
        contentType: file.type,
      });

      return res.json({
        url: blob.url,
        name: file.name,
        size: buffer.length,
        type: file.type,
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
