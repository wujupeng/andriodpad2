package com.pad2.filemanager.smb;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "SmbPlugin")
public class SmbPlugin extends Plugin {

    private SmbClient smbClient;
    private WpsDeliveryHandler wpsHandler;

    @Override
    public void load() {
        smbClient = new SmbClient();
        wpsHandler = new WpsDeliveryHandler(getContext(), smbClient);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host", "");
        String share = call.getString("share", "");
        String username = call.getString("username", "");
        String password = call.getString("password", "");
        String domain = call.getString("domain", "");

        try {
            smbClient.connect(host, share, username, password, domain);
            JSObject result = new JSObject();
            result.put("connected", true);
            result.put("host", host);
            result.put("share", share);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Connection failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        smbClient.disconnect();
        call.resolve();
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", smbClient.isConnected());
        call.resolve(result);
    }

    @PluginMethod
    public void listDirectory(PluginCall call) {
        String path = call.getString("path", "");
        try {
            List<Map<String, Object>> entries = smbClient.listDirectory(path);
            JSArray files = new JSArray();
            for (Map<String, Object> entry : entries) {
                JSObject fileObj = new JSObject();
                fileObj.put("name", entry.get("name"));
                fileObj.put("isDirectory", entry.get("isDirectory"));
                fileObj.put("size", entry.get("size"));
                fileObj.put("lastModified", entry.get("lastModified"));
                fileObj.put("path", entry.get("path"));
                files.put(fileObj);
            }
            JSObject result = new JSObject();
            result.put("files", files);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("List directory failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openInWps(PluginCall call) {
        String path = call.getString("path", "");
        try {
            Map<String, Object> result = wpsHandler.openFileInWps(path);
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Open in WPS failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkLocalFileChanged(PluginCall call) {
        Map<String, Object> result = wpsHandler.checkLocalFileChanged();
        JSObject ret = new JSObject();
        for (Map.Entry<String, Object> entry : result.entrySet()) {
            ret.put(entry.getKey(), entry.getValue());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void writeback(PluginCall call) {
        try {
            Map<String, Object> result = wpsHandler.writeback();
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Writeback failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkRemoteChanged(PluginCall call) {
        try {
            Map<String, Object> result = wpsHandler.checkRemoteChanged();
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : result.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Check remote changed failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getFileAttributes(PluginCall call) {
        String path = call.getString("path", "");
        try {
            Map<String, Object> attrs = smbClient.getFileAttributes(path);
            JSObject ret = new JSObject();
            for (Map.Entry<String, Object> entry : attrs.entrySet()) {
                ret.put(entry.getKey(), entry.getValue());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Get file attributes failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        wpsHandler.cleanup();
        call.resolve();
    }

    @PluginMethod
    public void writeTextFile(PluginCall call) {
        String path = call.getString("path", "");
        String content = call.getString("content", "");
        try {
            smbClient.writeTextFile(path, content);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", path);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Write text file failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void ensureDirectory(PluginCall call) {
        String path = call.getString("path", "");
        try {
            if (!smbClient.directoryExists(path)) {
                smbClient.createDirectory(path);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", path);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Ensure directory failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void exportLog(PluginCall call) {
        String logDir = call.getString("logDir", "apk/log");
        String content = call.getString("content", "");
        String fileName = call.getString("fileName", "");
        try {
            if (!smbClient.directoryExists(logDir)) {
                smbClient.createDirectory(logDir);
            }
            String fullPath = logDir + "/" + fileName;
            smbClient.writeTextFile(fullPath, content);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", fullPath);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Export log failed: " + e.getMessage());
        }
    }
}