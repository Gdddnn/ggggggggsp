const { put } = require('@vercel/blob');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 获取请求体作为 Buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    // 从请求头获取文件名和内容类型
    const filename = req.headers['x-filename'] || 'unknown-file';
    const contentType = req.headers['content-type'] || 'application/octet-stream';
    
    // 生成唯一文件名
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    const filePath = `public-videos/${uniqueFilename}`;
    
    // 上传到 Vercel Blob
    const { url } = await put(filePath, buffer, {
      access: 'public',
      contentType: contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // 返回成功响应
    return res.status(200).json({
      success: true,
      name: uniqueFilename,
      url: url,
      size: buffer.byteLength
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json(
      { success: false, error: error.message }
    );
  }
};
