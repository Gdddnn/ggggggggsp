// API 端点：从 Redis 获取所有文本内容
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
    const { section } = req.query;
    
    // 使用 Redis REST API 获取所有键
    const redisUrl = process.env.STORAGE_REST_API_URL;
    const redisToken = process.env.STORAGE_REST_API_TOKEN;
    
    if (!redisUrl || !redisToken) {
      return res.status(500).json({ 
        success: false, 
        error: 'Redis configuration not found' 
      });
    }
    
    // 调用 Redis REST API 获取所有键
    const keysResponse = await fetch(`${redisUrl}/keys/*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${redisToken}`
      }
    });
    
    if (!keysResponse.ok) {
      throw new Error(`Redis API error: ${keysResponse.status}`);
    }
    
    const keysData = await keysResponse.json();
    const allKeys = keysData.value || [];
    
    // 如果指定了 section，则过滤键
    const keys = section 
      ? allKeys.filter(key => key.startsWith(`${section}:`))
      : allKeys;
    
    // 获取所有内容
    const contents = {};
    for (const key of keys) {
      const response = await fetch(`${redisUrl}/get/${encodeURIComponent(key)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${redisToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // 如果指定了 section，移除前缀
        const displayKey = section ? key.replace(`${section}:`, '') : key;
        contents[displayKey] = data.value || '';
      }
    }
    
    console.log(`获取了 ${Object.keys(contents).length} 条文本内容`);
    
    return res.status(200).json({
      success: true,
      contents: contents
    });
  } catch (error) {
    console.error('获取所有文本内容失败:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
