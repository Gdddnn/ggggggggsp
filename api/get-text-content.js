// API 端点：从 Redis 获取文本内容
module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { key, section } = req.query;
    
    if (!key) {
      return res.status(400).json({ 
        success: false, 
        error: 'Key is required' 
      });
    }

    // 构建存储键
    const storageKey = section ? `${section}:${key}` : key;
    
    // 使用 Redis REST API 获取数据
    const redisUrl = process.env.STORAGE_REST_API_URL;
    const redisToken = process.env.STORAGE_REST_API_TOKEN;
    
    if (!redisUrl || !redisToken) {
      return res.status(500).json({ 
        success: false, 
        error: 'Redis configuration not found' 
      });
    }
    
    // 调用 Redis REST API
    const response = await fetch(`${redisUrl}/get/${encodeURIComponent(storageKey)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${redisToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Redis API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.value || '';
    
    console.log(`文本内容已获取: ${storageKey}`);
    
    return res.status(200).json({
      success: true,
      key: storageKey,
      content: content
    });
  } catch (error) {
    console.error('获取文本内容失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
