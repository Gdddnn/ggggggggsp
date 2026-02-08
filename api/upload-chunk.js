import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

// 内存中的分块存储（仅用于演示，生产环境应使用持久存储）
const chunksMap = new Map();

export async function POST(request) {
  try {
    const formData = await request.formData();
    const fileChunk = formData.get('chunk');
    const filename = formData.get('filename');
    const chunkIndex = parseInt(formData.get('chunkIndex'));
    const totalChunks = parseInt(formData.get('totalChunks'));
    
    if (!fileChunk || !filename || isNaN(chunkIndex) || isNaN(totalChunks)) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    // 初始化分块存储
    if (!chunksMap.has(filename)) {
      chunksMap.set(filename, {
        chunks: new Array(totalChunks),
        totalChunks,
        receivedChunks: 0
      });
    }
    
    const fileData = chunksMap.get(filename);
    
    // 存储分块
    const chunkBuffer = await fileChunk.arrayBuffer();
    fileData.chunks[chunkIndex] = chunkBuffer;
    fileData.receivedChunks++;
    
    // 检查是否所有分块都已接收
    if (fileData.receivedChunks === totalChunks) {
      // 合并所有分块
      const totalSize = fileData.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
      const mergedBuffer = new Uint8Array(totalSize);
      
      let offset = 0;
      for (const chunk of fileData.chunks) {
        mergedBuffer.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }
      
      // 生成唯一文件名
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}-${filename}`;
      const filePath = `public-videos/${uniqueFilename}`;
      
      // 上传到 Vercel Blob
      const { url } = await put(filePath, mergedBuffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      
      // 清理内存
      chunksMap.delete(filename);
      
      return NextResponse.json({
        success: true,
        name: uniqueFilename,
        url: url,
        size: totalSize
      });
    } else {
      // 还有分块未接收
      return NextResponse.json({
        success: true,
        message: 'Chunk received',
        received: fileData.receivedChunks,
        total: totalChunks
      });
    }
    
  } catch (error) {
    console.error('Upload chunk error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
