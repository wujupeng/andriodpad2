package com.pad2.filemanager.update;

import android.content.Context;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;


import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "UpdatePlugin")
public class UpdatePlugin extends Plugin {
    private static final String TAG = "UpdatePlugin";
    private UpdateSmbClient smbClient = new UpdateSmbClient();
    private volatile boolean cancelDownload = false;

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
        cancelDownload = false;
        try {
            long totalSize = smbClient.getFileSize(remotePath);
            InputStream is = smbClient.getFileStream(remotePath);
            OutputStream os = new FileOutputStream(localPath);
            byte[] buf = new byte[8192];
            long downloaded = 0;
            int n;
            while ((n = is.read(buf)) != -1) {
                if (cancelDownload) { is.close(); os.close(); new File(localPath).delete(); call.reject("Download cancelled"); return; }
                os.write(buf, 0, n);
                downloaded += n;
                JSObject progress = new JSObject();
                progress.put("bytesDownloaded", downloaded);
                progress.put("totalBytes", totalSize);
                progress.put("percent", totalSize > 0 ? (downloaded * 100 / totalSize) : 0);
                notifyListeners("downloadProgress", progress);
            }
            is.close(); os.close();
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
        call.resolve();
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
}