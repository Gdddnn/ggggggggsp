import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // 直接获取请求体作为 ReadableStream
    const body = request.body;
    
    // 从请求头获取文件名和内容类型
    const filename = request.headers.get('x-filename') || 'unknown-file';
    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    
    // 生成唯一文件名
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    const filePath = `public-videos/${uniqueFilename}`;
    
    // 上传到 Vercel Blob
    const { url } = await put(filePath, body, {
      access: 'public',
      contentType: contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN
    });
    
    // 返回成功响应
    return NextResponse.json({
      success: true,
      name: uniqueFilename,
      url: url,
      size: 0 // 注意：无法直接获取流的大小
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
