package com.pad2.filemanager.update;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.content.FileProvider;

import java.io.File;

public class InstallTrigger {
    private static final String TAG = "InstallTrigger";

    public static boolean triggerInstall(Context context, String localPath) {
        File apkFile = new File(localPath);
        if (!apkFile.exists()) {
            Log.e(TAG, "APK file not found: " + localPath);
            return false;
        }
        try {
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            Log.i(TAG, "Install intent launched for: " + localPath);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "triggerInstall failed: " + e.getMessage());
            return false;
        }
    }
}