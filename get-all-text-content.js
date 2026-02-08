// API 端点：从 Vercel KV 获取所有文本内容
const { kv } = require('@vercel/kv');

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
    
    // 获取所有键
    const allKeys = await kv.keys('*');
    
    // 如果指定了 section，则过滤键
    const keys = section 
      ? allKeys.filter(key => key.startsWith(`${section}:`))
      : allKeys;
    
    // 获取所有内容
    const contents = {};
    for (const key of keys) {
      const content = await kv.get(key);
      // 如果指定了 section，移除前缀
      const displayKey = section ? key.replace(`${section}:`, '') : key;
      contents[displayKey] = content || '';
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
