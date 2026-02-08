
// 支持 Redis Labs 和 Vercel KV

const { createClient } = require('redis');

// Redis 客户端实例（全局缓存）
let redisClient = null;
let redisConnected = false;

// 获取 Redis 客户端
async function getRedisClient() {
  if (redisClient && redisConnected) {
    return redisClient;
  }
  
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }
  
  try {
    redisClient = createClient({
      url: redisUrl
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      redisConnected = false;
    });
    
    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
      redisConnected = true;
    });
    
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error('Redis Connection Error:', error);
    redisConnected = false;
    return null;
  }
}

module.exports = async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 获取 Redis 客户端
  const client = await getRedisClient();
  const redisAvailable = !!client;
  
  console.log('Redis 可用:', redisAvailable);

  try {
    // GET 请求 - 获取内容
    if (req.method === 'GET') {
      const { key, section, all } = req.query;
      
      console.log('GET 请求:', { key, section, all, redisAvailable });
      
      // 获取单个内容
      if (!key) {
        return res.status(400).json({ 
          success: false, 
          error: 'Key is required' 
        });
      }
      
      const storageKey = section ? `${section}:${key}` : key;
      
      // 如果 Redis 可用，从 Redis 获取
      if (redisAvailable) {
        try {
          const value = await client.get(storageKey);
          console.log('从 Redis 获取:', storageKey, value ? '有数据' : '无数据');
          return res.status(200).json({
            success: true,
            key: storageKey,
            content: value || ''
          });
        } catch (redisError) {
          console.error('Redis 获取失败:', redisError);
        }
      }
      
      // 如果 Redis 不可用或获取失败，返回空数据
      return res.status(200).json({
        success: true,
        key: storageKey,
        content: '',
        message: redisAvailable ? 'Redis error' : 'Redis not configured'
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
      
      console.log('POST 请求:', { key, section, contentLength: content ? content.length : 0, redisAvailable });
      
      if (!key || content === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: 'Key and content are required' 
        });
      }

      const storageKey = section ? `${section}:${key}` : key;
      
      // 如果 Redis 可用，保存到 Redis
      if (redisAvailable) {
        try {
          await client.set(storageKey, content);
          console.log('保存到 Redis:', storageKey);
          return res.status(200).json({
            success: true,
            message: '内容保存成功',
            key: storageKey
          });
        } catch (redisError) {
          console.error('Redis 保存失败:', redisError);
          return res.status(200).json({
            success: true,
            message: 'Redis save failed, use localStorage',
            key: storageKey
          });
        }
      }
      
      // 如果没有 Redis 配置，返回成功（让前端使用 localStorage）
      return res.status(200).json({
        success: true,
        message: 'Redis not configured, data should be saved to localStorage',
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

