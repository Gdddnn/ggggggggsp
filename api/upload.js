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
    
    // 检查文件大小（限制为500MB）
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (buffer.byteLength > maxSize) {
      return res.status(413).json(
        { success: false, error: 'File too large (maximum 500MB)' }
      );
    }
    
    // 从请求头获取文件名
    const filename = req.headers['x-filename'];
    if (!filename) {
      return res.status(400).json(
        { success: false, error: 'Filename is required' }
      );
    }
    
    // 生成唯一文件名（添加时间戳防止重复）
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    const filePath = `public-videos/${uniqueFilename}`;
    
    // 上传到 Vercel Blob
    const { url } = await put(filePath, buffer, {
      access: 'public',
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
