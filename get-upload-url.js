import { getUploadUrl } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { filename, contentType } = await request.json();
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename is required' },
        { status: 400 }
      );
    }
    
    // 生成唯一文件名（添加时间戳防止重复）
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    const filePath = `public-videos/${uniqueFilename}`;
    
    // 获取预签名上传 URL
    const { url, putBlob } = await getUploadUrl(filePath, {
      access: 'public',
      contentType: contentType || 'application/octet-stream',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // 返回成功响应
    return NextResponse.json({
      success: true,
      uploadUrl: url,
      filename: uniqueFilename,
      path: filePath
    });
  } catch (error) {
    console.error('Get upload URL error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
