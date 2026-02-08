// API 端点：保存文本内容到 Vercel KV
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 解析请求体
    let data;
    try {
      data = await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error('Invalid JSON'));
          }
        });
        req.on('error', reject);
      });
    } catch (parseError) {
      return res.status(400).json({ success: false, error: 'Invalid JSON format' });
    }

    const { key, content, section } = data;
    
    if (!key || content === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Key and content are required' 
      });
    }

    // 构建存储键
    const storageKey = section ? `${section}:${key}` : key;
    
    // 保存到 Vercel KV
    await kv.set(storageKey, content);
    
    console.log(`文本内容已保存: ${storageKey}`);
    
    return res.status(200).json({
      success: true,
      message: '内容保存成功',
      key: storageKey
    });
  } catch (error) {
    console.error('保存文本内容失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
