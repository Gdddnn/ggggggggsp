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
  ],
  'danmei': [
    {
      type: 'video',
      name: 'danmei1.mp4',
      mimeType: 'video/mp4',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/danmei1.mp4',
      uploadTime: new Date().toISOString()
    },
    {
      type: 'video',
      name: 'danmei2.mp4',
      mimeType: 'video/mp4',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/danmei2.mp4',
      uploadTime: new Date().toISOString()
    },
    {
      type: 'video',
      name: 'DANMEI3.mp4',
      mimeType: 'video/mp4',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/DANMEI3.mp4',
      uploadTime: new Date().toISOString()
    }
  ],
  'wansheng': [
    {
      type: 'video',
      name: 'WANWUSHENG.mp4',
      mimeType: 'video/mp4',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/WANWUSHENG.mp4',
      uploadTime: new Date().toISOString()
    }
  ],
  'guoshu': [
    {
      type: 'image',
      name: '微信图片_20260207040335_7_5392.png',
      mimeType: 'image/png',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20260207040335_7_5392.png',
      uploadTime: new Date().toISOString()
    },
    {
      type: 'image',
      name: '微信图片_20260207040830_382_2.png',
      mimeType: 'image/png',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20260207040830_382_2.png',
      uploadTime: new Date().toISOString()
    }
  ],
  'professor': [
    {
      type: 'image',
      name: '微信图片_20260207041725_385_2.png',
      mimeType: 'image/png',
      size: 0,
      url: 'https://6qm3brhgv3zzrlyz.public.blob.vercel-storage.com/%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20260207041725_385_2.png',
      uploadTime: new Date().toISOString()
    }
  ]
};

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

    const { projectId, mediaArray } = data;
    
    if (!projectId) {
      return res.status(400).json(
        { success: false, error: 'Project ID is required' }
      );
    }
    
    // 保存项目媒体数据
    projectMediaData[projectId] = mediaArray;
    console.log(`项目 ${projectId} 的媒体数据已保存到服务器，共 ${mediaArray.length} 个文件`);
    
    return res.status(200).json({
      success: true,
      message: '项目媒体数据保存成功'
    });
  } catch (error) {
    console.error('保存项目媒体数据失败:', error);
    return res.status(500).json(
      { success: false, error: error.message }
    );
  }
};
