package com.pad2.filemanager.update;

import android.content.Context;
import android.os.StatFs;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;


import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "UpdatePlugin")
public class UpdatePlugin extends Plugin {
    private static final String TAG = "UpdatePlugin";
    private UpdateSmbClient smbClient = new UpdateSmbClient();
    private volatile boolean cancelDownload = false;
    private String currentTmpPath = null;

    @PluginMethod
    public void connectToUpdateSource(PluginCall call) {
        String host = call.getString("host", "");
        String share = call.getString("share", "");
        String username = call.getString("username", "");
        String password = call.getString("password", "");
        String domain = call.getString("domain", "");
        try {
            smbClient.connect(host, share, username, password, domain);
            JSObject r = new JSObject();
            r.put("connected", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Connect failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnectUpdateSource(PluginCall call) {
        smbClient.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void readUpdateManifest(PluginCall call) {
        String path = call.getString("path", "apk/update.json");
        try {
            byte[] data = smbClient.readFile(path);
            String json = new String(data, "UTF-8");
            JSObject r = new JSObject();
            r.put("manifest", new JSObject(json));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Read manifest failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String remotePath = call.getString("path", "");
        String localDir = getContext().getExternalFilesDir(null).getAbsolutePath() + "/updates";
        String fileName = call.getString("fileName", "update.apk");
        new File(localDir).mkdirs();
        String localPath = localDir + "/" + fileName;
        String tmpPath = localPath + ".tmp";
        cancelDownload = false;
        currentTmpPath = tmpPath;
        try {
            long totalSize = smbClient.getFileSize(remotePath);
            File tmpFile = new File(tmpPath);
            long offset = 0;
            if (tmpFile.exists()) {
                long tmpSize = tmpFile.length();
                if (tmpSize > 0 && tmpSize < totalSize) {
                    offset = tmpSize;
                } else {
                    tmpFile.delete();
                }
            }
            InputStream is;
            if (offset > 0) {
                is = smbClient.getFileStream(remotePath, offset);
            } else {
                is = smbClient.getFileStream(remotePath);
            }
            OutputStream os = new FileOutputStream(tmpPath, offset > 0);
            byte[] buf = new byte[8192];
            long downloaded = offset;
            int n;
            while ((n = is.read(buf)) != -1) {
                if (cancelDownload) {
                    is.close(); os.close();
                    new File(tmpPath).delete();
                    call.reject("Download cancelled");
                    return;
                }
                os.write(buf, 0, n);
                downloaded += n;
                JSObject progress = new JSObject();
                progress.put("bytesDownloaded", downloaded);
                progress.put("totalBytes", totalSize);
                progress.put("percent", totalSize > 0 ? (downloaded * 100 / totalSize) : 0);
                notifyListeners("downloadProgress", progress);
            }
            is.close(); os.close();
            File tmp = new File(tmpPath);
            File dest = new File(localPath);
            if (!tmp.renameTo(dest)) {
                tmp.delete();
                currentTmpPath = null;
                call.reject("rename failed");
                return;
            }
            currentTmpPath = null;
            JSObject r = new JSObject();
            r.put("localPath", localPath);
            r.put("size", downloaded);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Download failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelDownload = true;
        if (currentTmpPath != null) {
            new File(currentTmpPath).delete();
            currentTmpPath = null;
        }
        call.resolve();
    }

    @PluginMethod
    public void checkDiskSpace(PluginCall call) {
        long requiredBytes = call.getLong("requiredBytes", 0L);
        File dir = new File(getContext().getExternalFilesDir(null).getAbsolutePath() + "/updates");
        dir.mkdirs();
        try {
            StatFs statFs = new StatFs(dir.getAbsolutePath());
            long free = statFs.getAvailableBytes();
            JSObject r = new JSObject();
            r.put("sufficient", free >= requiredBytes);
            r.put("freeBytes", free);
            call.resolve(r);
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("sufficient", false);
            r.put("freeBytes", 0);
            call.resolve(r);
        }
    }

    @PluginMethod
    public void cleanApk(PluginCall call) {
        String path = call.getString("path", "");
        boolean cleaned = true;
        try {
            File f = new File(path);
            if (f.exists() && !f.delete()) cleaned = false;
            File tmp = new File(path + ".tmp");
            if (tmp.exists() && !tmp.delete()) cleaned = false;
        } catch (Exception e) {
            cleaned = false;
        }
        JSObject r = new JSObject();
        r.put("cleaned", cleaned);
        call.resolve(r);
    }

    @PluginMethod
    public void calculateSha256(PluginCall call) {
        String localPath = call.getString("path", "");
        try {
            String hash = Sha256Calculator.calculate(localPath);
            JSObject r = new JSObject();
            r.put("sha256", hash);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("SHA-256 failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void verifySignature(PluginCall call) {
        String apkPath = call.getString("path", "");
        try {
            boolean ok = SignatureVerifier.verify(getContext(), getContext().getPackageName(), apkPath);
            JSObject r = new JSObject();
            r.put("verified", ok);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Signature verify failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void triggerInstall(PluginCall call) {
        String localPath = call.getString("path", "");
        boolean ok = InstallTrigger.triggerInstall(getContext(), localPath);
        JSObject r = new JSObject();
        r.put("launched", ok);
        if (ok) call.resolve(r);
        else call.reject("Install trigger failed");
    }

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        JSObject r = new JSObject();
        r.put("versionCode", CurrentVersionProvider.getVersionCode(getContext()));
        r.put("versionName", CurrentVersionProvider.getVersionName(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void readCredentialFile(PluginCall call) {
        try {
            File credFile = new File(getContext().getExternalFilesDir(null), "update_cred.json");
            if (!credFile.exists()) {
                JSObject r = new JSObject();
                r.put("found", false);
                call.resolve(r);
                return;
            }
            FileInputStream fis = new FileInputStream(credFile);
            byte[] buf = new byte[(int) credFile.length()];
            int read = 0;
            while (read < buf.length) {
                int n = fis.read(buf, read, buf.length - read);
                if (n == -1) break;
                read += n;
            }
            fis.close();
            String json = new String(buf, 0, read, "UTF-8");
            JSObject creds = new JSObject(json);
            creds.put("found", true);
            call.resolve(creds);
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("found", false);
            call.resolve(r);
        }
    }
}