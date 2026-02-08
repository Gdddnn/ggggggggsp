// 模拟项目媒体数据存储
let projectMediaData = {
  'ai-works': [
    {
      type: 'video',
      name: '欧式ai.mp4',
      mimeType: 'video/mp4',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/%E6%AC%A7%E5%BC%8Fai.mp4',
      uploadTime: new Date().toISOString()
    },
    {
      type: 'video',
      name: 'ai1.mp4',
      mimeType: 'video/mp4',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/ai1.mp4',
      uploadTime: new Date().toISOString()
    }
  ]
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 获取查询参数
    const projectId = req.query.projectId;
    
    if (!projectId) {
      return res.status(400).json(
        { success: false, error: 'Project ID is required' }
      );
    }
    
    // 返回项目媒体数据
    const mediaArray = projectMediaData[projectId] || [];
    
    return res.status(200).json({
      success: true,
      mediaArray: mediaArray
    });
  } catch (error) {
    return res.status(500).json(
      { success: false, error: error.message }
    );
  }
};
