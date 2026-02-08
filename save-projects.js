import { NextResponse } from 'next/server';

// 模拟项目数据存储
let projectData = {
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

export async function POST(request) {
  try {
    const data = await request.json();
    if (data) {
      projectData = data;
      console.log('项目数据已保存到服务器');
      return NextResponse.json({
        success: true,
        message: '项目数据保存成功'
      });
    } else {
      return NextResponse.json(
        { success: false, error: 'No project data provided' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('保存项目数据失败:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
