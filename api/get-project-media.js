import { NextResponse } from 'next/server';

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

export async function GET(request) {
  try {
    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }
    
    // 返回项目媒体数据
    const mediaArray = projectMediaData[projectId] || [];
    
    return NextResponse.json({
      success: true,
      mediaArray: mediaArray
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
