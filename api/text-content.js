// API 端点：文本内容管理（保存、获取单个、获取所有）
module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 获取 Redis 配置（支持多种环境变量名称）
  const redisUrl = process.env.STORAGE_REST_API_URL || 
                   process.env.KV_REST_API_URL || 
                   process.env.REDIS_URL;
  const redisToken = process.env.STORAGE_REST_API_TOKEN || 
                     process.env.KV_REST_API_TOKEN || 
                     process.env.REDIS_TOKEN;
  
  console.log('Redis URL:', redisUrl ? '已配置' : '未配置');
  console.log('Redis Token:', redisToken ? '已配置' : '未配置');
  console.log('环境变量检查:', {
    STORAGE_REST_API_URL: process.env.STORAGE_REST_API_URL ? '存在' : '不存在',
    KV_REST_API_URL: process.env.KV_REST_API_URL ? '存在' : '不存在',
    REDIS_URL: process.env.REDIS_URL ? '存在' : '不存在',
    STORAGE_REST_API_TOKEN: process.env.STORAGE_REST_API_TOKEN ? '存在' : '不存在',
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? '存在' : '不存在',
    REDIS_TOKEN: process.env.REDIS_TOKEN ? '存在' : '不存在'
  });
  
  if (!redisUrl || !redisToken) {
    return res.status(500).json({ 
      success: false, 
      error: 'Redis configuration not found. Please check environment variables.' 
    });
  }

  try {
    // GET 请求 - 获取内容
    if (req.method === 'GET') {
      const { key, section, all } = req.query;
      
      console.log('GET 请求:', { key, section, all });
      
      // 获取所有内容
      if (all === 'true') {
        // 获取所有键
        const keysResponse = await fetch(`${redisUrl}/keys/*`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${redisToken}` }
        });
        
        if (!keysResponse.ok) {
          throw new Error(`Redis API error: ${keysResponse.status}`);
        }
        
        const keysData = await keysResponse.json();
        const allKeys = keysData.value || [];
        
        // 如果指定了 section，则过滤键
        const keys = section 
          ? allKeys.filter(k => k.startsWith(`${section}:`))
          : allKeys;
        
        // 获取所有内容
        const contents = {};
        for (const k of keys) {
          const response = await fetch(`${redisUrl}/get/${encodeURIComponent(k)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${redisToken}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            const displayKey = section ? k.replace(`${section}:`, '') : k;
            contents[displayKey] = data.value || '';
          }
        }
        
        return res.status(200).json({
          success: true,
          contents: contents
        });
      }
      
      // 获取单个内容
      if (!key) {
        return res.status(400).json({ 
          success: false, 
          error: 'Key is required' 
        });
      }
      
      const storageKey = section ? `${section}:${key}` : key;
      
      console.log('获取单个内容:', storageKey);
      
      const response = await fetch(`${redisUrl}/get/${encodeURIComponent(storageKey)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${redisToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`Redis API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('获取到的数据:', data);
      
      return res.status(200).json({
        success: true,
        key: storageKey,
        content: data.value || ''
      });
    }
    
    // POST 请求 - 保存内容
    if (req.method === 'POST') {
      // 解析请求体
      let data;
      try {
        data = await new Promise((resolve, reject) => {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try { resolve(JSON.parse(body)); } 
            catch (err) { reject(new Error('Invalid JSON')); }
          });
          req.on('error', reject);
        });
      } catch (parseError) {
        return res.status(400).json({ success: false, error: 'Invalid JSON format' });
      }

      const { key, content, section } = data;
      
      console.log('POST 请求:', { key, section, contentLength: content ? content.length : 0 });
      
      if (!key || content === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: 'Key and content are required' 
        });
      }

      const storageKey = section ? `${section}:${key}` : key;
      
      console.log('保存到 Redis:', storageKey);
      
      // 调用 Redis REST API 保存数据
      const response = await fetch(`${redisUrl}/set/${encodeURIComponent(storageKey)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${redisToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: content })
      });
      
      if (!response.ok) {
        throw new Error(`Redis API error: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('保存结果:', result);
      
      return res.status(200).json({
        success: true,
        message: '内容保存成功',
        key: storageKey
      });
    }
    
    // 不支持的方法
    return res.status(405).json({ success: false, error: 'Method not allowed' });
    
  } catch (error) {
    console.error('API 错误:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
