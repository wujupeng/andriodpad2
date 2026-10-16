package com.pad2.filemanager.smb;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.util.Log;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class FileAppResolver {

    private static final String TAG = "FileAppResolver";
    private static final String WPS_PACKAGE_PREFIX = "com.tencent.wps";
    private static final String[] WPS_PACKAGES = {
        "com.tencent.wps",
        "cn.wps.moffice_eng",
        "cn.wps.moffice"
    };

    private Context context;

    public FileAppResolver(Context context) {
        this.context = context;
    }

    public Map<String, Object> resolveApp(String fileName, Uri uri) {
        String mimeType = getMimeType(fileName);
        Intent intent = new Intent(Intent.ACTION_EDIT);
        intent.setDataAndType(uri, mimeType);

        PackageManager pm = context.getPackageManager();
        List<ResolveInfo> activities = pm.queryIntentActivities(intent, 0);

        Map<String, Object> result = new HashMap<>();
        result.put("mimeType", mimeType);
        result.put("availableApps", activities.size());

        if (activities.isEmpty()) {
            String wpsPkg = getWpsPackageName();
            if (wpsPkg != null) {
                result.put("resolved", true);
                result.put("packageName", wpsPkg);
                result.put("appName", "WPS Office");
                result.put("isWps", true);
                result.put("useExplicitPackage", true);
                result.put("fallback", true);
                Log.i(TAG, "queryIntentActivities empty, fallback to WPS: " + wpsPkg);
                return result;
            }
            result.put("resolved", false);
            result.put("reason", "no_app");
            result.put("suggestion", "请安装 WPS Office 以编辑此文件类型");
            Log.w(TAG, "No app found for " + mimeType);
            return result;
        }

        ResolveInfo wpsApp = findWpsApp(activities);
        if (wpsApp != null) {
            result.put("resolved", true);
            result.put("packageName", wpsApp.activityInfo.packageName);
            result.put("appName", "WPS Office");
            result.put("isWps", true);
            result.put("useExplicitPackage", true);
            Log.i(TAG, "Resolved to WPS: " + wpsApp.activityInfo.packageName);
        } else {
            ResolveInfo first = activities.get(0);
            result.put("resolved", true);
            result.put("packageName", first.activityInfo.packageName);
            result.put("appName", first.loadLabel(pm).toString());
            result.put("isWps", false);
            result.put("useExplicitPackage", false);
            Log.i(TAG, "Resolved to: " + first.activityInfo.packageName);
        }

        return result;
    }

    public boolean isWpsInstalled() {
        PackageManager pm = context.getPackageManager();
        for (String pkg : WPS_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return true;
            } catch (PackageManager.NameNotFoundException e) {
                // continue
            }
        }
        return false;
    }

    public String getWpsPackageName() {
        PackageManager pm = context.getPackageManager();
        for (String pkg : WPS_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return pkg;
            } catch (PackageManager.NameNotFoundException e) {
                // continue
            }
        }
        return null;
    }

    private ResolveInfo findWpsApp(List<ResolveInfo> activities) {
        for (ResolveInfo ri : activities) {
            String pkg = ri.activityInfo.packageName;
            for (String wpsPkg : WPS_PACKAGES) {
                if (pkg.equals(wpsPkg) || pkg.startsWith(WPS_PACKAGE_PREFIX)) {
                    return ri;
                }
            }
        }
        return null;
    }

    public static String getMimeType(String fileName) {
        String extension = getFileExtension(fileName);
        if (extension == null || extension.isEmpty()) {
            return "*/*";
        }
        switch (extension.toLowerCase()) {
            case "doc": return "application/msword";
            case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case "xls": return "application/vnd.ms-excel";
            case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            case "ppt": return "application/vnd.ms-powerpoint";
            case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            case "pdf": return "application/pdf";
            case "txt": return "text/plain";
            case "csv": return "text/csv";
            case "rtf": return "application/rtf";
            case "odt": return "application/vnd.oasis.opendocument.text";
            case "ods": return "application/vnd.oasis.opendocument.spreadsheet";
            case "odp": return "application/vnd.oasis.opendocument.presentation";
            case "html": return "text/html";
            case "htm": return "text/html";
            case "xml": return "application/xml";
            case "json": return "application/json";
            case "zip": return "application/zip";
            case "rar": return "application/x-rar-compressed";
            case "7z": return "application/x-7z-compressed";
            case "jpg": return "image/jpeg";
            case "jpeg": return "image/jpeg";
            case "png": return "image/png";
            case "gif": return "image/gif";
            case "bmp": return "image/bmp";
            case "svg": return "image/svg+xml";
            case "mp4": return "video/mp4";
            case "mp3": return "audio/mpeg";
            default: return "*/*";
        }
    }

    private static String getFileExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot > 0 && lastDot < fileName.length() - 1) {
            return fileName.substring(lastDot + 1);
        }
        return "";
    }
}