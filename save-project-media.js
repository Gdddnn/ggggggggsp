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

export async function POST(request) {
  try {
    const data = await request.json();
    const { projectId, mediaArray } = data;
    
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID is required' },
        { status: 400 }
      );
    }
    
    // 保存项目媒体数据
    projectMediaData[projectId] = mediaArray;
    console.log(`项目 ${projectId} 的媒体数据已保存到服务器，共 ${mediaArray.length} 个文件`);
    
    return NextResponse.json({
      success: true,
      message: '项目媒体数据保存成功'
    });
  } catch (error) {
    console.error('保存项目媒体数据失败:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
