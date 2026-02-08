// 从 Redis 获取项目数据
const { createClient } = require('redis');

// Redis 客户端实例
let redisClient = null;
let redisConnected = false;

// 默认项目数据
const defaultProjects = {
  'ai-works': {
    title: 'AI作品合集',
    description: '运用多种AI工具进行创意制作，包括可灵、即梦、豆包、通义、海螺、Sora等。涵盖视频生成、图像创作、文案优化等多个领域。通过AI技术提升创作效率，探索AI与内容创作的创新结合，产出高质量的数字媒体作品。',
    tags: ['AI生成', '创意制作', '数字媒体']
  },
  'danmei': {
    title: '大广赛作品《丹媚在，没意外》',
    description: '作为负责人和导演，统筹项目全流程，组建团队并制定执行计划。主导创意构思与脚本撰写，运用AI技术（可灵、即梦、豆包、通义、海螺、Sora）完成成片制作，把控作品风格与质量。作品获全国大学生广告艺术大赛三等奖。',
    tags: ['AI制作', '视频剪辑', '广告创意']
  },
  'wansheng': {
    title: '毕业联合作品《万物生》',
    description: '担任负责人/导演/摄像，统筹项目全流程，牵头组建跨专业创作团队，制定执行计划与分工。同时对接学校推进项目申报与合约签订。成功推动项目获校级立项并与学校签订合作合约，获得专项支持。',
    tags: ['导演', '摄像', '项目管理']
  },
  'guoshu': {
    title: '自媒体运营｜果蔬瓶🍎',
    description: '负责账号内容策划、拍摄剪辑与平台运营，担任导演/拍摄/剪辑/出镜。通过后台数据分析，优化标题/标签提升曝光。同期策划并拍摄品牌广告内容。成果：一周内粉丝破千，小红书均浏览2k+、抖音均浏览10w+；广告获小红书1w+浏览/5k+点赞、抖音100w+浏览。',
    tags: ['自媒体', '内容运营', '短视频']
  },
  'professor': {
    title: '教授助理工作',
    description: '协助教授开展学术研究，负责选题调研、资料筛选核查、文章逻辑框架搭建及初稿撰写；多篇文章成功发表于国家级刊物《中国报道》。主导《华人世界》杂志封面创意设计、内页版面排版，统筹视觉风格统一。',
    tags: ['学术研究', '视觉设计', '期刊编辑']
  }
};

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
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // 获取 Redis 客户端
    const client = await getRedisClient();
    
    if (client) {
      // 从 Redis 获取项目数据
      try {
        const data = await client.get('projects');
        if (data) {
          console.log('从 Redis 获取项目数据成功');
          return res.status(200).json({
            success: true,
            projects: JSON.parse(data)
          });
        }
      } catch (redisError) {
        console.error('从 Redis 获取项目数据失败:', redisError);
      }
    }
    
    // 如果 Redis 不可用或没有数据，返回默认数据
    console.log('返回默认项目数据');
    return res.status(200).json({
      success: true,
      projects: defaultProjects
    });
  } catch (error) {
    console.error('获取项目数据失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
