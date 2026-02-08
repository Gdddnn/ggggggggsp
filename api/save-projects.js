// 保存项目数据到 Redis
const { createClient } = require('redis');

// Redis 客户端实例
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
      return res.status(400).json(
        { success: false, error: 'Invalid JSON format' }
      );
    }

    // 获取 Redis 客户端
    const client = await getRedisClient();
    
    if (client) {
      // 保存到 Redis
      try {
        await client.set('projects', JSON.stringify(data));
        console.log('项目数据已保存到 Redis');
        return res.status(200).json({
          success: true,
          message: '项目数据保存成功'
        });
      } catch (redisError) {
        console.error('保存项目数据到 Redis 失败:', redisError);
        return res.status(500).json({
          success: false,
          error: 'Failed to save to Redis'
        });
      }
    } else {
      // Redis 不可用
      console.log('Redis 不可用，项目数据未保存');
      return res.status(200).json({
        success: true,
        message: 'Redis not available, data not saved to server'
      });
    }
  } catch (error) {
    console.error('保存项目数据失败:', error);
    return res.status(500).json(
      { success: false, error: error.message }
    );
  }
};
