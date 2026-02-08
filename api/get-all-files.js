import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 列出所有以 public-videos/ 为前缀的文件（即所有上传的公共视频）
    const { blobs } = await list({
      prefix: 'public-videos/',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // 格式化返回数据（只保留关键信息）
    const fileList = blobs.map(blob => ({
      name: blob.pathname.split('/')[1].replace(/^\d+-/, ''), // 提取原文件名
      url: blob.url, // 视频访问URL
      size: blob.size, // 文件大小
      uploadTime: new Date(blob.uploadedAt).toLocaleString() // 上传时间
    }));

    return NextResponse.json({
      success: true,
      files: fileList
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

