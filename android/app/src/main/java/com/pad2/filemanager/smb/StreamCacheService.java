package com.pad2.filemanager.smb;

import android.content.Context;
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
        File cacheDir = new File(context.getExternalFilesDir(null), CACHE_DIR);
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }

        String localFileName = new File(remotePath).getName();
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
        return new File(new File(context.getExternalFilesDir(null), CACHE_DIR), fileName);
    }

    public File getCacheDir() {
        return new File(context.getExternalFilesDir(null), CACHE_DIR);
    }

    public boolean checkCacheSpace(long requiredBytes) {
        File cacheDir = getCacheDir();
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