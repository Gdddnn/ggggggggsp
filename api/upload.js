import multiparty from 'multiparty';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // 使用 multiparty 解析表单数据
    const form = new multiparty.Form();
    
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(request, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // 获取上传的文件
    const file = files.file?.[0];
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // 生成唯一文件名（添加时间戳防止重复）
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.originalFilename}`;
    const filePath = `public-videos/${fileName}`;

    // 上传到 Vercel Blob
    const { url } = await put(filePath, file.path, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      name: fileName,
      url: url,
      size: file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
