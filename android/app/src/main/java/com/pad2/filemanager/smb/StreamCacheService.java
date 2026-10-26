package com.pad2.filemanager.smb;

import android.content.Context;
import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Map;

public class StreamCacheService {

    private static final String TAG = "StreamCacheService";
    private static final String CACHE_DIR = "smb_cache";
    private static final int CHUNK_SIZE = 8 * 1024 * 1024;

    private Context context;
    private SmbClient smbClient;

    public StreamCacheService(Context context, SmbClient smbClient) {
        this.context = context;
        this.smbClient = smbClient;
    }

    public Map<String, Object> streamToCache(String remotePath) throws IOException {
        File cacheDir = new File(Environment.getExternalStorageDirectory(), "PAD2/" + CACHE_DIR);
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }

        // SMB 风格路径以 '\' 分隔——Java File 分隔符为 '/'，getName() 会把
        // "dir\file.ext" 整串当文件名，缓存文件名含 '\' 被存储层拒（EPERM），
        // 子目录文件无法缓存打开（TASK-S5-01 发现的可复现阻断缺陷最小修复：
        // 归一分隔符后取末段文件名）。
        String localFileName = new File(remotePath.replace('\\', '/')).getName();
        File localFile = new File(cacheDir, localFileName);

        long startTime = System.currentTimeMillis();
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }

        long totalBytes = 0;
        byte[] buffer = new byte[CHUNK_SIZE];

        try (InputStream is = smbClient.readFileStream(remotePath);
             FileOutputStream fos = new FileOutputStream(localFile)) {
            int len;
            while ((len = is.read(buffer)) != -1) {
                fos.write(buffer, 0, len);
                digest.update(buffer, 0, len);
                totalBytes += len;
            }
        } catch (IOException e) {
            Log.e(TAG, "Streaming cache failed for " + remotePath, e);
            if (localFile.exists()) {
                localFile.delete();
            }
            throw e;
        }

        String sha256 = bytesToHex(digest.digest());
        long elapsed = System.currentTimeMillis() - startTime;

        Map<String, Object> result = new HashMap<>();
        result.put("localPath", localFile.getAbsolutePath());
        result.put("fileName", localFileName);
        result.put("size", totalBytes);
        result.put("sha256", sha256);
        result.put("elapsedMs", elapsed);
        result.put("chunkSize", CHUNK_SIZE);

        Log.i(TAG, String.format("Cached %s: %d bytes, SHA-256=%s, %dms",
                remotePath, totalBytes, sha256.substring(0, 16) + "...", elapsed));

        return result;
    }

    public File getCacheFile(String fileName) {
        return new File(new File(Environment.getExternalStorageDirectory(), "PAD2/" + CACHE_DIR), fileName);
    }

    public File getCacheDir() {
        return new File(Environment.getExternalStorageDirectory(), "PAD2/" + CACHE_DIR);
    }

    public boolean checkCacheSpace(long requiredBytes) {
        File cacheDir = getCacheDir();
        // 自愈：缓存目录被外部删除时 getUsableSpace() 对不存在路径返回 0，
        // 误报"缓存空间不足"并挡在 streamToCache 的 mkdirs 之前（死锁）。
        // 先确保目录存在再检查空间（TASK-S5-01 真机发现的可复现阻断缺陷最小修复）。
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        long available = cacheDir.getUsableSpace();
        return available >= requiredBytes;
    }

    public void clearCache() {
        File cacheDir = getCacheDir();
        if (cacheDir.exists()) {
            File[] files = cacheDir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (!f.getName().startsWith("~$") && !f.getName().endsWith(".tmp")) {
                        f.delete();
                    }
                }
            }
        }
    }

    public static String calculateSHA256(File file) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
        try (java.io.FileInputStream fis = new java.io.FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int len;
            while ((len = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, len);
            }
        }
        return bytesToHex(digest.digest());
    }

    public static String calculateSHA256FromStream(InputStream is) throws IOException {
        MessageDigest digest;
        try {
            digest = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
        byte[] buffer = new byte[8192];
        int len;
        while ((len = is.read(buffer)) != -1) {
            digest.update(buffer, 0, len);
        }
        is.close();
        return bytesToHex(digest.digest());
    }

    private static String bytesToHex(byte[] hash) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : hash) {
            String hex = Integer.toHexString(0xff & b);
            if (hex.length() == 1) hexString.append('0');
            hexString.append(hex);
        }
        return hexString.toString();
    }
}