// api/upload.js
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // 读取请求体
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // 获取文件名和类型
      const filename = req.headers['x-filename'] || 'uploaded-file';
      const contentType = req.headers['content-type'] || 'application/octet-stream';

      // 上传到 Vercel Blob
      const blob = await put(filename, buffer, {
        access: 'public',
        contentType,
      });

      return res.json({
        url: blob.url,
        name: filename,
        size: buffer.length,
        type: contentType,
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
